import os
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS
import openai
from dotenv import load_dotenv
from pathlib import Path
import base64

# Load environment variables from root directory
root_dir = Path(__file__).parent.parent
load_dotenv(root_dir / '.env')

# Configure OpenAI
client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

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

    def classify_image(self, image_path):
        """Classify an image using OpenAI's API."""
        try:
            # Read the image file and convert to base64
            with open(image_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Detect image format
            img_format = Image.open(image_path).format.lower()
            image_mime = f"image/{'jpeg' if img_format == 'jpg' else img_format}"

            # Create a response with the image
            response = client.responses.create(
                model="gpt-4o",
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Please classify this dental image into one of the following 4 categories. Focus on the angle of the head, presence of teeth, and whether the image is inside the mouth.\n\n"
                                       "1. Front View with Teeth Visible\n"
                                       "- Full face visible from the front.\n"
                                       "- The patient is smiling and teeth are clearly seen.\n\n"
                                       "2. Front View without Teeth Visible\n"
                                       "- Full face visible from the front.\n"
                                       "- Lips are closed or in a relaxed expression. No teeth are shown.\n\n"
                                       "3. Side View of Jaw\n"
                                       "- The image shows the patient's face from the side (profile view).\n"
                                       "- Head is turned sideways. The outline of the jaw is visible.\n\n"
                                       "4. Intra-Oral View\n"
                                       "- The image is taken inside the mouth.\n"
                                       "- Shows teeth, gums, and oral structures from close-up.\n\n"
                                       "Respond only with a number (1-4)."
                            },
                            {
                                "type": "input_image",
                                "image_url": f"data:{image_mime};base64,{base64_image}",
                                "detail": "high"
                            }
                        ]
                    }
                ]
            )

            # Extract the classification from the response
            classification = int(response.output_text.strip())
            
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