import $ from 'jquery';
import Jcrop from 'jquery-jcrop';
import 'jquery-jcrop/css/jquery.Jcrop.min.css';
import 'dotenv/config'

let jcrop, selection;

// Handles messages
// currently we only expect messages from the background script.
chrome.runtime.onMessage.addListener((req, sender, res) => {
  // Sends a quick response to background script, which will
  // use the response to prevent re-injection of the content script.
  res({})

  console.log(req.message);
  if (req.message === 'initCrop') {
    // If jcrop is not initialized, initialize it.
    // TODO: maybe we can initialize this on page load?
    if (!jcrop) {
      console.log("jcrop not initialized")
      // create fake image, then init jcrop, then call overlay() and capture()
      image(() => init(() => {
        jcropOverlay(true)
        capture()
      }))
    }
    else {
      // jcrop already initialized. In this case, if there is already a cropping
      // session, ends it. If not, starts one. so we call overlay() to toggle
      // the active state.
      jcropOverlay()
      capture()
    }
  } else if (req.message === "screenCapture") {
    selection = {
      x: 0,
      y: 0,
      x2: document.documentElement.clientWidth,
      y2: document.documentElement.clientHeight,
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    }
    capture()
  } else if (req.message === "initTextTranslation") {
    // translation requested
    showTextTranslationDialog("translating", undefined, "overlayTranslatingText")
  } else {
    // If neither of the above, the message is the result
    // of the translation request. It could also be an error message.
    if (req.message.error) {
      showTextTranslationDialog(req.message.error)
    } else {
      showTextTranslationDialog(req.message.translation, req.message.pronunciation)
    }
  }
  return true
})

const jcropOverlay = ((active) => (state) => {
  active = typeof state === 'boolean' ? state : state === null ? active : !active;
  $('.jcrop-holder')[active ? 'show' : 'hide']();
  chrome.runtime.sendMessage({message: 'active', active});
})(false);

const image = (done) => {
  const img = new Image();
  img.id = 'fake-image';
  img.src = chrome.runtime.getURL('/icons/pixel.png');
  img.onload = () => {
    $('body').append(img);
    done();
  };
};

const init = (done) => {
  console.log("initing jcrop");
  $('#fake-image').Jcrop({
    bgColor: 'none',
    onSelect: (e) => {
      selection = e;
      capture();
    },
  }, function ready() {
    jcrop = this;

    $('.jcrop-hline, .jcrop-vline').css({
      backgroundImage:  `url(${chrome.runtime.getURL('/icons/Jcrop.gif')})`
    });

    done && done();
  });
};

var capture = () => {
  console.log("capturing in content")
  chrome.storage.sync.get((config) => {
    if (selection) {
      const coordinates = {...selection}
      jcrop && jcrop.release()
      selection = null
      jcropOverlay(false)

      chrome.runtime.sendMessage({message: 'capture'}, (res) => {
        console.log("captured in background")

        if (process.env.SEND_AUTH === 'true' && !config.idToken) {
          if (config.capture_mode !== "single") {
            showTranslationDialog("Please login first. Right click on the extension icon and click on options.", 
            {
              x: document.documentElement.clientWidth / 2,
              y: document.documentElement.clientHeight / 2,
              x2: document.documentElement.clientWidth / 2,
              y2: document.documentElement.clientHeight / 2,
            }, "", undefined, "emptyTranslationOverlay")
          } else {
            showTranslationDialog("Please login first. Right click on the extension icon and click on options.", coordinates, "", undefined, "emptyTranslationOverlay")
          }
        } else {            
          crop(res.image, coordinates, (image) => {
            if (config.capture_mode === "single") {
              getTranslation(image, coordinates, config.api, config.idToken, config.source_lang, config.target_lang, config.pronunciation)
            } else {
              showTranslationDialog("translating", {
                x: document.documentElement.clientWidth / 2  - 150,
                y: document.documentElement.clientHeight / 2 - 100,
                x2: document.documentElement.clientWidth / 2 - 150,
                y2: document.documentElement.clientHeight / 2 - 100,
              }, "", undefined, "translatingOverlay")
              getTranslations(image, coordinates, config.api, config.idToken, config.source_lang, config.target_lang, config.pronunciation)
            }
          })
        }
      })
    }
  })
}

