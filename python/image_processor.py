import os
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS
import openai
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from root directory
root_dir = Path(__file__).parent.parent
load_dotenv(root_dir / '.env')

# Configure OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')

class ImageProcessor:
    def __init__(self):
        self.categories = {
            'front_with_teeth': 'Front view with teeth visible',
            'front_no_teeth': 'Front view without teeth visible',
            'side_view': 'Side view of jaw',
            'intra_oral': 'Intra-oral view'
        }

    def extract_metadata(self, image_path):
        """Extract metadata from an image file."""
        try:
            with Image.open(image_path) as img:
                # Get basic image info
                metadata = {
                    'filename': os.path.basename(image_path),
                    'size': img.size,
                    'format': img.format,
                    'mode': img.mode,
                    'creation_date': None
                }

                # Try to get EXIF data
                if hasattr(img, '_getexif') and img._getexif():
                    exif = img._getexif()
                    for tag_id in exif:
                        tag = TAGS.get(tag_id, tag_id)
                        data = exif.get(tag_id)
                        
                        # Look for creation date
                        if tag == 'DateTimeOriginal':
                            try:
                                metadata['creation_date'] = datetime.strptime(
                                    data, '%Y:%m:%d %H:%M:%S'
                                )
                            except ValueError:
                                pass

                # If no creation date found, use file modification time
                if not metadata['creation_date']:
                    metadata['creation_date'] = datetime.fromtimestamp(
                        os.path.getmtime(image_path)
                    )

                return metadata
        except Exception as e:
            print(f"Error extracting metadata from {image_path}: {str(e)}")
            return None

    async def classify_image(self, image_path):
        """Classify an image using OpenAI's API."""
        try:
            # Read the image file
            with open(image_path, "rb") as image_file:
                # Create a chat completion with the image
                response = await openai.ChatCompletion.acreate(
                    model="gpt-4-vision-preview",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Please classify this dental image into one of these categories:\n"
                                           "1. Front view with teeth visible\n"
                                           "2. Front view without teeth visible\n"
                                           "3. Side view of jaw\n"
                                           "4. Intra-oral view\n\n"
                                           "Respond with just the category number (1-4)."
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{image_file.read()}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=10
                )

                # Extract the classification from the response
                classification = int(response.choices[0].message.content.strip())
                
                # Map the classification number to the category
                category_map = {
                    1: 'front_with_teeth',
                    2: 'front_no_teeth',
                    3: 'side_view',
                    4: 'intra_oral'
                }
                
                return category_map.get(classification, 'unknown')
        except Exception as e:
            print(f"Error classifying image {image_path}: {str(e)}")
            return 'unknown'

    def process_images(self, image_paths):
        """Process a list of images and return their classifications and metadata."""
        results = []
        
        for image_path in image_paths:
            metadata = self.extract_metadata(image_path)
            if metadata:
                results.append({
                    'path': image_path,
                    'metadata': metadata,
                    'category': None  # Will be filled by classify_image
                })
        
        return results 