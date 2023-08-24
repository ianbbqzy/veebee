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
    {id: 'multiple', title: 'Capture multiple text bubbles (works best when capture an entire page)'},
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
  }
}

// Set the state of the options page based on the current config
chrome.storage.sync.get((config) => {
  state.api.forEach((item) => item.checked = item.id === config.api)
  state.capture_mode.forEach((item) => item.checked = item.id === config.capture_mode)
  state.pronunciation.forEach((item) => item.checked = item.id === config.pronunciation)
  state.source_lang.forEach((item) => item.checked = item.id === config.source_lang)
  state.target_lang.forEach((item) => item.checked = item.id === config.target_lang)
  state.icon.forEach((item) => item.checked = item.id === config.icon)
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

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'API'),
      state.api.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'api',
              checked: item.checked && 'checked',
              onchange: events.option('api', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Capture Mode'),
      state.capture_mode.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'capture_mode',
              checked: item.checked && 'checked',
              onchange: events.option('capture_mode', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Pronunciation'),
      state.pronunciation.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'pronunciation',
              checked: item.checked && 'checked',
              onchange: events.option('pronunciation', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Translate From'),
      state.source_lang.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'source_lang',
              checked: item.checked && 'checked',
              onchange: events.option('source_lang', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Translate To'),
      state.target_lang.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'target_lang',
              checked: item.checked && 'checked',
              onchange: events.option('target_lang', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),

    m('.bs-callout',
      m('h4.mdc-typography--headline5', 'Extension Icon'),
      state.icon.map((item) =>
        m('label.s-label', {onupdate: onupdate(item)},
          m('.mdc-radio',
            m('input.mdc-radio__native-control', {
              type: 'radio', name: 'icon',
              checked: item.checked && 'checked',
              onchange: events.option('icon', item)
            }),
            m('.mdc-radio__background',
              m('.mdc-radio__outer-circle'),
              m('.mdc-radio__inner-circle'),
            ),
          ),
          m('span', item.title)
        )
      )
    ),
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