async function callTranslateAllWithScreenshot(image, source_lang, target_lang, api, idToken, coordinates, pronunciation) {
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

var getTranslations = async (image, coordinates, api, idToken, source_lang, target_lang, pronunciation) => {
  const overlayId = "overlay" + Math.floor(Math.random() * 10000 + 2000);

  callTranslateAllWithScreenshot(image, source_lang, target_lang, "deepl", idToken, coordinates, pronunciation)
  .then(response => {
    if (response.error) {
      showTranslationDialog(`Error: translation response has an error: ${response.error}`, coordinates, "", undefined, overlayId)
    } else if (response.translations) {
      for (var i = 0; i < response.translations.length; i++) {
        // wrap in function so that overlayID is preserved for each iteration inside the async then call.
        (function(index, individualOverlayId) {
          var translation = response.translations[index];
          const ith_coordinates = {
            x: translation['bounding_box'][0] + coordinates.x,
            y: translation['bounding_box'][1] + coordinates.y,
            x2: translation['bounding_box'][0] + translation['bounding_box'][2] + coordinates.x,
            y2: translation['bounding_box'][1] + translation['bounding_box'][3] + coordinates.y,
          };
          if (api === "gpt") {
            showTranslationDialog(translation.translation + "\n\n retrieving in-depth translation", ith_coordinates, translation.original, translation.pronunciation, individualOverlayId, true)
            callTranslateWithText(translation.original, source_lang, target_lang, "gpt", idToken, false)
            .then(secondResponse => {
              if (secondResponse.error) {
                showTranslationDialog(translation.translation + `\n\n Failed to retrieve in-depth translation: ${secondResponse.error}`, ith_coordinates, translation.original, translation.pronunciation, individualOverlayId)
              } else if (secondResponse.translation) {
                showTranslationDialog(secondResponse.translation, ith_coordinates, translation.original, translation.pronunciation, individualOverlayId)
              } else {
                showTranslationDialog(translation.translation + "\n\n Failed to retrieve in-depth translation: translation is not found in the response", ith_coordinates, translation.original, translation.pronunciation, individualOverlayId)
              }
            })
            .catch(error => {
              showTranslationDialog(translation.translation  + `\n\n Failed to retrieve in-depth translation: ${error}`, ith_coordinates, translation.original, translation.pronunciation, individualOverlayId)
            });
          } else {
            showTranslationDialog(translation.translation, ith_coordinates, translation.original, translation.pronunciation, individualOverlayId, true);
          }
        })(i, overlayId + i);
      }
    } else {
      showTranslationDialog(`Error: Failed to get response: ${response}`, coordinates, "", undefined, overlayId)
    }
  })
  .catch(error => {
    console.error(`Error: ${error.message}`);
    showTranslationDialog(`Error: ${error.message}`, coordinates, "", undefined)
  });
}

async function callTranslateWithScreenshot(image, source_lang, target_lang, api, idToken, pronunciation) {
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

var getTranslation = async (image, coordinates, api, idToken, source_lang, target_lang, pronunciation) => {
  const overlayId = "overlay" + Math.floor(Math.random() * 10000 + 1000);
  
  showTranslationDialog("translating", coordinates, "", undefined, overlayId)
  callTranslateWithScreenshot(image, source_lang, target_lang, "deepl", idToken, pronunciation)
  .then(response => {
    if (response.error) {
      showTranslationDialog(`Error: translation is not valid: ${response.error}`, coordinates, "", undefined, overlayId)
    } else if (response.translation) {
      if (api === "gpt") {
        callTranslateWithTextStream(response.original, source_lang, target_lang, idToken, response.pronunciation, overlayId, coordinates, api)
        .catch(error => {
          showTranslationDialog(response.translation+ `\n\n Failed to retrieve in-depth translation: ${error}`, coordinates, response.original, response.pronunciation, overlayId)
        });
      } else {
        showTranslationDialog(response.translation, coordinates, response.original, response.pronunciation, overlayId)
      }
      
    } else {
      showTranslationDialog(`Error: translation is not valid: ${response}`, coordinates, "", undefined, overlayId)
    }
  })
  .catch(error => {
    showTranslationDialog(`Error: ${error.message}`, coordinates, "", undefined, overlayId)
  });
}

window.addEventListener('resize', ((timeout) => () => {
  jcrop.destroy()
  init(() => jcropOverlay(null))
})())

function showTextTranslationDialog(translation, pronunciation, overlayId) {
  if (!overlayId) {
    const existingOverlay = document.querySelector('#overlayTranslatingText');
    if (existingOverlay) existingOverlay.remove();
    overlayId = "overlay" + Math.floor(Math.random() * 10000 + 1);
  }

  const selection = window.getSelection();
  if (!selection) {
    console.log("Nothing was selected");
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();

  const existingOverlays = document.querySelectorAll("[id^='overlay']");
  const parent = findParentOverlay(existingOverlays)
  if (parent !== null) {
    const overlayRect = parent.getBoundingClientRect();

    console.log("Selection is inside an existing overlay")
    showTranslationDialog(translation,{
      x: overlayRect.left,
      y: overlayRect.top,
      x2: overlayRect.right,
      y2: overlayRect.bottom,
    }, selection.toString(), pronunciation, overlayId);
  } else {
    console.log("Selection is not inside an existing overlay")
    showTranslationDialog(translation, {
      x: rect.left,
      y: rect.top,
      x2: rect.right,
      y2: rect.bottom,
    }, selection.toString(), pronunciation, overlayId);
  }
}

function showTranslationDialog(translation, coordinates, original, pronunciation, overlayID = 'overlay', minimize = false) {
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportCenterX = (viewportWidth / 2) + window.scrollX;
  const rectCenterX = (coordinates.x + coordinates.x2) / 2;
  const spawnRight = rectCenterX <= viewportCenterX;
  const spawnX = spawnRight
      ? coordinates.x2 + window.scrollX
      : coordinates.x - 300 + window.scrollX;

  let existingOverlay = document.querySelector("#" + overlayID)
  console.log("overlayID: " + overlayID)
  const existingIsMinimized = existingOverlay && existingOverlay.shadowRoot.querySelector(`#translation${overlayID}`) === null;
  minimize = existingOverlay ? existingIsMinimized : minimize;
  existingOverlay = existingOverlay || document.querySelector("#translatingOverlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayID;
  overlay.attachShadow({mode: 'open'}); // Attach a shadow root to the overlay
  
  // Apply styles to the shadow root
  overlay.shadowRoot.innerHTML = `
    <style>
      :host {
        display: flex;
        flex-direction: column;
        background-color: white;
        font-size: 16px;
        border: 1px solid #cccccc;
        width: 300px;
        position: absolute;
        top: ${coordinates.y + window.scrollY}px;
        left: ${spawnX}px;
        z-index: 999;
      }
      #translation${overlayID} {
        flex-grow: 1;
        overflow: auto;
        top: 10px;
        color: black;
        white-space: pre-line; /* Add this line to preserve line breaks */
      }
      #original${overlayID} {
        color: black;
      }
      #dragButton${overlayID} {
        cursor: move; /* Change cursor to move icon on hover */
      }
      /* Add other styles here */
    </style>
    <!-- Overlay content -->
    <div class="overlay-controls" style="right: 5px; display: flex;">
      <button id="playButton${overlayID}" style="margin-right: 5px;">Play Pronunciation</button>
      <button id="toggleButton${overlayID}" style="margin-right: 5px;">Toggle</button>
      <button id="overlay-minimize-button${overlayID}" style="margin-right: 5px;">–</button>
      <button id="overlay-close-button${overlayID}">OK</button>
      <button id="dragButton${overlayID}" style="margin-right: 5px;">Drag</button>
    </div>
    <p id="translation${overlayID}">${translation}</p>
    <audio id="pronunciation${overlayID}" src="data:audio/mp3;base64,${pronunciation}" style="display: none;"></audio>
    <p id="original${overlayID}" contentEditable="true" style="display: none;">${original}</p>
  `;
  
  // Append the overlay to the document body
  document.body.appendChild(overlay);
  attachEventListeners(overlayID, spawnRight, spawnX, pronunciation);
  if (minimize) {
    minimizeOverlay(overlayID, spawnRight, spawnX, pronunciation)
  }
}

function minimizeOverlay(overlayID, spawnRight, spawnX, pronunciation) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;

  // Extract the <style> tag from the original HTML
  const styleTag = shadowRoot.querySelector('style').outerHTML;

  // Create new style rules
  const newStyles = `
    :host {
      width: 30px;
      z-index: 998;
      left: ${spawnRight === false ? (spawnX + 270) + "px" : spawnX + "px"};
    }
    #overlay-restore-button${overlayID} {
      background-color: red;
    }
  `;

  // Combine the original styles with the new styles
  const combinedStyles = styleTag.replace('</style>', `${newStyles}</style>`);

  overlay.dataset.initialHtml = shadowRoot.innerHTML;
  shadowRoot.innerHTML = `
    ${combinedStyles}
    <button id="overlay-restore-button${overlayID}">+</button>
  `;
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).addEventListener("click", () => restoreOverlay(overlayID, spawnRight, spawnX, pronunciation));
}

function restoreOverlay(overlayID, spawnRight, spawnX, pronunciation) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;

  // Extract the <style> tag from the original HTML
  const styleTag = shadowRoot.querySelector('style');

  // Create new style rules
  const newStyles = `
    :host {
      width: 300px;
      height: auto;
      z-index: 999;
      left: ${spawnX}px;
    }
  `;

  // Combine the original styles with the new styles
  const combinedStyles = styleTag.textContent + newStyles;

  shadowRoot.innerHTML = overlay.dataset.initialHtml;
  shadowRoot.querySelector('style').textContent = combinedStyles;

  attachEventListeners(overlayID, spawnRight, spawnX, pronunciation);
}

function attachEventListeners(overlayID, spawnRight, spawnX, pronunciation) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;

  const playButton = shadowRoot.querySelector("#playButton" + overlayID)
  playButton.addEventListener("click", () => {
      const audioElement = shadowRoot.querySelector("#pronunciation" + overlayID);
      audioElement.play();
  });
  if (pronunciation) {
    playButton.disabled = false;
  } else {
    playButton.disabled = true;
  }

  shadowRoot.querySelector("#overlay-minimize-button" + overlayID).addEventListener("click", () => minimizeOverlay(overlayID, spawnRight, spawnX, pronunciation));
  shadowRoot.querySelector("#overlay-close-button" + overlayID).addEventListener("click", () => overlay.remove());

  const toggleButton = shadowRoot.getElementById("toggleButton" + overlayID);
  toggleButton.addEventListener("click", function() {
      const translationElement = shadowRoot.getElementById("translation" + overlayID);
      const originalElement = shadowRoot.getElementById("original" + overlayID);
      
      const isTranslationVisible = translationElement.style.display !== "none";
      translationElement.style.display = isTranslationVisible ? "none" : "block";
      originalElement.style.display = isTranslationVisible ? "block" : "none";
  });

  const dragButton = overlay.shadowRoot.querySelector(`#dragButton${overlayID}`);
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  dragButton.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    overlay.style.top = (overlay.offsetTop - pos2) + "px";
    overlay.style.left = (overlay.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    /* stop moving when mouse button is released:*/
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function crop (image, area, done) {
  const dpr = devicePixelRatio
  var top = area.y * dpr
  var left = area.x * dpr
  var width = area.w * dpr
  var height = area.h * dpr
  var w = (dpr !== 1) ? width : area.w
  var h = (dpr !== 1) ? height : area.h

  var canvas = null
  var template = null
  if (!canvas) {
    template = document.createElement('template')
    canvas = document.createElement('canvas')
    document.body.appendChild(template)
    template.appendChild(canvas)
  }
  canvas.width = w
  canvas.height = h

  var img = new Image()
  img.onload = () => {
    var context = canvas.getContext('2d')
    context.drawImage(img,
      left, top,
      width, height,
      0, 0,
      w, h
    )

    var cropped = canvas.toDataURL(`image/png`)
    done(cropped)
  }
  img.src = image
}

// elements is of type NodeListOf<Element>
function findParentOverlay(elements) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return false;

  const node = selection.anchorNode.parentElement;
  const parent = Array.from(elements).find(element => element.shadowRoot.contains(node)) || null;
  return parent;
}

// Modify the callTranslateWithText function
async function callTranslateWithText(text, source_lang, target_lang, api, idToken, pronunciation) {
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
}

async function callTranslateWithTextStream(text, source_lang, target_lang, idToken, pronunciation, overlayId, coordinates, api) {
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
        console.log(chunk)
        const lines = chunk.split("\n");
        console.log(lines)
        const parsedLines = lines
          .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
          .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
          .map((line) => JSON.parse(line)); // Parse the JSON string
        console.log(parsedLines)

        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
          const { delta } = choices[0];
          const { content } = delta;
          // Update the UI with the new content
          if (content) {
            chunks += content;
            showTranslationDialog(chunks, coordinates, text, pronunciation, overlayId)
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
        showTranslationDialog(chunks, coordinates, text, pronunciation, overlayId)
      }
    } catch (err) {
      return {"error": `Translation: ${err.message}`};
    }
  }
}