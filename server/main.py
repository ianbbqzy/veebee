import concurrent.futures
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from functools import wraps
from flask import request, jsonify
import firebase_admin
from firebase_admin import auth, credentials
from requests import exceptions
from dotenv import load_dotenv
from services.users_service import UsersService
from services.ocr_service import OCRService
from services.translation_service import TranslationService
from services.audio_service import AudioService  # Add import for the new service
import os
from comic_text_detector.inference import model2annotations

load_dotenv()
hard_limit = 1000

# Initialize Firebase Admin SDK with your service account credentials
cred = credentials.Certificate('firebaseServiceAccountKey.json')
firebase_admin.initialize_app(cred)

# Add the following line after loading the environment variables
require_auth = os.getenv("REQUIRE_AUTH", "true").lower() == "true"

# Decorator function to authenticate API requests
def authenticate(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Get the authorization header from the request
        auth_header = request.headers.get('Authorization')
        
        if not require_auth:
            kwargs['user_id'] = 'unauthenticated'
            try:
                return func(*args, **kwargs)
            except Exception as e:
                print(e)
                return jsonify({'error': 'An error occurred while processing your request.'}), 500
        
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
    pronunciation = audio_service.generate_pronunciation(text, source_lang) if request.args.get('pronunciation') == 'true' else None
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
    pronunciation = audio_service.generate_pronunciation(text, source_lang) if request.args.get('pronunciation') == 'true' else None
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
    
    api = request.args.get('api')
    # Determine the function to call based on the api URL params
    if api == "gpt":
        translation_func = translation_serivce.call_gpt
    elif api == "deepl":
        translation_func = translation_serivce.call_deepl
    else:
        return jsonify({"error": "Invalid API"}), 400

    try:
        ocr_results = ocr_service.annotate_multiple_images(image_data_url, [coordinates['w'], coordinates['h']], model2annotations(model_path, image_data_url, save_json=False), source_lang)
    except Exception as e:
        return jsonify({"error": str(e)}), 500  # Updated error response code

    pronunciation = request.args.get('pronunciation')

    results = []
    with concurrent.futures.ThreadPoolExecutor() as executor:
        futures = []
        for ocr_result in ocr_results:
            futures.append(executor.submit(process_ocr_result, ocr_result, source_lang, target_lang, user_id, translation_func, api, pronunciation))
        for future in concurrent.futures.as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                return jsonify({"error": str(e)}), 500  # Updated error response code

    return jsonify({'translations': results, "coordinates": coordinates, "scroll_x": scroll_x, "scroll_y": scroll_y})  # Modified return

@app.route("/get-user-limit", methods=["GET"])
@authenticate
def get_user_limit(user_id):
    request_count, limit = users_service.get_request_count(user_id)
    return jsonify({"request_count": request_count, "limit": limit})

def process_ocr_result(ocr_result, source_lang, target_lang, user_id, translation_func, api, pronunciation):
    try:
        translation = translation_func(ocr_result['original'], source_lang, target_lang)
    except ValueError as e:
        raise e
    users_service.store_request_data(user_id, ocr_result['original'], translation, "image", api)
    pronunciation = audio_service.generate_pronunciation(ocr_result['original'], source_lang) if pronunciation == 'true' else None
    ocr_result['translation'] = translation
    ocr_result['pronunciation'] = pronunciation
    return ocr_result

@app.route("/translate-text-stream", methods=["POST"])
@authenticate
def translate_text_stream(user_id):
    source_lang = request.args.get('source_lang')
    target_lang = request.args.get('target_lang', 'English')
    text = request.json.get('text')
    if source_lang not in ["Japanese", "Korean", "Chinese"]:
        return jsonify({"error": "Unsupported language"}), 400
    api = request.args.get('api')
    if api == "gpt":
        try:
            return Response(translation_serivce.call_gpt_stream(text, source_lang, target_lang), mimetype='text/event-stream')
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    else:
        return jsonify({"error": "Invalid API"}), 400

if __name__ == "__main__":
    app.run(port=3000)