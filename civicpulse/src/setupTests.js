// jsdom lacks these; react-router needs them when it loads.
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

// jsdom has no matchMedia; the theme switch asks for it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
}

// jsdom does not implement scrolling.
window.scrollTo = () => {};
