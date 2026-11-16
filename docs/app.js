const keyStatus = document.getElementById('key-status');
const keyStatusText = document.getElementById('key-status-text');
const resultBanner = document.getElementById('result-banner');
const startBtn = document.getElementById('start-button');
const flipBtn = document.getElementById('flip-button');
const manualForm = document.getElementById('manual-form');
const manualInput = document.getElementById('manual-token');

const PUBLIC_KEY_STORAGE_KEY = 'qrgate.publicKey';
const RESULT_HOLD_MS = 1500;
const SCAN_FPS = 12;
const SCAN_QRBOX = { width: 260, height: 260 };

const serial = Serial.create(nacl);

// 公鑰從 #pk= 讀，存進 localStorage 後把網址列清掉；下次直接開頁也能用。
// 公鑰不是機密，這只是避免留在瀏覽器歷史與螢幕分享裡。
const hashParams = new URLSearchParams(window.location.hash.slice(1));
let publicKeyText = hashParams.get('pk');
if (publicKeyText) {
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKeyText);
  window.history.replaceState(null, '', window.location.pathname);
} else {
  publicKeyText = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
}
const publicKey = publicKeyText ? Serial.fromBase64url(publicKeyText) : null;

if (publicKey && publicKey.length === nacl.sign.publicKeyLength) {
  keyStatus.dataset.status = 'ready';
  keyStatusText.textContent = '公鑰 ' + publicKeyText.slice(0, 8) + '…';
} else {
  keyStatus.dataset.status = 'missing';
  keyStatusText.textContent = '缺少公鑰：請用試算表「QRGate → 產生掃描連結」給的連結開啟';
  startBtn.disabled = true;
  manualForm.querySelector('button').disabled = true;
}

function showResult(token) {
  const result = serial.verify(publicKey, token);
  resultBanner.dataset.status = result.valid ? 'valid' : 'invalid';
  resultBanner.textContent = result.valid ? '有效序號 ' + result.id : '無效序號';
  resultBanner.style.display = 'block';
  return result;
}

manualForm.addEventListener('submit', (event) => {
  event.preventDefault();
  showResult(manualInput.value);
});

let scanner = null;
let currentCamera = 'environment';
let isRunning = false;
let busy = false;

async function startScanner() {
  if (!scanner) scanner = new Html5Qrcode('qr-reader');
  await scanner.start({ facingMode: currentCamera }, { fps: SCAN_FPS, qrbox: SCAN_QRBOX }, onScan);
  isRunning = true;
  startBtn.textContent = '停止掃描';
  flipBtn.disabled = false;
}

async function stopScanner() {
  if (scanner && isRunning) await scanner.stop();
  isRunning = false;
  startBtn.textContent = '開始掃描';
  flipBtn.disabled = true;
}

function onScan(text) {
  if (busy) return;
  busy = true;
  scanner.pause(true);
  showResult(text);
  setTimeout(() => {
    if (isRunning) scanner.resume();
    busy = false;
  }, RESULT_HOLD_MS);
}

startBtn.addEventListener('click', async () => {
  try {
    if (isRunning) await stopScanner();
    else await startScanner();
  } catch (error) {
    resultBanner.dataset.status = 'invalid';
    resultBanner.textContent = '相機啟動失敗：' + error;
    resultBanner.style.display = 'block';
  }
});

flipBtn.addEventListener('click', async () => {
  currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
  await stopScanner();
  await startScanner();
});
