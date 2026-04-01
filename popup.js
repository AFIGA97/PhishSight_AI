// ======== API endpoints ========
const MESSAGE_API_URL  = "http://127.0.0.1:8000/analyze_message";
const PAGE_API_URL     = "http://127.0.0.1:8000/analyze_message";
const FEEDBACK_API_URL = "http://127.0.0.1:8000/feedback";


// ======== Security tips ========
const SECURITY_TIPS = [
  "Be cautious of urgent language and links asking for passwords.",
  "Always check the sender's email address and domain carefully.",
  "Hover over links to see the real URL before clicking.",
  "Never enter passwords on pages opened from unexpected emails or SMS.",
  "Look for spelling mistakes or strange grammar in messages.",
  "If an offer looks too good to be true, it probably is.",
  "Do not download attachments from unknown or untrusted senders.",
  "Type important website addresses manually instead of clicking links.",
  "Check that the website address matches the real brand (no extra words or numbers).",
  "Enable multi-factor authentication so one stolen password is not enough."
];

function getRandomTip() {
  const idx = Math.floor(Math.random() * SECURITY_TIPS.length);
  return SECURITY_TIPS[idx];
}


// Use only origin (domain) as key for overrides
function getOrigin(urlString) {
  try {
    const u = new URL(urlString);
    return u.origin;             // e.g. https://www.flipkart.com
  } catch (e) {
    return urlString;
  }
}


// ======== DOM elements ========
const statusEl      = document.getElementById("status");
const resultEl      = document.getElementById("result");
const labelEl       = document.getElementById("label");
const tokensEl      = document.getElementById("tokens");
const tipEl         = document.getElementById("tipText");
const messageInput  = document.getElementById("messageInput");
const labelBox      = document.getElementById("labelBox");
const labelIconEl   = document.getElementById("labelIcon");
const feedbackMsgEl = document.getElementById("feedbackMessage");
const explanationEl = document.getElementById("explanation");
const eyeGazeBtn    = document.getElementById("eyeGazeBtn");


// ======== Feedback state ========
let lastItemType   = null;   // "url" or "text"
let lastContent    = null;   // origin string or message text
let lastLabel      = null;   // model label
let lastFinalLabel = null;   // final label after override


// ======== Show result (always show model label, then apply overrides for URLs) ========
function showResult(data, itemType, content) {
  resultEl.style.display = "block";
  if (feedbackMsgEl) feedbackMsgEl.textContent = "";

  lastItemType = itemType;          // "url" or "text"
  lastContent  = content;           // origin if itemType === "url", else text
  lastLabel    = data.label;        // model output

  let finalLabel = data.label;

  function render(label) {
    finalLabel = label;
    lastFinalLabel = label;         // remember final label for gaze risk

    // Label text
    labelEl.textContent = label;

    // Reset styles & icon
    labelBox.classList.remove("label-safe", "label-phishing");
    if (labelIconEl) labelIconEl.textContent = "";

    const tokens = data.highlight_tokens || [];
    let explanationText = "";

    if (label === "phishing") {
      labelBox.classList.add("label-phishing");
      if (labelIconEl) labelIconEl.textContent = "⚠";

      if (tokens.length > 0) {
        explanationText =
          "Flagged as phishing because it contains suspicious words or patterns such as: " +
          tokens.slice(0, 5).join(", ") + ".";
      } else {
        explanationText =
          "Flagged as phishing due to URL structure, forms asking for sensitive data, or urgent / too-good-to-be-true language.";
      }
    } else { // safe
      labelBox.classList.add("label-safe");
      if (labelIconEl) labelIconEl.textContent = "✓";

      explanationText =
        "Looks like a safe page. No strong phishing patterns or risky keywords were detected in the content or URL.";
    }

    if (explanationEl) explanationEl.textContent = explanationText;

    // Risky tokens as chips
    tokensEl.innerHTML = tokens
      .map(t => `<span class="token-chip">${t}</span>`)
      .join("");

    // Random tip
    tipEl.textContent = getRandomTip();

    // Eye‑gaze button in popup only for phishing
    if (eyeGazeBtn) {
      eyeGazeBtn.style.display = (label === "phishing") ? "inline-block" : "none";
    }
  }

  // 1) Draw once with the model label (so you always see something)
  render(finalLabel);

  // 2) Apply overrides only for URL items (current web page)
  try {
    if (lastItemType !== "url") return;   // no override for pasted text

    const origin = lastContent;          // analyzed page origin
    if (!origin) return;

    chrome.storage.local.get(["safeOverrides", "scamOverrides"], function (store) {
      const safeOverrides = (store && store.safeOverrides) || {};
      const scamOverrides = (store && store.scamOverrides) || {};

      let overridden = false;

      if (safeOverrides[origin]) {
        finalLabel = "safe";
        overridden = true;
      }
      if (scamOverrides[origin]) {
        finalLabel = "phishing";
        overridden = true;
      }

      if (overridden) {
        render(finalLabel);
      }

      // After overrides, if final label is phishing for a URL page, show gaze consent
      if (lastItemType === "url" && lastFinalLabel === "phishing") {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab && tab.id !== undefined) {
            chrome.tabs.sendMessage(tab.id, { type: "SHOW_GAZE_CONSENT" });
          }
        });
      }
    });
  } catch (e) {
    console.error("Override check error:", e);
  }
}


