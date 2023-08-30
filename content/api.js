import 'dotenv/config'

async function callTranslateWithScreenshot(image, source_lang, target_lang, api, idToken, pronunciation) {
  const url = process.env.BACKEND_URL;
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${idToken}`);
  headers.append('Content-Type', `application/json`);

  try {
    const resp = await fetch(url + '/translate-img?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'imageDataUrl': image
      })
    }).then(res => res.json())

    if (resp.error) {
      return {"error": `Translation: ${resp.error}`};
    }
    return {"translation": resp.translation, "original": resp.original, "pronunciation": resp.pronunciation};
  } catch (err) {
    return {"error": `Translation:  ${err.message}`};
  }
}

async function callTranslateAllWithScreenshot(image, source_lang, target_lang, api, idToken, coordinates, pronunciation) {
  const url = process.env.BACKEND_URL;
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${idToken}`);
  headers.append('Content-Type', `application/json`);

  try {
    const resp = await fetch(url + '/translate-img-all?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'imageDataUrl': image,
        'scrollX': window.scrollX,
        'scrollY': window.scrollY,
        'coordinates': coordinates,
      })
    }).then(res => res.json())

    if (resp.error) {
      return {"error": `Translation: ${resp.error}`};
    }
    return resp;
  } catch (err) {
    return {"error": `Translation:  ${err.message}`};
  }
}

async function callTranslateWithText(text, source_lang, target_lang, api, idToken, pronunciation) {
  const url = process.env.BACKEND_URL;
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${idToken}`);
  headers.append('Content-Type', `application/json`);

  try {
    const resp = await fetch(url + '/translate-text?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang + (pronunciation === "on" ? "&pronunciation=true" : ""), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'text': text
      })
    }).then(res => res.json())
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

export { callTranslateWithScreenshot, callTranslateAllWithScreenshot, callTranslateWithText };