// DOM elements
const urlWarning = document.getElementById("url-warning");
const connectionStatus = document.getElementById("connection-status");
const connectionStatusText = document.getElementById(
  "connection-status-text",
);
const gateIdInput = document.getElementById("gate-id");
const videoContainer = document.getElementById("video-container");
const qrReaderElem = document.getElementById("qr-reader");
const startBtn = document.getElementById("start-button");
const flipBtn = document.getElementById("flip-button");
const resultBanner = document.getElementById("result-banner");
const gasIframe = document.getElementById("gas-bridge");

const GATE_ID_STORAGE_KEY = "qrgate.gateId";
const DUPLICATE_SCAN_COOLDOWN_MS = 3000;
const SCAN_FPS = 12;
const SCAN_QRBOX = { width: 260, height: 260 };

let status = "idle"; // idle | scanning | processing
let currentCamera = "environment";
let html5Qrcode = null;
let isScannerRunning = false;
let lastScannedCode = null;
let lastScanTimestamp = 0;

gateIdInput.value = localStorage.getItem(GATE_ID_STORAGE_KEY) || "";
gateIdInput.addEventListener("input", () => {
  localStorage.setItem(GATE_ID_STORAGE_KEY, gateIdInput.value.trim());
});

function setConnectionStatus(type, text) {
  connectionStatus.dataset.status = type;
  connectionStatusText.textContent = text;
}

// ====== 網址參數解析與 iframe 初始化 (bridge handshake) ======
const urlParams = new URLSearchParams(window.location.search);
const deployId = urlParams.get("id");

if (deployId) {
  setConnectionStatus("connecting", "Bridge 連線中");
  gasIframe.src = `https://script.google.com/macros/s/${deployId}/exec?bridge=1`;
} else {
  urlWarning.style.display = "block";
  startBtn.disabled = true;
  setConnectionStatus("no-id", "缺少部署 ID");
}

let gasPort = null;
let isGasReady = false;
let gasReadyResolve = null;
const gasReadyPromise = new Promise((resolve) => {
  gasReadyResolve = resolve;
});

window.addEventListener("message", (event) => {
  if (event.data && event.data.action === "GAS_READY") {
    gasPort = event.ports[0];
    isGasReady = true;
    if (gasReadyResolve) gasReadyResolve();
    setConnectionStatus("connected", "Bridge 已連線");
  }
});

function waitForGasReady(timeoutMs = 8000) {
  if (isGasReady && gasPort) return Promise.resolve();
  return Promise.race([
    gasReadyPromise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        if (isGasReady) return;
        setConnectionStatus("failed", "Bridge 連線失敗");
        reject(new Error("Bridge 尚未連線"));
      }, timeoutMs);
      gasReadyPromise.then(() => clearTimeout(timeoutId));
    }),
  ]);
}

function callGas(action, payload) {
  return waitForGasReady().then(
    () =>
      new Promise((resolve, reject) => {
        const messageId = Date.now().toString() + Math.random().toString();

        function handler(event) {
          if (event.data && event.data.id === messageId) {
            gasPort.removeEventListener("message", handler);
            if (event.data.status === "success") resolve(event.data.result);
            else reject(new Error(event.data.error));
          }
        }

        gasPort.addEventListener("message", handler);
        gasPort.start();
        gasPort.postMessage({ id: messageId, action, payload });
      }),
  );
}
// =======================================

// ====== check-in 結果顯示 ======
// checkInTicket() 的 outcome 有 success / already-used / used-elsewhere /
// invalid，這張票只做基本三段式訊息（成功／已使用／無效），already-used 和
// used-elsewhere 的分級留給之後的票。
const OUTCOME_DISPLAY = {
  success: { type: "success", message: "入場成功" },
  "already-used": { type: "already-used", message: "已使用過" },
  "used-elsewhere": { type: "already-used", message: "已使用過" },
  invalid: { type: "invalid", message: "無效票" },
};

