# Patient Treatment Report Generator

A monorepo application that processes dental treatment images, classifies them, and generates PowerPoint reports.

## Project Structure

```
patient-treatment-report-generator/
├── api/                  # Backend API (Express)
│   ├── index.js          # Main API server
│   └── uploads/          # Uploaded images storage
└── client/               # Frontend (React + Vite)
    ├── src/
    │   ├── components/   # React components
    │   ├── App.jsx       # Main application
    │   └── main.jsx      # Entry point
    └── package.json      # Frontend dependencies
```

## Features

- Image upload with drag-and-drop functionality
- Image classification into categories:
  - Front-view with teeth
  - Front-view with no teeth
  - Side-view of jaw
  - Intra-oral
- Chronological ordering of images
- PowerPoint report generation with 2×2 image grids

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/FaryzK/Patient-Treatment-Report-Generator.git
   cd Patient-Treatment-Report-Generator
   ```

2. Install dependencies:
   ```
   npm run install:all
   ```

### Running the Application

#### Development Mode

Run both frontend and backend concurrently:
```
npm run dev
```

Or run them separately:

- Backend only:
  ```
  npm run dev:api
  ```

- Frontend only:
  ```
  npm run dev:client
  ```

#### Production Mode

1. Build the frontend:
   ```
   cd client && npm run build
   ```

2. Start the backend server:
   ```
   npm start
   ```

## API Endpoints

- `POST /api/upload`: Upload images for processing
  - Accepts multiple image files
  - Returns file information on success

## Technologies Used

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express
- **File Processing**: Multer
- **Image Classification**: OpenAI API (planned)
- **Report Generation**: python-pptx (planned)

## License

ISC 