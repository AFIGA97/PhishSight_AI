function getVisibleText() {
  return document.body ? (document.body.innerText || "") : "";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1) Handle request from popup.js to read page text (optional)
  if (message.action === "GET_PAGE_TEXT") {
    const text = getVisibleText();
    sendResponse({ text });
  }

  // 2) Show gaze consent overlay after phishing label
  if (message.type === "SHOW_GAZE_CONSENT") {
    showGazeConsent();
  }

  // 3) Handle eye‑gaze hint from background.js
  if (message.type === "SHOW_URL_HINT") {
    showGazeHint();
  }
});

// ===== Gaze consent overlay (gold/black card on page) =====
function showGazeConsent() {
  if (!document.body) return;
  if (document.getElementById("phishsight-gaze-consent")) return;

  const overlay = document.createElement("div");
  overlay.id = "phishsight-gaze-consent";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0, 0, 0, 0.70)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "2147483647",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    background:
      "linear-gradient(145deg, rgba(0,0,0,0.96), rgba(25,25,25,0.94))",
    borderRadius: "12px",
    padding: "20px 22px 16px",
    maxWidth: "480px",
    width: "90%",
    boxShadow: "0 14px 40px rgba(0, 0, 0, 0.85)",
    border: "1px solid rgba(224, 175, 45, 0.55)",
    color: "#f5f5f5"
  });

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <div style="
        width:28px;height:28px;border-radius:6px;
        background:linear-gradient(135deg,#ffd700,#ffb300);
        display:flex;align-items:center;justify-content:center;
        color:#000;font-weight:700;font-size:14px;">
        P
      </div>
      <div style="font-size:16px;font-weight:700;letter-spacing:.04em;
                  text-transform:uppercase;color:#ffd54f;">
        PhishSight AI
      </div>
    </div>

    <h2 style="margin:0 0 6px;font-size:20px;">Enable gaze assist</h2>
    <p style="margin:0 0 10px;font-size:13px;color:#f0e4b1;">
      Allow PhishSight to briefly use your camera so we can guide your attention
      to risky URLs and warning banners while you browse.
    </p>

    <div style="
      display:inline-flex;align-items:center;gap:6px;
      padding:4px 9px;border-radius:999px;
      background:rgba(243,202,82,0.12);color:#ffecb3;
      font-size:10px;text-transform:uppercase;letter-spacing:.08em;
      margin-bottom:10px;">
      <span style="width:7px;height:7px;border-radius:50%;
        background:#ffd54f;box-shadow:0 0 6px rgba(255,213,79,0.8);"></span>
      <span>Privacy-first camera access</span>
    </div>

    <ul style="margin:0 0 10px 18px;padding:0;font-size:12px;color:#fff3cd;">
      <li>Camera is used only to estimate where you look on the screen.</li>
      <li>No raw images or video are stored, uploaded, or shared.</li>
      <li>Gaze assist turns on only when a page looks suspicious.</li>
    </ul>

    <p style="margin:0 0 14px;font-size:11px;color:#c9b889;line-height:1.5;">
      You can revoke camera access at any time from your browser’s permissions.
      PhishSight never records audio and does not keep biometric templates.
    </p>

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:2px;">
      <button id="ps-gaze-skip" style="
        border:none;border-radius:999px;padding:6px 14px;
        background:transparent;color:#f0f0f0;font-size:12px;cursor:pointer;">
        Not now
      </button>
      <button id="ps-gaze-enable" style="
        border:none;border-radius:999px;padding:6px 16px;
        background:linear-gradient(135deg,#ffd700,#ffb300);
        color:#000;font-size:12px;font-weight:700;cursor:pointer;
        box-shadow:0 6px 16px rgba(0,0,0,0.7);">
        Enable camera for gaze assist
      </button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const skipBtn = card.querySelector("#ps-gaze-skip");
  const enableBtn = card.querySelector("#ps-gaze-enable");

  skipBtn.addEventListener("click", () => {
    overlay.remove();
  });

  enableBtn.addEventListener("click", async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      overlay.remove();
      showGazeHint();
    } catch (e) {
      console.error("Camera permission error", e);
      overlay.remove();
    }
  });
}

// ===== Your existing warning box after gaze =====
function showGazeHint() {
  const old = document.getElementById("phishsight-gaze-hint");
  if (old) old.remove();

  const box = document.createElement("div");
  box.id = "phishsight-gaze-hint";

  box.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:6px;">
      <!-- warning logo -->
      <div style="
        position:relative;
        width:32px;
        height:28px;
      ">
        <div style="
          width:0;
          height:0;
          border-left:16px solid transparent;
          border-right:16px solid transparent;
          border-bottom:28px solid #ffcc00;
          filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        "></div>
        <span style="
          position:absolute;
          top:9px;
          left:50%;
          transform:translateX(-50%);
          font-weight:bold;
          font-size:16px;
          color:#2b0000;
        ">!</span>
      </div>

      <div style="text-align:left;flex:1;">
        <div style="font-weight:600;font-size:15px;margin-bottom:2px;">
          Warning: Possible phishing page
        </div>
        <div style="font-size:13px;opacity:0.9;">
          Carefully check the website address before entering any passwords, OTPs, or banking details.
        </div>
      </div>
    </div>
  `;

  Object.assign(box.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    maxWidth: "440px",
    background: "linear-gradient(135deg, #2b0000, #000)",
    color: "#fff",
    padding: "18px 22px",
    borderRadius: "10px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255, 204, 0, 0.8)",
    zIndex: "2147483647",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  });

  document.body.appendChild(box);

  setTimeout(() => {
    const el = document.getElementById("phishsight-gaze-hint");
    if (el) el.remove();
  }, 6000);
}