function showBanner(type, message) {
  resultBanner.style.display = "block";
  resultBanner.dataset.type = type;
  resultBanner.textContent = message;
}

function submitCheckIn(serial) {
  const gateId = gateIdInput.value.trim();
  if (!gateId) {
    showBanner("invalid", "請先輸入閘道代號");
    return Promise.resolve();
  }

  showBanner("loading", "驗證中...");
  return callGas("checkInTicket", { serial, gateId })
    .then((result) => {
      const display = OUTCOME_DISPLAY[result && result.outcome] || {
        type: "invalid",
        message: "無效票",
      };
      showBanner(display.type, display.message);
    })
    .catch((error) => {
      showBanner("invalid", "驗證失敗: " + error.message);
    });
}
// =======================================

// ====== QR 掃描 ======
function updateUI() {
  if (status === "scanning") {
    videoContainer.style.display = "block";
    flipBtn.disabled = false;
    startBtn.textContent = "停止掃描";
    startBtn.disabled = false;
  } else if (status === "processing") {
    startBtn.disabled = true;
    flipBtn.disabled = true;
  } else {
    videoContainer.style.display = "none";
    flipBtn.disabled = true;
    startBtn.textContent = "開始掃描";
    startBtn.disabled = false;
  }
}

function handleScanSuccess(decodedText) {
  if (status !== "scanning") return;
  const data = (decodedText || "").trim();
  if (!data) return;

  const now = Date.now();
  if (
    data === lastScannedCode &&
    now - lastScanTimestamp < DUPLICATE_SCAN_COOLDOWN_MS
  ) {
    return;
  }
  lastScannedCode = data;
  lastScanTimestamp = now;

  submitCheckIn(data);
}

function handleScanError() {
  // html5-qrcode calls this frequently when no code is in frame — intentional no-op.
}

async function startCameraWithFallback(scannerConfig) {
  const cameraCandidates = [
    { facingMode: { exact: currentCamera } },
    { facingMode: currentCamera },
  ];

  let lastError = null;
  for (const candidate of cameraCandidates) {
    try {
      await html5Qrcode.start(
        candidate,
        scannerConfig,
        handleScanSuccess,
        handleScanError,
      );
      isScannerRunning = true;
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No available camera configuration.");
}

async function startScanning() {
  if (status !== "idle") return;

  if (!window.Html5Qrcode) {
    showBanner("invalid", "掃描器載入失敗，請重新整理頁面。");
    return;
  }
  if (!html5Qrcode) {
    html5Qrcode = new Html5Qrcode(qrReaderElem.id, { verbose: false });
  }

  const scannerConfig = { fps: SCAN_FPS, qrbox: SCAN_QRBOX, disableFlip: false };

  try {
    status = "scanning";
    updateUI();
    await startCameraWithFallback(scannerConfig);
  } catch (error) {
    status = "idle";
    updateUI();
    isScannerRunning = false;
    showBanner("invalid", "無法開啟相機，請檢查權限及連線安全性。");
    console.error("startScanning failed:", error);
  }
}

async function stopScanning() {
  status = "idle";
  lastScannedCode = null;
  lastScanTimestamp = 0;

  if (html5Qrcode && isScannerRunning) {
    try {
      await html5Qrcode.stop();
    } catch (error) {
      console.warn("stop scanner failed:", error);
    }
    try {
      await html5Qrcode.clear();
    } catch (error) {
      console.warn("clear scanner failed:", error);
    }
  }
  isScannerRunning = false;
  updateUI();
}

startBtn.addEventListener("click", async () => {
  if (status === "scanning") await stopScanning();
  else if (status === "idle") await startScanning();
});

flipBtn.addEventListener("click", async () => {
  currentCamera = currentCamera === "environment" ? "user" : "environment";
  if (status === "scanning") {
    await stopScanning();
    await startScanning();
  }
});
