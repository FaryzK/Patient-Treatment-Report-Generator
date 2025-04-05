from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from PIL import Image
import os
from datetime import datetime

class PPTGenerator:
    def __init__(self):
        self.prs = Presentation()
        self.slide_width = 13.333
        self.slide_height = 7.5
        self.margin = 0.5
        self.grid_spacing = 0.25

    def _create_title_slide(self, title="Patient Treatment Report"):
        """Create the title slide."""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[0])
        title_shape = slide.shapes.title
        subtitle_shape = slide.placeholders[1]
        
        title_shape.text = title
        subtitle_shape.text = "Generated on " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _create_image_grid_slide(self, images, category_title):
        """Create a slide with a 2x2 grid of images."""
        slide = self.prs.slides.add_slide(self.prs.slide_layouts[6])  # Blank layout
        
        # Add category title
        title_box = slide.shapes.add_textbox(
            Inches(self.margin),
            Inches(self.margin),
            Inches(self.slide_width - 2 * self.margin),
            Inches(0.5)
        )
        title_frame = title_box.text_frame
        title_frame.text = category_title
        title_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
        title_frame.paragraphs[0].font.size = Pt(24)
        title_frame.paragraphs[0].font.bold = True

        # Calculate image dimensions for 2x2 grid
        img_width = (self.slide_width - 2 * self.margin - self.grid_spacing) / 2
        img_height = (self.slide_height - 2 * self.margin - self.grid_spacing - 0.5) / 2

        # Add images to the grid
        for idx, image_data in enumerate(images):
            if idx >= 4:  # Maximum 4 images per slide
                break
                
            row = idx // 2
            col = idx % 2
            
            left = self.margin + col * (img_width + self.grid_spacing)
            top = self.margin + 0.5 + row * (img_height + self.grid_spacing)
            
            # Add the image
            slide.shapes.add_picture(
                image_data['path'],
                Inches(left),
                Inches(top),
                Inches(img_width),
                Inches(img_height)
            )
            
            # Add image label with date
            label_box = slide.shapes.add_textbox(
                Inches(left),
                Inches(top + img_height + 0.1),
                Inches(img_width),
                Inches(0.3)
            )
            label_frame = label_box.text_frame
            label_frame.text = f"{image_data['filename']} - {image_data['date']}"
            label_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
            label_frame.paragraphs[0].font.size = Pt(10)

    def generate_presentation(self, categorized_images, output_path):
        """Generate a PowerPoint presentation from categorized images."""
        # Create title slide
        self._create_title_slide()
        
        # Create slides for each category
        for category, images in categorized_images.items():
            if not images:
                continue
                
            # Sort images by creation date and time
            sorted_images = sorted(
                images,
                key=lambda x: x['metadata'].get('creation_date', datetime.min)
            )
            
            # Create slides with 4 images each
            for i in range(0, len(sorted_images), 4):
                slide_images = sorted_images[i:i+4]
                self._create_image_grid_slide(
                    slide_images,
                    images[0]['category_label'] if images else category.replace('_', ' ').title()
                )
        
        # Save the presentation
        self.prs.save(output_path)
        return output_path

    def _resize_image(self, image_path, max_size=(1920, 1080)):
        """Resize an image while maintaining aspect ratio."""
        with Image.open(image_path) as img:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            return img 