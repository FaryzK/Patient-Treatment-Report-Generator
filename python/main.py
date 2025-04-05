import asyncio
import json
import os
import sys
from image_processor import ImageProcessor
from ppt_generator import PPTGenerator

async def process_images(image_paths, output_dir):
    """Process images and generate a PowerPoint presentation."""
    print(f"Processing {len(image_paths)} images")
    print(f"Output directory: {output_dir}")
    try:
        # Initialize processors
        image_processor = ImageProcessor()
        ppt_generator = PPTGenerator()
        
        # Process images to get metadata
        print("Extracting metadata and classifying images...")
        processed_images = image_processor.process_images(image_paths)
        print(f"Processed {len(processed_images)} images")
        
        # Group images by category
        categorized_images = {
            'front_with_teeth': [],
            'front_no_teeth': [],
            'side_view': [],
            'intra_oral': [],
            'unknown': []
        }
        
        for image in processed_images:
            category = image['category']
            categorized_images[category].append(image)
            print(f"Image {image['filename']} classified as {image['category_label']} ({category})")
        
        # Print category counts
        for category, images in categorized_images.items():
            print(f"{category}: {len(images)} images")
        
        # Generate PowerPoint presentation
        print("Generating PowerPoint presentation...")
        output_path = os.path.join(output_dir, 'treatment_report.pptx')
        ppt_generator.generate_presentation(categorized_images, output_path)
        print(f"Presentation saved to: {output_path}")
        
        return {
            'status': 'success',
            'output_path': output_path,
            'categories': {
                category: len(images)
                for category, images in categorized_images.items()
            }
        }
    except Exception as e:
        print(f"Error in process_images: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'status': 'error',
            'error': str(e)
        }

if __name__ == '__main__':
    # This will be used when running as a standalone script
    print("Python script started")
    print(f"Arguments: {sys.argv}")
    
    if len(sys.argv) < 3:
        print("Usage: python main.py <image_paths_json> <output_dir>")
        sys.exit(1)
    
    # Read image paths from JSON file
    json_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    print(f"Reading image paths from: {json_path}")
    with open(json_path, 'r') as f:
        image_paths = json.load(f)
    
    print(f"Found {len(image_paths)} image paths")
    print(f"Output directory: {output_dir}")
    
    # Process images
    result = asyncio.run(process_images(image_paths, output_dir))
    print(f"Result: {result}")
    print(json.dumps(result)) 