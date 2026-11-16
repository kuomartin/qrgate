# qrgate

在 Google Sheet 批次簽發防偽序號（文字 + QR Code），並用一個純靜態的 GitHub Pages 頁面掃描驗證。

## Language

**Serial Code（序號）**:
`<id>.<sig>`。id 是 8 bytes 隨機值的 base64url（11 字）；sig 是以該試算表的 Ed25519 私鑰對 id 字串做的 detached signature 的 base64url（86 字）。序號只給 QR 掃描，不考慮人工辨讀。
_Avoid_: Ticket number、票號。

**Key Pair（金鑰對）**:
一張試算表一組 Ed25519 金鑰，由試算表選單產生，存在該 container-bound Apps Script 的 Script Properties（`SIGNING_SEED` 種子、`PUBLIC_KEY` 公鑰）。重新產生金鑰對會讓先前簽發的序號全部失效。

**Scan Link（掃描連結）**:
`https://kuomartin.github.io/qrgate/#pk=<公鑰>`。驗證頁從 hash 取得公鑰並記在瀏覽器的 localStorage；知道連結就能驗證，但不能簽發。

**Verify（驗證）**:
在瀏覽器以公鑰檢查序號簽章是否成立，只回答「是不是這把金鑰簽的」。不記錄、不查表、不處理重複使用。
_Avoid_: Check-in、入場（那是有狀態的領域事件，本專案不做）。

## Layout

- `src/serial.js` — 序號編碼／簽發／驗證的純函式，掛在 `globalThis.Serial`，Apps Script、驗證頁、node 測試共用同一份。
- `apps-script/` — container-bound 專案（clasp）。`Code.js` 是選單與金鑰管理；`serial.js`、`vendor_*.js` 由 `npm run build` 從 `src/` 與 `node_modules/` 複製，不要手改。
- `docs/` — GitHub Pages 驗證頁。`serial.js`、`vendor/` 同樣由 build 產生。
- `npm test` 跑 node 測試；`npm run push` 先 build 再 `clasp push`。
