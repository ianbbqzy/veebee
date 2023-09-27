// for stuff that doesn't involve the DOM of the web page the user is viewing

// Set default config values
chrome.storage.sync.get((config) => {
  if (!config.api) {
    chrome.storage.sync.set({api: 'gpt'})
  }

  if (!config.capture_mode) {
    chrome.storage.sync.set({capture_mode: 'single'})
  }

  if (!config.pronunciation) {
    chrome.storage.sync.set({pronunciation: 'off'})
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
      color = 'rice',
      all[size] = `/icons/${color}/${size}x${size}.png`,
      all
    ), {})
  })
})

// This is triggered when extension icon is clicked. This is the main entry point
// for screenshot capture. 
// It injects the content script into the active tab.
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.sync.get((config) => {
    if ('__SEND_AUTH__' === 'false' || config.idToken) {
      if (config.capture_mode === 'screen') {
        pingContentScript(tab, 'screenCapture');
      } else {
        pingContentScript(tab, 'initCrop');
      }
    } else {
      // open options page if user is not logged in
      chrome.runtime.openOptionsPage();
    }
  })
})

// take-screenshot is received when keyboard shortcut is triggered, as defined in manifest.json
// This is another entry point for screenshot capture.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.storage.sync.get((config) => {
        if (config.capture_mode === 'screen') {
          pingContentScript(tabs[0], 'screenCapture');
        } else {
          pingContentScript(tabs[0], 'initCrop');
        }
      })
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
  } else if (req.message === 'logout') {
    chrome.runtime.openOptionsPage();
    setTimeout(() => {
      chrome.runtime.sendMessage({message: 'logout'});
    }, 500);
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
  if (info.menuItemId === "translate-menu") {
    // Let content script know that a text translation is initialized.
    // This has to be done in background script in case the content
    // script has not been initialized.
    pingContentScript(tab, 'initTextTranslation');

    // continue with the translation process.
    chrome.storage.sync.get((config) => {
      if (!config.idToken) {
        pingContentScript(tab, {"translation": "Please login first. Right click on the extension icon and click on options.", pronunciation: undefined});
      } else {
        callTranslateWithText(info.selectionText, config.source_lang, config.target_lang, config.api, config.idToken, config.pronunciation)
        .then(response => {
          if (response.error) {
            pingContentScript(tab, {"error": `Translation: ${response.error}`, pronunciation: undefined});
          } else {
            pingContentScript(tab, response)
          }
        })
        .catch(error => {
          console.error(`error: ${error.message}`);
          pingContentScript(tab, {"error": `Translation: ${error.message}`, pronunciation: undefined});
        });
      }
    })
  }
});

// Modify the callTranslateWithText function
async function callTranslateWithText(text, source_lang, target_lang, api, idToken, pronunciation) {
  const url = "__BACKEND_URL__";
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