import openai
import requests  # make sure you have this line
from flask import request, jsonify

class TranslationService:
    def __init__(self, openai_api_key, deepl_api_key):
        openai.api_key = openai_api_key
        self.deepl_api_key = deepl_api_key
        self.lang_map = {"Japanese": "JA", "Korean": "KO", "Chinese": "ZH", "English": "EN"}  # Added 'EN' mapping for English and 'ZH' mapping for Chinese

    def call_gpt(self, text, source_lang, target_lang):
        prompt = f'translate the {source_lang} phrase or word "{text}" to {target_lang}.'  # Updated to handle long format language names
        messages=[
            {"role": "system", "content": """
            You are a robotic translator who has mastered all languages. You provide the translation and breakdown
            of the phrase or a word directly without trying to engage in a conversation. When given a phrase or word to be
            translated, you first provide the direct translation in English,
            followed by the breakdown of the phrase into compound words or loan words if necessary and explain their definitions.
            DO NOT include the original phrase or sentence in your response.

            Present the result in the following format:
            <--- Start of format --->
            <direct translation>

            Breakdown:
            <First compound word or loan word>: <definition>
            <Second compound word or loan word>: <definition>
            ...
            <--- End of format --->

            For example, if the phrase to be translated is "それが四宮かぐやである", you would return:
            <--- Start of response --->
            That is Kaguya Shinomiya

            Breakdown:
            - それ (sore): that
            - が (ga): particle indicating the subject of the sentence
            - 四宮 (Shinomiya): a Japanese surname
            - かぐや (Kaguya): a given name
            - である (de aru): formal form of the copula "to be"
            <--- End of response --->
            """},
            {"role": "user", "content": prompt}
        ]
        completion = openai.ChatCompletion.create(
            model="gpt-3.5-turbo-0613",
            messages=messages,
            temperature=0,
        )

        print(completion.choices[0]['message'])
        return completion.choices[0]['message']['content']
    
    def call_deepl(self, text, source_lang, target_lang):
        target_lang = self.lang_map[target_lang]  # Updated to use language map

        url = "https://api-free.deepl.com/v2/translate"

        data = {
            "text": text,
            "source_lang": self.lang_map.get(source_lang),
            "target_lang": target_lang
        }

        headers = {
            "Authorization": f"DeepL-Auth-Key {self.deepl_api_key}",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        }

        response = requests.post(url, data=data, headers=headers)
        json_resp = response.json()
        print(json_resp)

        if "message" in json_resp:
            return jsonify({"translation":  f"DeepL message: {json_resp['message']}"})

        return json_resp['translations'][0]['text']

    def call_gpt_stream(self, text, source_lang, target_lang):
        prompt = f'translate the {source_lang} phrase or word "{text}" to {target_lang}.'  
        messages=[
            {"role": "system", "content": """
            You are a robotic translator who has mastered all languages. You provide the translation and breakdown
            of the phrase or a word directly without trying to engage in a conversation. When given a phrase or word to be
            translated, you first provide the direct translation in English,
            followed by the breakdown of the phrase into compound words or loan words if necessary and explain their definitions.
            DO NOT include the original phrase or sentence in your response.

            Present the result in the following format:
            <--- Start of format --->
            <direct translation>

            Breakdown:
            <First compound word or loan word>: <definition>
            <Second compound word or loan word>: <definition>
            ...
            <--- End of format --->

            For example, if the phrase to be translated is "それが四宮かぐやである", you would return:
            <--- Start of response --->
            That is Kaguya Shinomiya

            Breakdown:
            - それ (sore): that
            - が (ga): particle indicating the subject of the sentence
            - 四宮 (Shinomiya): a Japanese surname
            - かぐや (Kaguya): a given name
            - である (de aru): formal form of the copula "to be"
            <--- End of response --->
            """},
            {"role": "user", "content": prompt}
        ]
        completion = openai.ChatCompletion.create(
            model="gpt-3.5-turbo-0613",
            messages=messages,
            temperature=0,
            stream=True,
        )

        buffer = ""
        for message in completion:
            content = message['choices'][0]['delta'].get("content", "")
            buffer += content
            yield content
        print(buffer)
