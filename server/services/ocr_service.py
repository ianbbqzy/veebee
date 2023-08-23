import io
import re
import base64
import concurrent.futures
from PIL import Image
from manga_ocr import MangaOcr
from google.cloud import vision

class OCRService:
    def __init__(self):
        self.mocr = MangaOcr(pretrained_model_name_or_path='./model')
        print("using mocr!!!!!!!!!!!")

        self.client = vision.ImageAnnotatorClient()

    def annotate_image(self, image_data_url, source_lang):
        if source_lang == "Japanese":
            return self.annotate_image_manga_ocr(image_data_url)
        elif source_lang == "Korean" or source_lang == "Chinese":
            return self.annotate_image_google_vision(image_data_url, source_lang)
        else:
            raise ValueError("Not Supported")

    def annotate_image_google_vision(self, image_data_url, source_lang):
        image_content = base64.b64decode(image_data_url.split(',')[1])
        image = vision.Image(content=image_content)

        response = self.client.text_detection(image=image)
        texts = response.text_annotations
        text = texts[0].description if len(texts) > 0 else ''

        print(text)
        if source_lang == "Japanese" or source_lang == "Chinese":
            text = text.replace("\n", "")
        else:
            text = text.replace("\n", " ")

        return text

    def annotate_image_manga_ocr(self, image_data_url):
        # Extract the base64-encoded image data from the URL
        image_data = re.sub('^data:image/.+;base64,', '', image_data_url)

        # Decode the base64-encoded image data
        decoded_image_data = io.BytesIO(base64.b64decode(image_data))

        # Open the image using PIL
        image = Image.open(decoded_image_data)

        text = self.mocr(image)
        return text
    
    def annotate_multiple_images(self, image_url, image_dim, bounding_boxes, suource_lang):
        """
        Extract and translate text from bounding boxes.
        
        :param image_url: URL of the image.
        :param image_dim: Dimensions of the image (width, height).
        :param bounding_boxes: List of bounding boxes.
        :return: List of dictionaries with original text, translated text, and adjusted bounding box coordinates.
        """
        results = []
        
        if bounding_boxes is None:
            bounding_boxes = [[0, 0, 1, 1]]

        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = []
            for i, box in enumerate(bounding_boxes):
                futures.append(executor.submit(self.process_box, box, image_dim, image_url, i, source_lang))
            for future in concurrent.futures.as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    raise e  # Raise the exception instead of just printing an error message
        return results

    def process_box(self, box, image_dim, image_url, i, source_lang):
        # Convert bounding box to pixel values
        pixel_box = convert_box_to_pixel_values(box, image_dim)

        # Construct new image URL (this depends on how your system expects URLs to be formed)
        box_image_url = crop_image_data_url(image_url, pixel_box[0], pixel_box[1], pixel_box[2], pixel_box[3], img_dim=image_dim)

        save_data_url_to_file(box_image_url, f'test{str(i)}.png')   
        # Extract text from the cropped image using the bounding box
        original_text = self.annotate_image(box_image_url, source_lang=source_lang)

        return {
            'original': original_text,
            'bounding_box': [pixel_box[0], pixel_box[1], pixel_box[2]- pixel_box[0], pixel_box[3] - pixel_box[1]],
        }

def save_data_url_to_file(data_url, file_path):
    # Extract the base64 encoded part of the data URL
    base64_data = re.sub('^data:image/.+;base64,', '', data_url)

    # Decode the base64 data
    image_data = base64.b64decode(base64_data)

    # Save to a file
    with open(file_path, 'wb') as file:
        file.write(image_data)

def convert_box_to_pixel_values(box, image_dim):
    """
    Convert normalized bounding box coordinates to pixel values.

    :param box: Normalized bounding box coordinates.
    :param image_dim: Dimensions of the image (width, height).
    :return: Bounding box in pixel values.
    """
    center_x, center_y, width, height = box
    image_width, image_height = image_dim
    print("coordinates",image_width, image_height)

    pixel_center_x = center_x * image_width
    pixel_center_y = center_y * image_height
    pixel_width = width * image_width
    pixel_height = height * image_height

    # Calculate top-left and bottom-right pixel coordinates
    x1 = pixel_center_x - (pixel_width / 2)
    y1 = pixel_center_y - (pixel_height / 2)
    x2 = pixel_center_x + (pixel_width / 2)
    y2 = pixel_center_y + (pixel_height / 2)

    return int(x1), int(y1), int(x2), int(y2)

def crop_image_data_url(data_url, left, upper, right, lower, img_dim):
    # Extract the base64 encoded part of the data URL
    base64_data = data_url.split(",")[1]

    # Step 1: Decode the data URL to get the image
    image_data = base64.b64decode(base64_data)
    img = Image.open(io.BytesIO(image_data))

    print(left, upper, right, lower)
    pillow_width, pillow_height = img.size
    image_width, image_height = img_dim
    ratio = pillow_width / image_width
    # Step 2: Crop the image
    cropped_img = img.crop((int(left * ratio), int(upper * ratio), int(right * ratio), int(lower * ratio)))

    # Step 3: Convert the cropped image back into a data URL
    buffer = io.BytesIO()
    cropped_img.save(buffer, format="PNG")  # Assuming PNG format, adjust if needed
    base64_cropped = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return "data:image/png;base64," + base64_cropped  # Adjust MIME type if needed