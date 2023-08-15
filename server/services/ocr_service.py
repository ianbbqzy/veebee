import io
import re
import base64
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