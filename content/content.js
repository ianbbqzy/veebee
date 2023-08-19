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
  } else if (req.message === "initTextTranslation") {
    // translation requested
    showTextTranslationDialog("translating")
  } else {
    // If neither of the above, the message is the result
    // of the translation request. It could also be an error message.
    showTextTranslationDialog(req.message)
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
  chrome.storage.sync.get((config) => {
    if (selection) {
      const coordinates = {...selection}
      jcrop.release()
      selection = null
      jcropOverlay(false)

      chrome.runtime.sendMessage({message: 'capture'}, (res) => {
        if (!config.idToken) {
          showTranslationDialog("Please login first. Right click on the extension icon and click on options.", coordinates, "")
        } else {
          crop(res.image, coordinates, (image) => {
            getTranslation(image, coordinates, config.api, config.idToken, config.source_lang, config.target_lang)
          })
          showTranslationDialog("translating", coordinates, "")
        }

      })
    }
  })
}

async function callTranslateWithScreenshot(image, source_lang, target_lang, api, idToken) {
  const url = process.env.BACKEND_URL;
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${idToken}`);
  headers.append('Content-Type', `application/json`);

  try {
    const resp = await fetch(url + '/translate-img?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'imageDataUrl': image
      })
    }).then(res => res.json())

    if (resp.error) {
      return `Translation: ${resp.error}`;
    }
    return {"translation": resp.translation, "original": resp.original, "pronunciation": resp.pronunciation};
  } catch (err) {
    return `Translation: ${err.message}`;
  }
}

var getTranslation = async (image, coordinates, api, idToken, source_lang, target_lang) => {
  callTranslateWithScreenshot(image, source_lang, target_lang, api, idToken)
  .then(response => {
    if (response.translation) {
      showTranslationDialog(response, coordinates, response.original)
    } else {
      showTranslationDialog(response, coordinates, "")
    }
  })
  .catch(error => {
    console.error(`Error: ${error.message}`);
    showTranslationDialog(`Error: ${error.message}`, coordinates, "")
  });
}

window.addEventListener('resize', ((timeout) => () => {
  jcrop.destroy()
  init(() => jcropOverlay(null))
})())

function showTextTranslationDialog(translation) {
  const selection = window.getSelection();
  if (!selection) {
    console.log("Nothing was selected");
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();

  const existingOverlay = document.querySelector("#overlay") || document.querySelector("#testTranslationOverlay");
  if (existingOverlay && isSelectionInsideElement(existingOverlay)) {
    const overlayRect = existingOverlay.getBoundingClientRect();

    console.log("Selection is inside an existing overlay")
    showTranslationDialog(translation,{
      x: overlayRect.left,
      y: overlayRect.top,
      x2: overlayRect.right,
      y2: overlayRect.bottom,
    }, selection.toString(), "testTranslationOverlay");
  } else {
    console.log("Selection is not inside an existing overlay")
    showTranslationDialog(translation, {
      x: rect.left,
      y: rect.top,
      x2: rect.right,
      y2: rect.bottom,
    }, selection.toString(), "testTranslationOverlay");
  }
}

function showTranslationDialog(translation, coordinates, original, overlayID = 'overlay') {
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportCenterX = (viewportWidth / 2) + window.scrollX;
  const rectCenterX = (coordinates.x + coordinates.x2) / 2;

  const spawnX = rectCenterX <= viewportCenterX
      ? coordinates.x2 + window.scrollX
      : coordinates.x - 300 + window.scrollX;

  const existingOverlay = document.querySelector("#" + overlayID);
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayID;
  overlay.style.cssText = `
      background-color: white;
      font-size: 16px;
      border: 1px solid #cccccc;
      width: 300px;
      white-space: pre-wrap;
      position: absolute;
      top: ${coordinates.y + window.scrollY}px;
      left: ${spawnX}px;
      z-index: 999;
  `;

  overlay.innerHTML = `
    <p id="translation${overlayID}">${translation.translation}</p>
    <audio id="pronunciation${overlayID}" src="data:audio/mp3;base64,${translation.pronunciation}" style="display: none;"></audio>
    <div class="overlay-controls" style="position: absolute; top: 5px; right: 5px; display: flex;">
        <button id="playButton${overlayID}" style="margin-right: 5px;">Play Pronunciation</button>
        <button id="toggleButton${overlayID}" style="margin-right: 5px;">Toggle</button>
        <button id="overlay-minimize-button${overlayID}" style="margin-right: 5px;">–</button>
        <button id="overlay-close-button${overlayID}">OK</button>
    </div>
    <p id="original${overlayID}" contentEditable="true" style="display: none;">${original}</p>
  `;
  document.body.appendChild(overlay);
  attachEventListeners(overlayID);
}

function minimizeOverlay(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  overlay.dataset.initialHtml = overlay.innerHTML;
  overlay.style.width = "30px";
  overlay.style.height = "30px";
  overlay.innerHTML = `<button id="overlay-restore-button${overlayID}" style="position: absolute; top: 5px; right: 5px;">+</button>`;
  document.querySelector("#overlay-restore-button" + overlayID).addEventListener("click", () => restoreOverlay(overlayID));
}

function restoreOverlay(overlayID) {
  const overlay = document.querySelector("#" + overlayID);
  overlay.style.width = "300px";
  overlay.style.height = "auto";
  overlay.innerHTML = overlay.dataset.initialHtml;
  attachEventListeners(overlayID);
}

function attachEventListeners(overlayID) {
  const overlay = document.querySelector("#" + overlayID);

  document.querySelector("#overlay-minimize-button" + overlayID).addEventListener("click", () => minimizeOverlay(overlayID));
  document.querySelector("#overlay-close-button" + overlayID).addEventListener("click", () => overlay.remove());

  const toggleButton = document.getElementById("toggleButton" + overlayID);
  toggleButton.addEventListener("click", function() {
      const translationElement = document.getElementById("translation" + overlayID);
      const originalElement = document.getElementById("original" + overlayID);
      
      const isTranslationVisible = translationElement.style.display !== "none";
      translationElement.style.display = isTranslationVisible ? "none" : "block";
      originalElement.style.display = isTranslationVisible ? "block" : "none";
  });
}

function crop (image, area, done) {
  const dpr = devicePixelRatio
  console.log("area")
  console.log(area)
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

function isSelectionInsideElement(element) {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) return false;

  const node = selection.anchorNode;
  return element.contains(node);
}