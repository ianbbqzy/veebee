from google.cloud import texttospeech
import base64

class AudioService:
    def __init__(self):
        self.client = texttospeech.TextToSpeechClient()

    def generate_pronunciation(self, text, lang):
        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=lang,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL)
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3)
        response = self.client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config)
        return base64.b64encode(response.audio_content).decode('utf-8')