import $ from 'jquery';
import Jcrop from 'jquery-jcrop';
import 'jquery-jcrop/css/jquery.Jcrop.min.css';
import 'dotenv/config'
import { callTranslateWithScreenshot, callTranslateWithText, callTranslateAllWithScreenshot, callTranslateWithTextStream } from './api.js';

let jcrop, selection;
let previousOverlayId = null;

// Create link element for the webpage in addition to the shadow root of translation dialogs/side panels
let link = document.createElement('link');

// Set link attributes
link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
link.rel = 'stylesheet';

// Append link to the head of the document
document.head.appendChild(link);
// Add this function at the top of the file
function initializeJcrop() {
  if (!jcrop) {
    console.log("jcrop not initialized")
    // create fake image, then init jcrop, then call overlay() and capture()
    image(() => init(() => {
      jcropOverlay(true)
      capture()
    }))
  }
}

// Handles messages
// currently we only expect messages from the background script.
chrome.runtime.onMessage.addListener((req, sender, res) => {
  // Sends a quick response to background script, which will
  // use the response to prevent re-injection of the content script.
  res({})

  console.log(req.message);
  if (req.message === 'initCrop') {
    initializeJcrop();
    jcropOverlay()
    capture()
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
                // update Button immediately because it's not streaming
                updateTranslationDialog(secondResponse.translation, individualOverlayId, translation.original, translation.pronunciation, true)
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
        showTranslationDialog(response.translation + "\n\n retrieving in-depth translation", coordinates, response.original, response.pronunciation, overlayId);
        let streamResult = "";
        const translationStream = callTranslateWithTextStream(response.original, source_lang, target_lang, idToken, response.pronunciation, overlayId, coordinates, api);
        (async () => {
          let result = await translationStream.next();
          while (!result.done) {
            if (result.value.error) {
              // Handle the error
              showTranslationDialog(response.translation+ `\n\n Failed to retrieve in-depth translation: ${result.value.error}`, coordinates, response.original, response.pronunciation, overlayId);
            } else {
              streamResult += result.value
              // do not update Button immediately because it's still streaming
              updateTranslationDialog(streamResult, overlayId, response.original, response.pronunciation, false);
            }
            result = await translationStream.next();
          }
          updateTranslationDialog(streamResult, overlayId, response.original, response.pronunciation, true);
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

let materialIconsCss = ""

fetch('https://fonts.googleapis.com/icon?family=Material+Icons')
  .then(response => response.text())
  .then(css => {
    materialIconsCss = css;
    createSidePanel();
  });

function showTranslationDialog(translation, coordinates, original, pronunciation, overlayID = 'overlay', minimize = false) {
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportCenterX = (viewportWidth / 2) + window.scrollX;
  const rectCenterX = (coordinates.x + coordinates.x2) / 2;
  const spawnRight = rectCenterX <= viewportCenterX;

  let existingOverlay = document.querySelector("#" + overlayID)
  const existingIsMinimized = existingOverlay && existingOverlay.shadowRoot.querySelector(`#translation${overlayID}`) === null;
  minimize = existingOverlay ? existingIsMinimized : minimize;
  existingOverlay = existingOverlay || document.querySelector("#translatingOverlay");
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayID;
  overlay.attachShadow({mode: 'open'}); // Attach a shadow root to the overlay 
  // Calculate the left position
  const leftPosition = spawnRight ? coordinates.x2 + window.scrollX : coordinates.x - 300 + window.scrollX;

  // Apply styles to the shadow root
  overlay.shadowRoot.innerHTML = `
    <style>
      ${materialIconsCss} /* Insert the Material Icons stylesheet here */
      :host {
        display: flex;
        flex-direction: column;
        background-color: white;
        border: 1px solid #cccccc;
        width: var(--width);
        height: auto;
        max-height: 480px;
        position: absolute;
        top: ${coordinates.y + window.scrollY}px;
        left: var(--left-position);
        z-index: var(--z-index);
      }
      .overlay-controls {
        height: 30px;
      }
      #translation${overlayID} {
        overflow-y: auto; /* Make the content area scrollable */
        max-height: 450px;
        height: auto; /* Add this line to allow the content area to shrink in height when the content is less than full */
        color: black;
        white-space: pre-line;
      }
      #original${overlayID} {
        color: black;
      }
      #dragButton${overlayID} {
        cursor: move; /* Change cursor to move icon on hover */
      }
      .material-icons {
        font-size: 18px
      }
      #overlay-restore-button${overlayID} {
        background-color: red;
      }
    </style>
    <!-- Overlay content -->
    <button id="overlay-restore-button${overlayID}" title="Restore" style="display: none;">+</button>
    <div class="overlay-controls restored" style="right: 5px; display: flex; justify-content: space-between;">
      <div>
        <button id="toggleButton${overlayID}" title="Show Original/Translation"><i class="material-icons">translate</i></button>
        <button id="playButton${overlayID}" title="Play Pronunciation"><i class="material-icons">play_arrow</i></button>
        <button id="openSidePanelButton${overlayID}" style="margin-right: 5px" title="Open Side Panel"><i class="material-icons">open_in_new</i></button>
      </div>
      <div>
        <button id="dragButton${overlayID}" title="Drag"><i class="material-icons">open_with</i></button>
        <button id="overlay-minimize-button${overlayID}" title="Minimize"><i class="material-icons">remove</i></button>
        <button id="overlay-close-button${overlayID}" title="Close"><i class="material-icons">close</i></button>
      </div>
    </div>
    <p id="translation${overlayID}" class="restored">${translation}</p>
    <audio id="pronunciation${overlayID}" src="data:audio/mp3;base64,${pronunciation}" style="display: none;"></audio>
    <p id="original${overlayID}" contentEditable="true" style="display: none;">${original}</p>
  `;
  overlay.style.setProperty('--left-position', `${leftPosition}px`);  
  overlay.style.setProperty('--width', `300px`);
  overlay.style.setProperty('--z-index', `999`);

  // Append the overlay to the document body
  document.body.appendChild(overlay);
  attachEventListeners(overlayID, spawnRight, pronunciation, translation, original);
  if (minimize) {
    if (spawnRight) {
      minimizeOverlayRight(overlayID)
    } else {
      minimizeOverlayLeft(overlayID)
    }
  }
}

// TODO: doesn't work after drag. always minimizes to the left
// Minimize when text spawned to the left
function minimizeOverlayLeft(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  const currentLeftPosition = parseInt(overlay.style.getPropertyValue('--left-position'));
  overlay.style.setProperty('--left-position', (currentLeftPosition + 270) + "px");
  overlay.style.setProperty('--width', "30px");
  overlay.style.setProperty('--z-index', "998");

  shadowRoot.querySelectorAll(".restored").forEach(element => element.style.display = "none");
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).style.display = "block";
}

// Minimize when text spawned to the right
function minimizeOverlayRight(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  const currentLeftPosition = parseInt(overlay.style.getPropertyValue('--left-position'));
  overlay.style.setProperty('--left-position', currentLeftPosition + "px");
  overlay.style.setProperty('--width', "30px");
  overlay.style.setProperty('--z-index', "998");

  shadowRoot.querySelectorAll(".restored").forEach(element => element.style.display = "none");
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).style.display = "block";
}

// Restore when text spawned to the left
function restoreOverlayLeft(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  shadowRoot.querySelectorAll(".restored").forEach(element => element.style.display = "flex");
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).style.display = "none";
  const currentLeftPosition = parseInt(overlay.style.getPropertyValue('--left-position'));
  overlay.style.setProperty('--left-position', `${currentLeftPosition - 270}px`);
  overlay.style.setProperty('--width', "300px");
  overlay.style.setProperty('--z-index', "999");
}

// Restore when text spawned to the right
function restoreOverlayRight(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  shadowRoot.querySelectorAll(".restored").forEach(element => element.style.display = "flex");
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).style.display = "none";
  const currentLeftPosition = parseInt(overlay.style.getPropertyValue('--left-position'));
  overlay.style.setProperty('--left-position', `${currentLeftPosition}px`);
  overlay.style.setProperty('--width', "300px");
  overlay.style.setProperty('--z-index', "999");
}

function attachEventListeners(overlayID, spawnRight, pronunciation, translation, original) {
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

  shadowRoot.querySelector("#overlay-minimize-button" + overlayID).addEventListener("click", () => spawnRight === true ? minimizeOverlayRight(overlayID) : minimizeOverlayLeft(overlayID));
  shadowRoot.querySelector("#overlay-restore-button" + overlayID).addEventListener("click", () => spawnRight === true ? restoreOverlayRight(overlayID) : restoreOverlayLeft(overlayID));
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

  const openSidePanelButton = shadowRoot.getElementById("openSidePanelButton" + overlayID);
  openSidePanelButton.addEventListener("click", function() {
    openSidePanel(overlayID);
    updateContent(translation, original, pronunciation);
    const minimizeButton = shadowRoot.getElementById("overlay-minimize-button" + overlayID);
    minimizeButton.click();
  });
}

function handleReversion(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  const openSidePanelButton = shadowRoot.getElementById("openSidePanelButton" + overlayID);
  const restoreButton = shadowRoot.getElementById("overlay-restore-button" + overlayID);
  openSidePanelButton.disabled = false;
  restoreButton.style.backgroundColor = 'red';
  openSidePanelButton.style.backgroundColor = '';
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

function updateTranslationDialog(translation, overlayID, original, pronunciation, updateButton = false) {
  const overlay = document.querySelector("#" + overlayID);
  if (overlay) {
    const shadowRoot = overlay.shadowRoot;
    const translationElement = shadowRoot.querySelector(`#translation${overlayID}`);
    if (translationElement) {
      translationElement.textContent = translation;

      if (updateButton) {
        const old_element = shadowRoot.getElementById("openSidePanelButton" + overlayID);
        const new_element = old_element.cloneNode(true);
        old_element.parentNode.replaceChild(new_element, old_element);
        new_element.addEventListener("click", function() {
          openSidePanel(overlayID);
          updateContent(translation, original, pronunciation);
          const minimizeButton = shadowRoot.getElementById("overlay-minimize-button" + overlayID);
          minimizeButton.click();
        });
      }
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

function createSidePanel() {
  console.log("creating")
  const sidePanel = document.createElement('div');
  sidePanel.id = 'veebeeSidePanel';
  sidePanel.attachShadow({mode: 'open'}); // Attach a shadow root to the overlay

  const controlsHTML = `
  <style>
    ${materialIconsCss}
    :host {
      display: none;
      flex-direction: column;
      position: fixed;
      right: 0;
      top: 0;
      width: 200px;
      height: 100vh;
      background-color: #f0f0f0;
      z-index: 1000;
      padding: 10px;
      box-shadow: -2px 0 5px rgba(0,0,0,0.1);
    }
    .overlay-controls {
      height: 30px;
    }
    #translationSidePanel {
      overflow-y: auto;
      color: black;
      white-space: pre-line;
    }
    #originalSidePanel {
      color: black;
    }
    .material-icons {
      font-size: 18px
    }
  </style>
  <div class="overlay-controls" style="right: 5px; display: flex; justify-content: space-between;">
    <div>
      <button id="toggleButtonSidePanel" title="Show Original/Translation"><i class="material-icons">translate</i></button>
      <button id="playButtonSidePanel" title="Play Pronunciation"><i class="material-icons">play_arrow</i></button>
    </div>
    <div>
      <button id="closeSidePanelButton" title="Close"><i class="material-icons">close</i></button>
    </div>
  </div>
  <div id="contentContainer"></div>
  `;
  const shadowRoot = sidePanel.shadowRoot;
  shadowRoot.innerHTML = controlsHTML;
  document.body.appendChild(sidePanel);

  const closeButton = sidePanel.shadowRoot.querySelector("#closeSidePanelButton")
  closeButton.addEventListener('click', closeSidePanel);

  const toggleButton = shadowRoot.getElementById("toggleButtonSidePanel");
  toggleButton.addEventListener("click", function() {
    const translationElement = shadowRoot.getElementById("translationSidePanel");
    const originalElement = shadowRoot.getElementById("originalSidePanel");
    
    const isTranslationVisible = translationElement.style.display !== "none";
    translationElement.style.display = isTranslationVisible ? "none" : "block";
    originalElement.style.display = isTranslationVisible ? "block" : "none";
  });
}

function openSidePanel(overlayID) {
  const sidePanel = document.querySelector("#veebeeSidePanel");
  sidePanel.style.display = 'flex';
  if (previousOverlayId && previousOverlayId !== overlayID) {
    console.log(previousOverlayId);
    handleReversion(previousOverlayId);
  }
  previousOverlayId = overlayID;
  const overlay = document.querySelector("#" + overlayID);
  const shadowRoot = overlay.shadowRoot;
  const openSidePanelButton = shadowRoot.getElementById("openSidePanelButton" + overlayID);
  const restoreButton = shadowRoot.getElementById("overlay-restore-button" + overlayID);
  openSidePanelButton.disabled = true;
  restoreButton.style.backgroundColor = 'teal';
  openSidePanelButton.style.backgroundColor = 'teal';
}

function closeSidePanel() {
  const sidePanel = document.querySelector("#veebeeSidePanel");
  sidePanel.style.display = 'none';
  handleReversion(previousOverlayId);
}

function updateContent(translation, original, pronunciation) {
  const sidePanel = document.querySelector("#veebeeSidePanel");
  const shadowRoot = sidePanel.shadowRoot;
  const contentContainer = shadowRoot.querySelector('#contentContainer');
  contentContainer.innerHTML = `
    <p id="translationSidePanel" class="restored">${translation}</p>
    <audio id="pronunciationSidePanel" src="data:audio/mp3;base64,${pronunciation}" style="display: none;"></audio>
    <p id="originalSidePanel" contentEditable="true" style="display: none;">${original}</p>
  `;

  const playButton = shadowRoot.querySelector("#playButtonSidePanel");
  playButton.addEventListener("click", () => {
    const audioElement = shadowRoot.querySelector("#pronunciationSidePanel");
    audioElement.play();
  });
  if (pronunciation) {
    playButton.disabled = false;
  } else {
    playButton.disabled = true;
  }
}
