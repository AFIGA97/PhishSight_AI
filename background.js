let gazeTabId = null;

// Open gaze.html when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create(
    { url: chrome.runtime.getURL('gaze.html') },
    (tab) => {
      if (tab && tab.id !== undefined) {
        gazeTabId = tab.id;
      }
    }
  );
});

// Remember if user manually reopens gaze.html
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('gaze.html')) {
    gazeTabId = tabId;
  }
});

// Listen when popup finishes analyzing a page
// message: { type: 'PAGE_ANALYZED', tabId, riskScore }
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PAGE_ANALYZED') {
    maybeNudgeUser(msg.tabId, msg.riskScore);
  }
});

// Ask gaze page where the user is looking and nudge if needed
function maybeNudgeUser(tabId, riskScore) {
  // Only nudge for risky pages
  if (riskScore < 0.6) return;

  // If we somehow don't have a gaze tab, do nothing
  if (!gazeTabId) return;

  // Ask gaze.html (via runtime messaging) where the user is looking
  chrome.runtime.sendMessage(
    { type: 'GET_GAZE_REGION' },
    (res) => {
      // Ignore "Receiving end does not exist" and similar errors
      if (chrome.runtime.lastError || !res) return;

      // If user is NOT looking at URL bar, show hint on that page
      if (res.region !== 'url_bar') {
        chrome.tabs.sendMessage(tabId, { type: 'SHOW_URL_HINT' });
      }
    }
  );
}
