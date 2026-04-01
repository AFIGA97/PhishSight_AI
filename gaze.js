/* global webgazer, chrome */

let lastGaze = null;

// Start WebGazer and keep the latest gaze point
try {
  webgazer
    .setRegression('ridge')
    .setGazeListener((data, elapsedTime) => {
      if (!data) return;
      lastGaze = { x: data.x, y: data.y, t: Date.now() };
    })
    .begin();
} catch (e) {
  console.error('WebGazer init error:', e);
}

// Answer background.js when it asks where the user is looking
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_GAZE_REGION') {
    const now = Date.now();
    let region = 'unknown';

    if (lastGaze && now - lastGaze.t < 4000) {
  region = lastGaze.y < 150 ? 'url_bar' : 'content';
} else {
  region = 'content';   // assume content if no recent gaze
}


    sendResponse({ region });
    return true;
  }
});

