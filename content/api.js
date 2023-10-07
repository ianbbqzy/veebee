export async function callTranslateWithScreenshot(image, source_lang, target_lang, api, idToken, pronunciation) {
    const url = process.env.BACKEND_URL;
    const headers = new Headers();
    if (process.env.SEND_AUTH === 'true') {
      headers.append('Authorization', `Bearer ${idToken}`);
    }
    headers.append('Content-Type', `application/json`);
  
    try {
      const response = await fetch(url + '/translate-img?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          'imageDataUrl': image
        })
      })
  
      const statusCode = response.status;
      if (statusCode === 401) {
        chrome.runtime.sendMessage({message: 'logout'});
      }
      const resp = await response.json();
      if (resp.error) {
        return {"error": `Translation: ${resp.error}`, status: resp.status};
      }
      return {"translation": resp.translation, "original": resp.original, "pronunciation": resp.pronunciation};
    } catch (err) {
      return {"error": `Translation:  ${err.message}`};
    }
}

export  async function callTranslateAllWithScreenshot(image, source_lang, target_lang, api, idToken, coordinates, pronunciation) {
    const url = process.env.BACKEND_URL;
    const headers = new Headers();
    if (process.env.SEND_AUTH === 'true') {
        headers.append('Authorization', `Bearer ${idToken}`);
    }
    headers.append('Content-Type', `application/json`);

    try {
        const response = await fetch(url + '/translate-img-all?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            'imageDataUrl': image,
            'scrollX': window.scrollX,
            'scrollY': window.scrollY,
            'coordinates': coordinates,
        })
        })
        const statusCode = response.status;
        if (statusCode === 401) {
        chrome.runtime.sendMessage({message: 'logout'});
        }
        const resp = await response.json();

        if (resp.error) {
        return {"error": `Translation: ${resp.error}`};
        }
        return resp;
    } catch (err) {
        return {"error": `Translation:  ${err.message}`};
    }
}
  
export async function callTranslateWithText(text, source_lang, target_lang, api, idToken, pronunciation) {
    // Get the OpenAI API Key and API Calls Location from the storage
    const config = await new Promise(resolve => chrome.storage.sync.get(resolve));
    const openai_api_key = config.openai_api_key;
    const api_calls_location = config.api_calls_location;
  
    // If the API is GPT and the API Calls Location is Frontend, make a direct chat completion request to OpenAI
    if (api === 'gpt' && api_calls_location === 'Frontend') {
      const url = 'https://api.openai.com/v1/chat/completions';
      const headers = new Headers();
      headers.append('Authorization', `Bearer ${openai_api_key}`);
      headers.append('Content-Type', `application/json`);
  
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            'model': 'gpt-3.5-turbo',
            'messages': [
              {'role': 'system', 'content': `
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
  <--- End of response --->`},
              {'role': 'user', 'content': `translate the ${source_lang} phrase or word "${text}" to ${target_lang}.`}
            ]
          })
        }).then(res => res.json())
        if (resp.error) {
          return {"error": `Translation: ${resp.error}`};
        } else if (resp.choices && resp.choices.length > 0 && resp.choices[0].message) {
          return {"translation": resp.choices[0].message['content'].trim(), "pronunciation": undefined};
        } else {
          return {"error": `Error: translation is not valid: ${resp}`};
        }
      } catch (err) {
        return {"error": `Translation: ${err.message}`};
      }
    } else {
  
      const url = process.env.BACKEND_URL;
      const headers = new Headers();
      headers.append('Authorization', `Bearer ${idToken}`);
      headers.append('Content-Type', `application/json`);
      try {
        const response = await fetch(url + '/translate-text?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            'text': text
          })
        })
  
        const statusCode = response.status;
        if (statusCode === 401) {
          chrome.runtime.sendMessage({message: 'logout'});
        }
        const resp = await response.json();
        if (resp.error) {
          return {"error": `Translation: ${resp.error}`};
        } else if (resp.translation) {
          return {"translation": resp.translation, "pronunciation": resp.pronunciation};
        } else {
          return {"error": `Error: translation is not valid: ${resp}`};
        }
      } catch (err) {
        return {"error": `Translation: ${err.message}`};
      }
    }
}

export async function* callTranslateWithTextStream(text, source_lang, target_lang, idToken, pronunciation, overlayId, coordinates, api) {
  // Get the OpenAI API Key and API Calls Location from the storage
  const config = await new Promise(resolve => chrome.storage.sync.get(resolve));
  const openai_api_key = config.openai_api_key;
  const api_calls_location = config.api_calls_location;

  // If the API is GPT and the API Calls Location is Frontend, make a direct chat completion request to OpenAI
  if (api === 'gpt' && api_calls_location === 'Frontend' && openai_api_key) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${openai_api_key}`);
    headers.append('Content-Type', `application/json`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          'model': 'gpt-3.5-turbo',
          'stream': true,
          'messages': [
            {'role': 'system', 'content': `
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
<--- End of response --->`},
            {'role': 'user', 'content': `translate the ${source_lang} phrase or word "${text}" to ${target_lang}.`}
          ]
        })
      })
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let chunks = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        // Massage and parse the chunk of data
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        const parsedLines = lines
          .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
          .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string

        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
          const { delta } = choices[0];
          const { content } = delta;
          // Update the UI with the new content
          if (content) {
            chunks += content;
            yield chunks
            // showTranslationDialog(chunks, coordinates, text, pronunciation, overlayId)
          }
        }
      }
    } catch (err) {
      return {"error": `Translation: ${err.message}`};
    }
  } else {  
    const url = process.env.BACKEND_URL;
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', `application/json`);

    try {
      const response = await fetch(url + '/translate-text-stream?api=gpt&source_lang=' + source_lang + '&target_lang=' + target_lang, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          'text': text
        })
      })
      const statusCode = response.status;
      if (statusCode === 401) {
        chrome.runtime.sendMessage({message: 'logout'});
      }

      const reader = response.body.getReader();
      let chunks = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks += new TextDecoder("utf-8").decode(value);
        // Here you can process the chunk of translation
        // For example, you can update the translation dialog with the new chunk
        yield chunks
        // showTranslationDialog(chunks, coordinates, text, pronunciation, overlayId)
      }
    } catch (err) {
      return {"error": `Translation: ${err.message}`};
    }
  }
}
