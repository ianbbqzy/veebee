// for stuff that doesn't involve the DOM of the web page the user is viewing

// Set default config values
chrome.storage.sync.get((config) => {
  if (!config.api) {
    chrome.storage.sync.set({api: 'deepl'})
  }

  if (!config.source_lang) {
    chrome.storage.sync.set({source_lang: 'Japanese'})
  }

  if (!config.target_lang) {
    chrome.storage.sync.set({target_lang: 'English'})
  }

  if (config.icon === undefined) {
    config.icon = false
    chrome.storage.sync.set({icon: false})
  }

  chrome.action.setIcon({
    path: [16, 19, 38, 48, 128].reduce((all, size) => (
      color = config.icon ? 'light' : 'dark',
      all[size] = `/icons/${color}/${size}x${size}.png`,
      all
    ), {})
  })
})

// This is triggered when extension icon is clicked. This is the main entry point
// for screenshot capture. 
// It injects the content script into the active tab.
chrome.action.onClicked.addListener((tab) => {
  pingContentScript(tab, 'initCrop');
})

// take-screenshot is received when keyboard shortcut is triggered, as defined in manifest.json
// This is another entry point for screenshot capture.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      pingContentScript(tabs[0], 'initCrop');
    })
  }
})

// capture request is received when the user cropping by the user is done.
// active rquest is received when 
chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (req.message === 'capture') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.captureVisibleTab(tabs[0].windowId, (image) => {
        res({message: 'image', image: image})
      })
    })
  }
  else if (req.message === 'active') {
    // Change the extension icon and title based on whether the user is cropping
    if (req.active) {
      chrome.storage.sync.get(() => {
        chrome.action.setTitle({tabId: sender.tab.id, title: 'Crop'})
        chrome.action.setBadgeText({tabId: sender.tab.id, text: '◩'})
      })
    }
    else {
      chrome.action.setTitle({tabId: sender.tab.id, title: 'Crop Initialized'})
      chrome.action.setBadgeText({tabId: sender.tab.id, text: ''})
    }
  }
  return true
})

// Create context menu option
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-menu',
    // chrome replaces %s with whatever is highlighted
    title: 'Translate %s',
    // selects what's hightlighted by the cursor?
    contexts: ['selection']
  });
});

// Handle when context menu is clicked
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log(info.menuItemId)
  if (info.menuItemId === "translate-menu") {
    // Let content script know that a text translation is initialized.
    // This has to be done in background script in case the content
    // script has not been initialized.
    pingContentScript(tab, 'initTextTranslation');

    // continue with the translation process.
    chrome.storage.sync.get((config) => {
      if (!config.idToken) {
        pingContentScript(tab, "Please login first. Right click on the extension icon and click on options.")
      } else {
        callTranslateWithText(info.selectionText, config.source_lang, config.target_lang, config.api, config.idToken)
        .then(response => {
          pingContentScript(tab, response)
        })
        .catch(error => {
          console.error(`error: ${error.message}`);
          pingContentScript(tab, `error: ${error.message}`)
        });
      }
    })
  }
});

async function callTranslateWithText(text, source_lang, target_lang, api, idToken) {
  const url = "__BACKEND_URL__";
  const headers = new Headers();
  headers.append('Authorization', `Bearer ${idToken}`);
  headers.append('Content-Type', `application/json`);

  try {
    const resp = await fetch(url + '/translate-text?api=' + api + '&source_lang=' + source_lang + '&target_lang=' + target_lang, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        'text': text
      })
    }).then(res => res.json())
    if (resp.error) {
      return `Translation: ${resp.error}`;
    }
    return `Translation: ${resp.translation}`;
  } catch (err) {
    return `Translation: ${err.message}`;
  }
}

// Sends a message to the content script
// If it doesn't receive a response within a specific timeout, it
// determines that content script is not initialized and it will initialize it.
// After another small timeout, it'll try to send the message again.
function pingContentScript(tab, message) {
  chrome.tabs.sendMessage(tab.id, {message: message}, (res) => {
    if (res) {
      // if response is received before the timeout is triggered
      // clears the timeout call
      clearTimeout(timeout)
    }
  })

  var timeout = setTimeout(() => {
    chrome.scripting.insertCSS({files: ['css/content.css'], target: {tabId: tab.id}})
    chrome.scripting.executeScript({files: ['content.js'], target: {tabId: tab.id}})

    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {message: message})
    }, 100)
  }, 100)
}
