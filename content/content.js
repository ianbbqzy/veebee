import $ from 'jquery';
import Jcrop from 'jquery-jcrop';
import 'jquery-jcrop/css/jquery.Jcrop.min.css';
import 'dotenv/config'
import { callTranslateWithScreenshot, callTranslateWithText, callTranslateAllWithScreenshot, callTranslateWithTextStream } from './api.js';

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

var getTranslation = async (image, coordinates, api, idToken, source_lang, target_lang, pronunciation) => {
  const overlayId = "overlay" + Math.floor(Math.random() * 10000 + 1000);
  
  showTranslationDialog("translating", coordinates, "", undefined, overlayId)
  callTranslateWithScreenshot(image, source_lang, target_lang, "deepl", idToken, pronunciation)
  .then(response => {
    if (response.error) {
      showTranslationDialog(`Error: translation is not valid: ${response.error}`, coordinates, "", undefined, overlayId)
    } else if (response.translation) {
      if (api === "gpt") {
        const translationStream = callTranslateWithTextStream(response.original, source_lang, target_lang, idToken, response.pronunciation, overlayId, coordinates, api);
        (async () => {
          let result = await translationStream.next();
          while (!result.done) {
            if (result.value.error) {
              // Handle the error
              showTranslationDialog(response.translation+ `\n\n Failed to retrieve in-depth translation: ${result.value.error}`, coordinates, response.original, response.pronunciation, overlayId);
            } else {
              updateTranslationDialog(result.value, overlayId);
            }
            result = await translationStream.next();
          }
        })().catch(error => {
          showTranslationDialog(response.translation+ `\n\n Failed to retrieve in-depth translation: ${error}`, coordinates, response.original, response.pronunciation, overlayId);
        });
      } else {
        showTranslationDialog(response.translation, coordinates, response.original, response.pronunciation, overlayId);
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
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
      :host {
        display: flex;
        flex-direction: column;
        background-color: white;
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
      .overlay-controls {
        cursor: move; /* Change cursor to move icon on hover */
      }
      .material-icons {
        font-size: 18px
      }
      .minimized {
        width: 30px;
        #translation${overlayID}, #original${overlayID}, .overlay-controls {
          display: none;
        }
        #overlay-restore-button${overlayID} {
          display: block;
        }
      }
      .restored {
        width: 300px;
        #translation${overlayID}, #original${overlayID}, .overlay-controls {
          display: block;
        }
        #overlay-restore-button${overlayID} {
          display: none;
        }
      }
    </style>
    <!-- Overlay content -->
    <div class="overlay-controls" style="right: 5px; display: flex; justify-content: space-between;">
      <div>
        <button id="toggleButton${overlayID}" title="Show Original/Translation"><i class="material-icons">translate</i></button>
        <button id="playButton${overlayID}" title="Play Pronunciation"><i class="material-icons">play_arrow</i></button>
        <button id="openSidePanelButton${overlayID}" style="margin-right: 5px" title="Open Side Panel"><i class="material-icons">open_in_new</i></button>
      </div>
      <div>
        <button id="dragButton${overlayID}" title="Drag"><i class="material-icons">open_with</i></button>
        <button id="overlay-minimize-button${overlayID}" title="Minimize"><i class="material-icons">remove</i></button>
        <button id="overlay-close-button${overlayID}" style="margin-right: 5px" title="Close"><i class="material-icons">close</i></button>
      </div>
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
  overlay.classList.add('minimized');
  overlay.classList.remove('restored');
}

function restoreOverlay(overlayID, spawnRight, spawnX, pronunciation) {
  const overlay = document.querySelector("#" + overlayID);
  overlay.classList.add('restored');
  overlay.classList.remove('minimized');
}

function attachEventListeners(overlayID, spawnRight, spawnX, pronunciation) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;

  const playButton = shadowRoot.querySelector("#playButton" + overlayID);
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

  const dragButton = overlay.shadowRoot.querySelector(`.overlay-controls`);
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

  const openSidePanelButton = shadowRoot.getElementById("openSidePanelButton" + overlayID);

  if (process.env.PAID_FEATURES === 'true') {
    openSidePanelButton.addEventListener("click", openSidePanel);
  } else {
    openSidePanelButton.remove();
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

function updateTranslationDialog(translation, overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  if (overlay) {
    const shadowRoot = overlay.shadowRoot;
    const translationElement = shadowRoot.querySelector(`#translation${overlayID}`);
    if (translationElement) {
      translationElement.textContent = translation;
    } else {
      console.error(`Translation element not found in overlay ${overlayID}`);
    }
  } else {
    console.error(`Overlay ${overlayID} not found`);
  }
}

// elements is of type NodeListOf<Element>
function findParentOverlay(elements) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return false;

  const node = selection.anchorNode.parentElement;
  const parent = Array.from(elements).find(element => element.shadowRoot.contains(node)) || null;
  return parent;
}

let sidePanel;
let lastContent;

function createSidePanel() {
  sidePanel = document.createElement('div');
  sidePanel.id = 'sidePanel';
  sidePanel.style.display = 'none';
  sidePanel.style.position = 'fixed';
  sidePanel.style.right = '0';
  sidePanel.style.top = '0';
  sidePanel.style.width = '200px';
  sidePanel.style.height = '100vh';
  sidePanel.style.backgroundColor = '#f0f0f0';
  sidePanel.style.zIndex = '1000';
  sidePanel.style.padding = '10px';
  sidePanel.style.boxShadow = '-2px 0 5px rgba(0,0,0,0.1)';
  const controlsHTML = `
  <div class="overlay-controls" style="right: 5px; display: flex;">
      <button id="playButton2">Play Pronunciation</button>
      <button id="toggleButton2">Toggle</button>
      <button id="closeSidePanelButton">Close Side Panel</button>
    </div>
  <div id="contentContainer"></div>
  `;
  sidePanel.innerHTML = controlsHTML;
  document.body.appendChild(sidePanel);
  console.log(sidePanel.innerHTML);

  const closeButton = sidePanel.querySelector("#closeSidePanelButton")
  closeButton.innerText = 'Close Side Panel';
  closeButton.addEventListener('click', closeSidePanel);
}

function openSidePanel() {
  sidePanel.style.display = 'block';
  if (localStorage.getItem('lastContent')) {
    lastContent = localStorage.getItem('lastContent');
    updateContent(lastContent);
  }
}

function closeSidePanel() {
  sidePanel.style.display = 'none';
  localStorage.setItem('lastContent', lastContent);
}

function updateContent(content) {
  const contentContainer = sidePanel.querySelector('#contentContainer');
  contentContainer.innerHTML = content;
}

createSidePanel();

// Create link element for the webpage in addition to the shadow root
let link = document.createElement('link');

// Set link attributes
link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
link.rel = 'stylesheet';

// Append link to the head of the document
document.head.appendChild(link);