// ======== API helper ========
async function callApi(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("API error: " + response.status);
  }
  return response.json();
}


// ======== 1) Analyze current page text (itemType = 'url') ========
document.getElementById("analyzePageBtn").addEventListener("click", async () => {
  statusEl.textContent = "Reading page and analyzing...";
  resultEl.style.display = "none";
  if (feedbackMsgEl) feedbackMsgEl.textContent = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId    = tab.id;
    const pageUrl  = tab.url;
    const pageOrig = getOrigin(pageUrl);   // use origin for overrides

    const [injResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body ? (document.body.innerText || "") : ""
    });

    if (!injResult || !injResult.result) {
      statusEl.textContent = "Could not read page content.";
      return;
    }

    const pageText = injResult.result;

    const data = await callApi(PAGE_API_URL, { text: pageText });
    statusEl.textContent = "Page analysis complete.";

    // itemType is 'url'; content is the origin
    showResult(data, "url", pageOrig);

    // Decide risk AFTER overrides, for background logic if needed
    const riskScore = (lastFinalLabel === "phishing") ? 0.9 : 0.1;

    chrome.runtime.sendMessage(
      { type: "PAGE_ANALYZED", tabId: tabId, riskScore: riskScore },
      () => { void chrome.runtime.lastError; }
    );
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
    resultEl.style.display = "none";
  }
});


// ======== 2) Analyze pasted email/SMS text (itemType = 'text') ========
document.getElementById("analyzeTextBtn").addEventListener("click", async () => {
  const text = messageInput.value.trim();
  if (!text) {
    statusEl.textContent = "Please paste some email or SMS text first.";
    resultEl.style.display = "none";
    return;
  }

  statusEl.textContent = "Analyzing pasted text...";
  resultEl.style.display = "none";
  if (feedbackMsgEl) feedbackMsgEl.textContent = "";

  try {
    const data = await callApi(MESSAGE_API_URL, { text });
    statusEl.textContent = "Text analysis complete.";
    showResult(data, "text", text);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
    resultEl.style.display = "none";
  }
});


// ======== 3) Feedback handlers (backend + local overrides for URLs) ========
async function sendFeedback(userLabel) {
  if (!lastItemType || !lastContent || !lastLabel) {
    statusEl.textContent = "Run an analysis before sending feedback.";
    return;
  }

  try {
    await callApi(FEEDBACK_API_URL, {
      item_type:   lastItemType,   // "url" or "text"
      content:     lastContent,    // origin or text
      model_label: lastLabel,      // "safe" or "phishing"
      user_label:  userLabel       // "safe" or "scam"
    });

    if (feedbackMsgEl) {
      feedbackMsgEl.textContent = "Feedback recorded. Thank you!";
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error sending feedback: " + err.message;
  }
}

document.getElementById("feedbackSafeBtn").addEventListener("click", () => {
  sendFeedback("safe");

  // Only override for current web page, not pasted text
  if (lastItemType !== "url" || !lastContent) return;
  const origin = lastContent;

  chrome.storage.local.get(["safeOverrides"], function (data) {
    const overrides = data.safeOverrides || {};
    overrides[origin] = true;
    chrome.storage.local.set({ safeOverrides: overrides }, function () {
      if (feedbackMsgEl) {
        feedbackMsgEl.textContent = "Marked as Safe (override saved).";
      }
      // Re-render with override
      showResult({ label: lastLabel, highlight_tokens: [] }, "url", origin);
    });
  });
});

document.getElementById("feedbackScamBtn").addEventListener("click", () => {
  sendFeedback("scam");

  if (lastItemType !== "url" || !lastContent) return;
  const origin = lastContent;

  chrome.storage.local.get(["scamOverrides"], function (data) {
    const overrides = data.scamOverrides || {};
    overrides[origin] = true;
    chrome.storage.local.set({ scamOverrides: overrides }, function () {
      if (feedbackMsgEl) {
        feedbackMsgEl.textContent = "Marked as Scam (override saved).";
      }
      showResult({ label: lastLabel, highlight_tokens: [] }, "url", origin);
    });
  });
});


// ======== 4) Optional eye‑gaze button in popup ========
if (eyeGazeBtn) {
  eyeGazeBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "SHOW_GAZE_CONSENT" });
    }
  });
}
