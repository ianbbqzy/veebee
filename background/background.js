// ... existing code ...

// Modify the callTranslateWithText function
async function callTranslateWithText(text, source_lang, target_lang, api, idToken, pronunciation, openaiApiKey, apiCallPreference) {
  // If 'Frontend' option with 'GPT' is selected, make a direct chat completion request to OpenAI
  if (api === 'gpt' && apiCallPreference === 'frontend') {
    const url = 'https://api.openai.com/v1/chat/completions';
    const headers = new Headers();
    headers.append('Authorization', `Bearer ${openaiApiKey}`);
    headers.append('Content-Type', `application/json`);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          'model': 'gpt-3.5-turbo',
          'messages': [
            {
              'role': 'system',
              'content': 'You are a helpful assistant.'
            },
            {
              'role': 'user',
              'content': text
            }
          ]
        })
      }).then(res => res.json())
      if (resp.error) {
        return {"error": `Translation: ${resp.error}`};
      } else if (resp.choices && resp.choices.length > 0) {
        return {"translation": resp.choices[0].text, "pronunciation": undefined};
      } else {
        return {"error": `Error: translation is not valid: ${resp}`};
      }
    } catch (err) {
      return {"error": `Translation: ${err.message}`};
    }
  } else {
    // ... existing code ...
  }
}

// ... existing code ...