from google.cloud import texttospeech
import base64

class AudioService:
    def __init__(self):
        self.client = texttospeech.TextToSpeechClient()
        # Create a mapping from language name to language code
        self.lang_map = {
            "English": "en-US",
            "Japanese": "ja-JP",
            "Korean": "ko-KR",
            "Chinese": "zh-CN"
        }

    def generate_pronunciation(self, text, lang):
        synthesis_input = texttospeech.SynthesisInput(text=text)
        # Get the language code from the mapping using the input language
        language_code = self.lang_map.get(lang, "en-US")  # Default to English if the language is not in the mapping
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL)
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3)
        response = self.client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config)
        return base64.b64encode(response.audio_content).decode('utf-8')