// DOM elements
const urlWarning = document.getElementById("url-warning");
const connectionStatus = document.getElementById("connection-status");
const connectionStatusText = document.getElementById(
  "connection-status-text",
);
const gateIdInput = document.getElementById("gate-id");
const qrReaderElem = document.getElementById("qr-reader");
const startBtn = document.getElementById("start-button");
const flipBtn = document.getElementById("flip-button");
const resultBanner = document.getElementById("result-banner");
const gasIframe = document.getElementById("gas-bridge");

const GATE_ID_STORAGE_KEY = "qrgate.gateId";
const SCAN_FPS = 12;
const SCAN_QRBOX = { width: 260, height: 260 };

let status = "idle"; // idle | scanning | processing (paused, waiting on checkInTicket)
let currentCamera = "environment";
let html5Qrcode = null;
let isScannerRunning = false;

gateIdInput.value = localStorage.getItem(GATE_ID_STORAGE_KEY) || "";
gateIdInput.addEventListener("input", () => {
  localStorage.setItem(GATE_ID_STORAGE_KEY, gateIdInput.value.trim());
});

function setConnectionStatus(type, text) {
  connectionStatus.dataset.status = type;
  connectionStatusText.textContent = text;
}

// ====== 網址參數解析與 iframe 初始化 (bridge handshake) ======
// id 放在 hash（#id=...）而不是 query（?id=...）：hash 不會被瀏覽器送到伺服器，
// 不會出現在 GitHub Pages 的存取紀錄裡。讀取後立刻用 replaceState 清掉網址列，
// 降低事後被螢幕分享/瀏覽器歷史記錄外流的機會。deployment id 本身仍不是機密
// （見 ADR-0002：知道連結本身就是唯一的存取控制），這只是降低留痕的機會。
// 仍相容舊的 ?id=... 連結，避免已經發出去的連結失效。
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const searchParams = new URLSearchParams(window.location.search);
const deployId = hashParams.get("id") || searchParams.get("id");

if (window.location.hash || window.location.search) {
  window.history.replaceState(null, "", window.location.pathname);
}

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
const OUTCOME_DISPLAY = {
  success: { type: "success", message: "入場成功" },
  "already-used": { type: "already-used", message: "已使用過" },
  "used-elsewhere": { type: "used-elsewhere", message: "已於其他地點入場" },
  invalid: { type: "invalid", message: "無效票" },
};

function showBanner(type, message) {
  resultBanner.style.display = "block";
  resultBanner.dataset.type = type;
  resultBanner.textContent = message;
}

function hideBanner() {
  resultBanner.style.display = "none";
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
    flipBtn.disabled = false;
    startBtn.textContent = "停止掃描";
    startBtn.disabled = false;
  } else if (status === "processing") {
    // 驗證中，畫面暫停：仍可提前按停止，但不能切換鏡頭。
    flipBtn.disabled = true;
    startBtn.textContent = "停止掃描";
    startBtn.disabled = false;
  } else {
    flipBtn.disabled = true;
    startBtn.textContent = "開始掃描";
    startBtn.disabled = false;
  }
}

async function handleScanSuccess(decodedText) {
  if (status !== "scanning") return;
  const data = (decodedText || "").trim();
  if (!data) return;

  status = "processing";
  updateUI();
  if (html5Qrcode && isScannerRunning) {
    try {
      html5Qrcode.pause(true); // 暫停畫面，避免驗證還沒回來就又掃到同一張票
    } catch (error) {
      console.warn("pause scanner failed:", error);
    }
  }

  await submitCheckIn(data);

  if (status !== "processing") return; // 使用者在驗證中已按下停止掃描
  status = "scanning";
  updateUI();
  if (html5Qrcode && isScannerRunning) {
    try {
      html5Qrcode.resume(); // 結果一出來就恢復掃描，不強制停留——banner 會留著顯示剛才的結果
    } catch (error) {
      console.warn("resume scanner failed:", error);
    }
  }
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
  hideBanner();

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
  if (status === "scanning" || status === "processing") await stopScanning();
  else if (status === "idle") await startScanning();
});

flipBtn.addEventListener("click", async () => {
  currentCamera = currentCamera === "environment" ? "user" : "environment";
  if (status === "scanning") {
    await stopScanning();
    await startScanning();
  }
});
