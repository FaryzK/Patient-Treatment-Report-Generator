import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Enable CORS for the frontend
app.use(cors());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    // Generate a unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create reports directory if it doesn't exist
const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Keep track of active Python processes
const activeProcesses = new Map();

// Cleanup function for Python processes
const cleanupPythonProcess = (processId) => {
  const process = activeProcesses.get(processId);
  if (process) {
    try {
      process.kill();
    } catch (err) {
      console.error('Error killing Python process:', err);
    }
    activeProcesses.delete(processId);
  }
};

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up...');
  for (const [processId] of activeProcesses) {
    cleanupPythonProcess(processId);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up...');
  for (const [processId] of activeProcesses) {
    cleanupPythonProcess(processId);
  }
  process.exit(0);
});

// Get the Python executable path from the virtual environment
const getPythonPath = () => {
  const venvPath = path.join(__dirname, '..', 'venv');
  const isWindows = process.platform === 'win32';
  const pythonPath = isWindows 
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python3');
  
  console.log('Using Python path:', pythonPath);
  return pythonPath;
};

// API endpoint for file upload
app.post('/api/upload', upload.array('images', 10), async (req, res) => {
  console.log('Upload request received');
  const processId = Date.now().toString();
  
  try {
    if (!req.files || req.files.length === 0) {
      console.log('No files uploaded');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`Received ${req.files.length} files`);

    // Get the file paths
    const filePaths = req.files.map(file => file.path);
    console.log('File paths:', filePaths);

    // Create a temporary JSON file with the image paths
    const jsonPath = path.join(__dirname, 'temp_paths.json');
    fs.writeFileSync(jsonPath, JSON.stringify(filePaths));
    console.log('Created temporary JSON file:', jsonPath);

    // Run the Python script
    console.log('Spawning Python process...');
    
    // First, check if Python is available
    try {
      const pythonPath = getPythonPath();
      const pythonCheck = spawn(pythonPath, ['--version']);
      pythonCheck.on('close', (code) => {
        if (code !== 0) {
          console.error('Python is not available');
          // Return success without Python processing
          res.status(200).json({
            message: 'Files uploaded successfully (Python processing skipped)',
            files: req.files.map(file => ({
              filename: file.filename,
              path: file.path,
              size: file.size,
              mimetype: file.mimetype
            }))
          });
          
          // Clean up the temporary JSON file
          try {
            fs.unlinkSync(jsonPath);
            console.log('Temporary JSON file deleted');
          } catch (err) {
            console.error('Error deleting temporary file:', err);
          }
          return;
        }
        
        // Python is available, proceed with processing
        const pythonProcess = spawn(pythonPath, [
          path.join(__dirname, '../python/main.py'),
          jsonPath,
          reportsDir
        ]);

        // Store the process
        activeProcesses.set(processId, pythonProcess);

        let result = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => {
          console.log('Python stdout:', data.toString());
          result += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          console.error('Python stderr:', data.toString());
          error += data.toString();
        });

        pythonProcess.on('close', (code) => {
          console.log(`Python process exited with code ${code}`);
          
          // Clean up the process
          cleanupPythonProcess(processId);
          
          // Clean up the temporary JSON file
          try {
            fs.unlinkSync(jsonPath);
            console.log('Temporary JSON file deleted');
          } catch (err) {
            console.error('Error deleting temporary file:', err);
          }

          if (code !== 0) {
            console.error('Python process error:', error);
            // Return success with a warning about Python processing
            res.status(200).json({
              message: 'Files uploaded successfully (Python processing failed)',
              files: req.files.map(file => ({
                filename: file.filename,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
              })),
              warning: 'Python processing failed: ' + error
            });
            return;
          }

          try {
            console.log('Parsing Python output:', result);
            const output = JSON.parse(result);
            if (output.status === 'error') {
              console.error('Python returned error:', output.error);
              // Return success with a warning about Python processing
              res.status(200).json({
                message: 'Files uploaded successfully (Python processing failed)',
                files: req.files.map(file => ({
                  filename: file.filename,
                  path: file.path,
                  size: file.size,
                  mimetype: file.mimetype
                })),
                warning: 'Python processing failed: ' + output.error
              });
              return;
            }

            // Return the file information and the path to the generated PPT
            console.log('Sending success response');
            res.status(200).json({
              message: 'Files processed successfully',
              files: req.files.map(file => ({
                filename: file.filename,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
              })),
              report: {
                path: output.output_path,
                categories: output.categories
              }
            });
          } catch (e) {
            console.error('Error parsing Python output:', e);
            console.error('Raw output:', result);
            // Return success with a warning about Python processing
            res.status(200).json({
              message: 'Files uploaded successfully (Python processing failed)',
              files: req.files.map(file => ({
                filename: file.filename,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype
              })),
              warning: 'Error processing Python output: ' + e.message
            });
          }
        });

        // Handle client disconnect
        req.on('close', () => {
          console.log('Client disconnected, cleaning up Python process');
          cleanupPythonProcess(processId);
          try {
            fs.unlinkSync(jsonPath);
            console.log('Temporary JSON file deleted');
          } catch (err) {
            console.error('Error deleting temporary file:', err);
          }
        });
      });
    } catch (err) {
      console.error('Error checking Python:', err);
      // Return success without Python processing
      res.status(200).json({
        message: 'Files uploaded successfully (Python check failed)',
        files: req.files.map(file => ({
          filename: file.filename,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype
        }))
      });
      
      // Clean up the temporary JSON file
      try {
        fs.unlinkSync(jsonPath);
        console.log('Temporary JSON file deleted');
      } catch (err) {
        console.error('Error deleting temporary file:', err);
      }
    }
  } catch (error) {
    console.error('Upload error:', error);
    // Clean up if there's an error
    cleanupPythonProcess(processId);
    res.status(500).json({ error: 'Error uploading files' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});