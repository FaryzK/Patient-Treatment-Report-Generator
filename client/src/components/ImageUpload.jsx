import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

const ImageUpload = () => {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processStatus, setProcessStatus] = useState({
    currentStep: '',
    stepProgress: 0,
    totalFiles: 0,
    processedFiles: 0,
    details: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  // Clean up previews when component unmounts
  useEffect(() => {
    return () => {
      previews.forEach(preview => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  const onDrop = useCallback((acceptedFiles) => {
    const imageFiles = acceptedFiles.filter(file => 
      file.type.startsWith('image/')
    );
    
    const newFiles = imageFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file
    }));
    
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
    setError(null);
    setSuccess(null);

    const newPreviews = newFiles.map(fileObj => ({
      id: fileObj.id,
      url: URL.createObjectURL(fileObj.file)
    }));
    setPreviews(prevPreviews => [...prevPreviews, ...newPreviews]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png']
    },
    multiple: true
  });

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one image');
      return;
    }

    let eventSource = null;
    setUploading(true);
    setDownloadUrl(null);
    setProcessStatus({
      currentStep: 'Preparing Upload',
      stepProgress: 0,
      totalFiles: files.length,
      processedFiles: 0,
      details: 'Starting upload...'
    });
    setError(null);
    setSuccess(null);

    try {
      // Set up SSE connection first
      eventSource = new EventSource('/api/progress');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Progress update:', data);
          setProcessStatus(data);
          
          if (data.currentStep === 'Complete' || data.currentStep === 'Error') {
            eventSource.close();
          }
        } catch (err) {
          console.error('Error parsing SSE message:', err);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
      };

      // Prepare form data
      const formData = new FormData();
      files.forEach(fileObj => {
        formData.append('images', fileObj.file);
      });

      // Send upload request
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      console.log('Upload response:', data);
      
      if (data.status === 'success') {
        setSuccess(`Successfully processed ${files.length} images! PowerPoint presentation is ready for download.`);
        setDownloadUrl(data.download_url);
        
        // Clean up previews and files
        previews.forEach(preview => URL.revokeObjectURL(preview.url));
        setFiles([]);
        setPreviews([]);
      } else {
        throw new Error(data.error || 'Processing failed');
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      if (eventSource) {
        eventSource.close();
      }
      setUploading(false);
    }
  };

  const removeFile = (id) => {
    const preview = previews.find(p => p.id === id);
    if (preview) {
      URL.revokeObjectURL(preview.url);
    }
    
    setFiles(prevFiles => prevFiles.filter(f => f.id !== id));
    setPreviews(prevPreviews => prevPreviews.filter(p => p.id !== id));
  };

  // Helper function to render progress details
  const renderProgressDetails = () => {
    if (!processStatus.currentStep) return null;

    const progress = processStatus.stepProgress;
    const progressBarWidth = progress + '%';

    return (
      <div className="mt-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">
            {processStatus.currentStep}
          </span>
          <span className="text-sm text-gray-500">
            {processStatus.processedFiles} / {processStatus.totalFiles} files
          </span>
        </div>
        <div className="relative pt-1">
          <div className="overflow-hidden h-2 text-xs flex rounded bg-blue-200">
            <div
              style={{ width: progressBarWidth }}
              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-300"
            />
          </div>
        </div>
        {processStatus.details && (
          <p className="text-sm text-gray-600 italic">
            {processStatus.details}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}
      >
        <input {...getInputProps()} />
        <div className="space-y-2">
          <svg 
            className="mx-auto h-12 w-12 text-gray-400" 
            stroke="currentColor" 
            fill="none" 
            viewBox="0 0 48 48" 
            aria-hidden="true"
          >
            <path 
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" 
              strokeWidth={2} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          </svg>
          <div className="text-gray-600">
            {isDragActive ? (
              <p>Drop the images here...</p>
            ) : (
              <p>Drag and drop images here, or click to select files</p>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Supported formats: JPEG, PNG
          </p>
        </div>
      </div>

      {/* Image Previews */}
      {files.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Images</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {files.map((fileObj) => {
              const preview = previews.find(p => p.id === fileObj.id);
              return (
                <div key={fileObj.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img 
                      src={preview?.url} 
                      alt={fileObj.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(fileObj.id);
                      }}
                      className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                      aria-label="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 truncate">
                    {fileObj.file.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Progress Status */}
      {renderProgressDetails()}

      {/* Success Message and Download Button */}
      {success && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-green-100 text-green-700 rounded-md">
            {success}
          </div>
          {downloadUrl && (
            <div className="flex justify-center">
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download PowerPoint
              </a>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {/* Upload Button */}
      <div className="mt-6">
        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
            ${uploading || files.length === 0 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {uploading ? 'Processing...' : 'Upload Images'}
        </button>
      </div>
    </div>
  );
};

export default ImageUpload; 