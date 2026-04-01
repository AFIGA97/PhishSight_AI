const enableBtn = document.getElementById("enableBtn");
const skipBtn = document.getElementById("skipBtn");
const statusEl = document.getElementById("status");

// Optional, small preview (hidden until requested)
const previewContainer = document.createElement("div");
previewContainer.style.marginTop = "14px";
previewContainer.style.display = "none";

const toggle = document.createElement("button");
toggle.textContent = "Show camera preview (optional)";
toggle.style.border = "none";
toggle.style.background = "transparent";
toggle.style.color = "#9ba0d8";
toggle.style.fontSize = "11px";
toggle.style.cursor = "pointer";
toggle.style.padding = "0";

const video = document.createElement("video");
video.autoplay = true;
video.muted = true;
video.playsInline = true;
video.style.marginTop = "6px";
video.style.width = "160px";
video.style.height = "120px";
video.style.borderRadius = "8px";
video.style.border = "1px solid rgba(255,255,255,0.18)";
video.style.display = "block";

const caption = document.createElement("div");
caption.textContent = "Preview only on your device, never recorded.";
caption.style.fontSize = "10px";
caption.style.color = "#9ba0d8";
caption.style.marginTop = "4px";

previewContainer.appendChild(toggle);
previewContainer.appendChild(video);
previewContainer.appendChild(caption);
document.querySelector(".card").appendChild(previewContainer);

let currentStream = null;
let previewVisible = false;

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (type || "");
}

async function requestCamera() {
  setStatus("Requesting camera permission…", "");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    currentStream = stream;

    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({ phishsightGazeEnabled: true });
    }

    if (previewVisible) {
      video.srcObject = stream;
    } else {
      stream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }

    setStatus(
      "Camera permission granted. Gaze assist is now enabled.",
      "status-ok"
    );
  } catch (err) {
    console.error(err);
    setStatus(
      "Camera permission denied or failed. Gaze assist will stay off.",
      "status-error"
    );
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({ phishsightGazeEnabled: false });
    }
  }
}

enableBtn.addEventListener("click", requestCamera);

skipBtn.addEventListener("click", () => {
  if (chrome?.storage?.sync) {
    chrome.storage.sync.set({ phishsightGazeEnabled: false });
  }
  window.close && window.close();
});

toggle.addEventListener("click", () => {
  previewVisible = !previewVisible;
  toggle.textContent = previewVisible
    ? "Hide camera preview"
    : "Show camera preview (optional)";

  video.style.display = previewVisible ? "block" : "none";
  caption.style.display = previewVisible ? "block" : "none";
  previewContainer.style.display = "block";

  if (previewVisible) {
    if (currentStream) {
      video.srcObject = currentStream;
    } else {
      requestCamera();
    }
  } else {
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
  }
});
