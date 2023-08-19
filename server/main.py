import base64
from io import BytesIO
from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
from flask import request, jsonify
import firebase_admin
from firebase_admin import auth, credentials
from PIL import Image
from requests import exceptions
from dotenv import load_dotenv
from services.users_service import UsersService
from services.ocr_service import OCRService
from services.translation_service import TranslationService
from services.audio_service import AudioService  # Add import for the new service
import os
from comic_text_detector.inference import model2annotations
import re

def save_data_url_to_file(data_url, file_path):
    # Extract the base64 encoded part of the data URL
    base64_data = re.sub('^data:image/.+;base64,', '', data_url)

    # Decode the base64 data
    image_data = base64.b64decode(base64_data)

    # Save to a file
    with open(file_path, 'wb') as file:
        file.write(image_data)

load_dotenv()
hard_limit = 1000

# Initialize Firebase Admin SDK with your service account credentials
cred = credentials.Certificate('firebaseServiceAccountKey.json')
firebase_admin.initialize_app(cred)

# Decorator function to authenticate API requests
def authenticate(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Get the authorization header from the request
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({'error': 'Unauthorized'}), 401
        
        try:
            # Extract the ID token from the authorization header
            id_token = auth_header.split(' ')[1]
            
            # Verify the ID token using Firebase Authentication
            decoded_token = auth.verify_id_token(id_token, check_revoked=True)
            
            # Add the user's UID to the request context
            kwargs['user_id'] = decoded_token['uid']
            
            return func(*args, **kwargs)
        except (auth.InvalidIdTokenError, IndexError, ValueError, exceptions.RequestException) as e:
            print(e)
            return jsonify({'error': 'Token might have expired. Please sign in again.'}), 401
    
    return wrapper

# Replace with your actual keys

app = Flask(__name__)
CORS(app)
users_service = UsersService(hard_limit=hard_limit)
ocr_service = OCRService()
translation_serivce = TranslationService(os.getenv("OPENAI_API_KEY"), os.getenv("DEEPL_API_KEY"))
audio_service = AudioService()  # Initialize the new service

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
    img = Image.open(BytesIO(image_data))

    print(left, upper, right, lower)
    pillow_width, pillow_height = img.size
    image_width, image_height = img_dim
    ratio = pillow_width / image_width
    # Step 2: Crop the image
    cropped_img = img.crop((int(left * ratio), int(upper * ratio), int(right * ratio), int(lower * ratio)))

    # Step 3: Convert the cropped image back into a data URL
    buffer = BytesIO()
    cropped_img.save(buffer, format="PNG")  # Assuming PNG format, adjust if needed
    base64_cropped = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return "data:image/png;base64," + base64_cropped  # Adjust MIME type if needed


def extract_and_translate(image_url, source_lang, target_lang, image_dim, offset, bounding_boxes):
    """
    Extract and translate text from bounding boxes.
    
    :param image_url: URL of the image.
    :param source_lang: Source language of the text in the image.
    :param target_lang: Target language for the translation.
    :param image_dim: Dimensions of the image (width, height).
    :param offset: Offset of the image compared to the browser viewport (offset_x, offset_y).
    :param bounding_boxes: List of bounding boxes.
    :return: List of dictionaries with original text, translated text, and adjusted bounding box coordinates.
    """
    results = []
    
    if bounding_boxes is None:
        bounding_boxes = [[0, 0, 1, 1]]

    for i, box in enumerate(bounding_boxes):
        # Convert bounding box to pixel values
        pixel_box = convert_box_to_pixel_values(box, image_dim)
        
        # Construct new image URL (this depends on how your system expects URLs to be formed)
        box_image_url = crop_image_data_url(image_url, pixel_box[0], pixel_box[1], pixel_box[2], pixel_box[3], img_dim=image_dim)

        save_data_url_to_file(box_image_url, f'test{str(i)}.png')   
        # Extract text from the cropped image using the bounding box
        original_text = ocr_service.annotate_image_manga_ocr(box_image_url)
        
        # Translate the extracted text
        translated_text = translation_serivce.call_deepl(original_text, source_lang, target_lang)
        
        results.append({
            'original': original_text,
            'translation': translated_text,
            'bounding_box': [pixel_box[0], pixel_box[1], pixel_box[2]- pixel_box[0], pixel_box[3] - pixel_box[1]],
        })
    
    return results

@app.route("/translate-text", methods=["POST"])
@authenticate
def translate_text(user_id):
    source_lang = request.args.get('source_lang')
    target_lang = request.args.get('target_lang', 'English')  # Added target_lang argument
    request_count, limit = users_service.get_request_count(user_id)
    if request_count > limit:
        return jsonify({"error": f"You have exceeded your monthly request limit: {str(limit)}"}), 403
    users_service.increment_request_count(user_id)
    text = request.json.get('text')
    if source_lang not in ["Japanese", "Korean", "Chinese"]:
        return jsonify({"error": "Unsupported language"}), 400
    api = request.args.get('api')
    if api == "gpt":
        try:
            translation = translation_serivce.call_gpt(text, source_lang, target_lang)  # Pass target_lang to the service
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    elif api == "deepl":
        try:
            translation = translation_serivce.call_deepl(text, source_lang, target_lang)  # Pass target_lang to the service
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    else:
        return jsonify({"error": "Invalid API"}), 400
    users_service.store_request_data(user_id, text, translation, "text", api)
    pronunciation = audio_service.generate_pronunciation(text, source_lang)  # New code
    return jsonify({"translation": translation, "pronunciation": pronunciation})  # Modified return

@app.route("/translate-img", methods=["POST"])
@authenticate
def translate_img(user_id):
    source_lang = request.args.get('source_lang')
    target_lang = request.args.get('target_lang', 'English')  # Added target_lang argument
    request_count, limit = users_service.get_request_count(user_id)
    if request_count > limit:
        return jsonify({"error": f"You have exceeded your monthly request limit: {str(limit)}"}), 403
    users_service.increment_request_count(user_id)
    image_data_url = request.json.get('imageDataUrl')
    print(source_lang)
    if source_lang not in ["Japanese", "Korean", "Chinese"]:
        return jsonify({"error": "Unsupported language"}), 400
    try:
        text = ocr_service.annotate_image(image_data_url, source_lang)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    api = request.args.get('api')
    if api == "gpt":
        try:
            translation = translation_serivce.call_gpt(text, source_lang, target_lang)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    elif api == "deepl":
        try:
            translation = translation_serivce.call_deepl(text, source_lang, target_lang)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    else:
        return jsonify({"error": "Invalid API"}), 400
    users_service.store_request_data(user_id, text, translation, "image", api)
    pronunciation = audio_service.generate_pronunciation(text, source_lang)  # New code
    return jsonify({"translation": translation, "original": text, "pronunciation": pronunciation})  # Modified return

@app.route("/translate-img-all", methods=["POST"])
@authenticate
def translate_img_all(user_id):
    source_lang = request.args.get('source_lang')
    target_lang = request.args.get('target_lang', 'English')  # Added target_lang argument
    request_count, limit = users_service.get_request_count(user_id)
    if request_count > limit:
        return jsonify({"error": f"You have exceeded your monthly request limit: {str(limit)}"}), 403
    users_service.increment_request_count(user_id)
    image_data_url = request.json.get('imageDataUrl')
    scroll_x = request.json.get('scrollX')
    scroll_y = request.json.get('scrollY')
    coordinates = request.json.get('coordinates')
    print(source_lang)

    model_path = r'comic_text_detector/data/comictextdetector.pt.onnx'
    
    results = extract_and_translate(image_data_url, source_lang, target_lang, [coordinates['w'], coordinates['h']], [scroll_x, scroll_y], model2annotations(model_path, image_data_url, save_json=False))

    return jsonify({'translations': results, "coordinates": coordinates, "scroll_x": scroll_x, "scroll_y": scroll_y})  # Modified return


@app.route("/get-user-limit", methods=["GET"])
@authenticate
def get_user_limit(user_id):
    request_count, limit = users_service.get_request_count(user_id)
    return jsonify({"request_count": request_count, "limit": limit})

if __name__ == "__main__":
    app.run(port=3000)