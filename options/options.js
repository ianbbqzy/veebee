import { firebaseApp } from './firebase_config'
import {
    getAuth,
    onAuthStateChanged
} from 'firebase/auth';
import m from 'mithril';
import 'material-components-web/dist/material-components-web.min.css';

// Auth instance for the current firebaseApp
const auth = getAuth(firebaseApp);

onAuthStateChanged(auth, user => {
    if (user != null) {
        console.log('User is logged in!');
        chrome.storage.sync.set({idToken: user.accessToken})
        fetchUserLimit();
    } else {
      console.log('User is logged out!');
      chrome.storage.sync.set({idToken: ""})
      window.location.replace('./signin.html');
    }
});

document.querySelector('#sign_out').addEventListener('click', () => {
    auth.signOut();
});

// Done authentication stuff

// State used by the options page to determine which options are selected
// and display the selected state in the UI. 
var state = {
  shortcut: {},
  api: [
    {id: 'gpt', title: 'GPT (For in-depth translation)'},
    {id: 'deepl', title: 'DeepL (For quick translation)'}
  ],
  capture_mode: [
    {id: 'single', title: 'Capture a single text bubble'},
    {id: 'multiple', title: 'Capture multiple text bubbles'},
    {id: 'screen', title: 'Capture the entire screen'}
  ],
  pronunciation: [
    {id: 'on', title: 'On'},
    {id: 'off', title: 'Off'}
  ],
  source_lang: [
    {id: 'Japanese', title: 'Japanese'},
    {id: 'Korean', title: 'Korean'},
    {id: 'Chinese', title: 'Chinese'}
  ],
  target_lang: [
    {id: 'English', title: 'English'},
  ],
  icon: [
    {id: false, title: 'Dark Icon'},
    {id: true, title: 'Light Icon'}
  ],
  userLimit: {
    requestCount: 0,
    limit: 0
  },
  // Add OpenAI API Key and API Call Preference to the state
  openai_api_key: '',
  api_call_preference: 'backend'
}

// Set the state of the options page based on the current config
chrome.storage.sync.get((config) => {
  state.api.forEach((item) => item.checked = item.id === config.api)
  state.capture_mode.forEach((item) => item.checked = item.id === config.capture_mode)
  state.pronunciation.forEach((item) => item.checked = item.id === config.pronunciation)
  state.source_lang.forEach((item) => item.checked = item.id === config.source_lang)
  state.target_lang.forEach((item) => item.checked = item.id === config.target_lang)
  state.icon.forEach((item) => item.checked = item.id === config.icon)
  // Set OpenAI API Key and API Call Preference
  state.openai_api_key = config.openai_api_key || '';
  state.api_call_preference = config.api_call_preference || 'backend';
  fetchUserLimit();

  m.redraw()
})

// Get the current keyboard shortcut from the manifest and display it
chrome.commands.getAll((commands) => {
  var command = commands.find((command) => command.name === 'take-screenshot')
  state.shortcut = command.shortcut
  m.redraw()
})

// Event handlers for the options page
// These are called when the user interacts with the UI
// If keyboard shortcut is reset, call button function
// If other options are changed (API, icon), call option function
var events = {
  option: (name, item) => () => {
    state[name].forEach((item) => item.checked = false)
    item.checked = true

    chrome.storage.sync.set({[name]: item.id})
    if (name === 'icon') {
      const color = item.id ? 'light' : 'dark'
      chrome.action.setIcon({
        path: [16, 19, 38, 48, 128].reduce((all, size) => (
          all[size] = `/icons/${color}/${size}x${size}.png`,
          all
        ), {})
      })
    }
  },
  button: (action) => () => {
    chrome.tabs.create({url: {
      shortcut: 'chrome://extensions/shortcuts',
      location: 'chrome://settings/downloads',
    }[action]})
  },
  // Add event handler for OpenAI API Key input field
  openaiApiKey: (value) => {
    state.openai_api_key = value;
    chrome.storage.sync.set({openai_api_key: value});
  },
  // Add event handler for API Call Preference dropdown
  apiCallPreference: (value) => {
    state.api_call_preference = value;
    chrome.storage.sync.set({api_call_preference: value});
  }
}

var onupdate = (item) => (vnode) => {
  if (vnode.dom.classList.contains('active') !== item.checked) {
    vnode.dom.classList.toggle('active')
  }
}

m.mount(document.querySelector('main'), {
  view: () => [
    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Requests made this month / Your monthly request limit'),
      m('p', `${state.userLimit.requestCount} / ${state.userLimit.limit}`)
    ),
    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Keyboard Shortcut'),
      state.shortcut &&
      m('p', 'Current keyboard shortcut. Refresh after updating to see the updated shorcut.', m('code', state.shortcut)),
      !state.shortcut &&
      m('p', 'No keyboard shortcut set'),
      m('button.mdc-button mdc-button--raised s-button', {
        onclick: events.button('shortcut')
        },
        'Update'
      )
    ),
    // Add OpenAI API Key Input Field
    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'OpenAI API Key'),
      m('input.mdc-text-field__input', {
        id: 'openai_api_key',
        value: state.openai_api_key,
        oninput: m.withAttr('value', events.openaiApiKey)
      }),
      m('label.mdc-floating-label', {for: 'openai_api_key'}, 'Enter your OpenAI API Key')
    ),
    // Add API Call Preference Dropdown
    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'API Call Preference'),
      m('select.mdc-select__native-control', {
        id: 'api_call_preference',
        value: state.api_call_preference,
        onchange: m.withAttr('value', events.apiCallPreference)
      },
        m('option', {value: 'backend'}, 'Backend'),
        m('option', {value: 'frontend'}, 'Frontend')
      )
    ),
    // ... rest of the code ...
  ]
})

function fetchUserLimit() {
  chrome.storage.sync.get(['idToken'], function(result) {
    const idToken = result.idToken;
    fetch('http://localhost:3000/get-user-limit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    })
    .then(response => response.json())
    .then(data => {
      state.userLimit.requestCount = data.request_count;
      state.userLimit.limit = data.limit;
      m.redraw();
    })
    .catch(error => console.error('Error:', error));
  });
}