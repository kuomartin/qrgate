# 序號用 Ed25519 非對稱簽章，驗證頁純靜態、不接後端

序號要能在沒有後端、沒有資料庫的情況下證明「是我們發的」。對稱金鑰（HMAC）做不到：驗證端要持有同一把 secret，任何拿到掃描頁的人就能簽發。改用 Ed25519：試算表持有私鑰種子簽發，驗證頁只拿公鑰，持有掃描連結的人能驗不能簽。

選 Ed25519 而不是 Apps Script 原生的 `Utilities.computeRsaSha256Signature`：Apps Script 不能產生 RSA 金鑰，得靠 openssl 另外做再貼進 Properties；RSA-2048 簽章 256 bytes 也讓 QR 密度過高。Ed25519 簽章 64 bytes，用 tweetnacl 在 Apps Script 與瀏覽器跑同一份程式碼，金鑰對由選單一鍵產生。Apps Script 沒有 CSPRNG，種子與序號 id 的亂數來自多個 `Utilities.getUuid()` 加時間戳過 SHA-512。

公鑰放在掃描連結的 hash，驗證頁因此不綁任何活動，一個 GitHub Pages 部署服務所有試算表；每張試算表各自一組金鑰，互不影響。

這個設計只證明簽章，不證明「沒用過」：重複使用的防範不在範圍內，要做就得加回有狀態的後端。私鑰種子在 Script Properties，能編輯該 Apps Script 專案的人都能讀到。
