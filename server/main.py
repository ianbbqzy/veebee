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
from concurrent.futures import ThreadPoolExecutor
import multiprocessing

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
    pronunciation = audio_service.generate_pronunciation(text, source_lang)
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

    model_path = r'comic_text_detector/data/comictextdetector.pt.onnx'
    
    results = ocr_service.annotate_multiple_images(image_data_url, [coordinates['w'], coordinates['h']], model2annotations(model_path, image_data_url, save_json=False), source_lang)

    # Determine the function to be executed based on the 'api' variable
    api = request.args.get('api')
    if api == "gpt":
        func = translation_serivce.call_gpt
    elif api == "deepl":
        func = translation_serivce.call_deepl
    else:
        return jsonify({"error": "Invalid API"}), 400

    # Create a ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=multiprocessing.cpu_count()) as executor:
        futures = []
        for ocr_result in results:
            futures.append(executor.submit(func, ocr_result['original'], source_lang, target_lang))

        for i, future in enumerate(futures):
            try:
                translation = future.result()
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

            users_service.store_request_data(user_id, results[i]['original'], translation, "image", api)
            pronunciation = audio_service.generate_pronunciation(results[i]['original'], source_lang)
            results[i]['translation'] = translation
            results[i]['pronunciation'] = pronunciation

    return jsonify({'translations': results, "coordinates": coordinates, "scroll_x": scroll_x, "scroll_y": scroll_y})  # Modified return

@app.route("/get-user-limit", methods=["GET"])
@authenticate
def get_user_limit(user_id):
    request_count, limit = users_service.get_request_count(user_id)
    return jsonify({"request_count": request_count, "limit": limit})

if __name__ == "__main__":
    app.run(port=3000)