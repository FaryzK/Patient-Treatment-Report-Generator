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

// Remove or modify the static file serving
app.use('/reports', (req, res, next) => {
  if (req.path.endsWith('.pptx')) {
    // Skip static serving for PPTX files
    return next('route');
  }
  next();
}, express.static(path.join(__dirname, 'reports')));

// Add dedicated download endpoint with proper binary handling
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Validate filename to prevent directory traversal
  if (!filename || filename.includes('..') || !filename.endsWith('.pptx')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(__dirname, 'reports', filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set headers for binary file download
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Transfer-Encoding', 'binary');
  res.setHeader('Cache-Control', 'no-cache');

  // Create read stream with error handling
  const fileStream = fs.createReadStream(filePath);
  
  fileStream.on('error', (error) => {
    console.error('Error streaming file:', error);
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error streaming file' });
    }
  });

  // Pipe the file stream to response with error handling
  fileStream.pipe(res).on('error', (error) => {
    console.error('Error piping file:', error);
  });
});

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

// Store progress information
const progressStore = new Map();

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

// SSE endpoint for progress updates
app.get('/api/progress', (req, res) => {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  };
  res.writeHead(200, headers);

  // Send initial message to establish connection
  res.write('data: {"currentStep": "Connecting...", "stepProgress": 0, "totalFiles": 0, "processedFiles": 0, "details": "Establishing connection..."}\n\n');

  const clientId = Date.now().toString();
  progressStore.set(clientId, res);

  req.on('close', () => {
    progressStore.delete(clientId);
  });
});

// Helper function to send progress updates
const sendProgress = (data) => {
  progressStore.forEach((res) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('Error sending progress update:', err);
    }
  });
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
    const totalFiles = req.files.length;

    // Update progress: Upload complete
    sendProgress({
      currentStep: 'Files uploaded',
      stepProgress: 100,
      totalFiles,
      processedFiles: totalFiles,
      details: 'All files uploaded successfully'
    });

    // Get the file paths
    const filePaths = req.files.map(file => file.path);
    console.log('File paths:', filePaths);

    // Create a temporary JSON file with the image paths
    const jsonPath = path.join(__dirname, 'temp_paths.json');
    fs.writeFileSync(jsonPath, JSON.stringify(filePaths));
    console.log('Created temporary JSON file:', jsonPath);

    // Run the Python script
    console.log('Spawning Python process...');
    
    try {
      const pythonPath = getPythonPath();
      const pythonProcess = spawn(pythonPath, [
        path.join(__dirname, '../python/main.py'),
        jsonPath,
        reportsDir
      ]);

      // Store the process
      activeProcesses.set(processId, pythonProcess);

      let result = '';
      let processedImages = 0;

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Python stdout:', output);
        result += output;

        // Parse progress information from Python output
        if (output.includes('Processing image')) {
          const match = output.match(/Processing image (\d+) of (\d+)/);
          if (match) {
            const [_, current, total] = match;
            processedImages = parseInt(current);
            sendProgress({
              currentStep: 'Analyzing Images',
              stepProgress: Math.round((processedImages / totalFiles) * 100),
              totalFiles,
              processedFiles: processedImages,
              details: `Analyzing image ${processedImages} of ${totalFiles}`
            });
          }
        } else if (output.includes('classified as')) {
          const match = output.match(/Image \d+ classified as (.+)/);
          if (match) {
            const [_, category] = match;
            sendProgress({
              currentStep: 'Analyzing Images',
              stepProgress: Math.round((processedImages / totalFiles) * 100),
              totalFiles,
              processedFiles: processedImages,
              details: `Last image classified as: ${category}`
            });
          }
        } else if (output.includes('Generating PowerPoint')) {
          sendProgress({
            currentStep: 'Creating Presentation',
            stepProgress: 90,
            totalFiles,
            processedFiles: totalFiles,
            details: 'Generating PowerPoint presentation with processed images'
          });
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString());
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
        
        // Clean up
        cleanupPythonProcess(processId);
        try {
          fs.unlinkSync(jsonPath);
          console.log('Temporary JSON file deleted');
        } catch (err) {
          console.error('Error deleting temporary file:', err);
        }

        if (code !== 0) {
          sendProgress({
            currentStep: 'Error',
            stepProgress: 100,
            totalFiles,
            processedFiles: processedImages,
            details: 'An error occurred during processing'
          });
          return res.status(500).json({ error: 'Python processing failed' });
        }

        try {
          const jsonLine = result.split('\n')
            .filter(line => line.trim())
            .reverse()
            .find(line => line.trim().startsWith('{') && line.trim().endsWith('}'));

          if (!jsonLine) {
            throw new Error('No JSON output found in Python response');
          }

          const output = JSON.parse(jsonLine);
          
          if (output.status === 'success') {
            // Add download URL using the new endpoint
            const filename = path.basename(output.output_path);
            output.download_url = `/api/download/${filename}`;
            
            sendProgress({
              currentStep: 'Complete',
              stepProgress: 100,
              totalFiles,
              processedFiles: totalFiles,
              details: 'Processing complete! PowerPoint presentation generated.'
            });
            
            // Add a small delay before sending response to ensure file is fully written
            setTimeout(() => {
              res.json(output);
            }, 500);
          } else {
            throw new Error(output.error || 'Processing failed');
          }
        } catch (e) {
          console.error('Error parsing Python output:', e);
          sendProgress({
            currentStep: 'Error',
            stepProgress: 100,
            totalFiles,
            processedFiles: processedImages,
            details: 'Error processing Python output'
          });
          res.status(500).json({ error: 'Error processing Python output: ' + e.message });
        }
      });

    } catch (err) {
      console.error('Error running Python:', err);
      sendProgress({
        currentStep: 'Error',
        stepProgress: 100,
        totalFiles,
        processedFiles: 0,
        details: 'Error running Python process'
      });
      res.status(500).json({ error: 'Error running Python process' });
    }

  } catch (error) {
    console.error('Upload error:', error);
    sendProgress({
      currentStep: 'Error',
      stepProgress: 100,
      totalFiles: req.files?.length || 0,
      processedFiles: 0,
      details: 'Error during upload process'
    });
    res.status(500).json({ error: 'Error uploading files' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});