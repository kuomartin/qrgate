// 把共用程式碼與 vendor 函式庫複製到 Apps Script 與 GitHub Pages 兩個部署目錄。
// 單一來源：src/serial.js、node_modules/tweetnacl、node_modules/qrcode-generator。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const nacl = readFileSync('node_modules/tweetnacl/nacl-fast.min.js', 'utf8');
const qrcode = readFileSync('node_modules/qrcode-generator/dist/qrcode.js', 'utf8');

// Apps Script V8 沒有 self，而 tweetnacl 以 self.nacl 掛全域。
writeFileSync('apps-script/vendor_nacl.js', 'var self = globalThis;\n' + nacl);
writeFileSync('apps-script/vendor_qrcode.js', qrcode);
copyFileSync('src/serial.js', 'apps-script/serial.js');

mkdirSync('docs/vendor', { recursive: true });
writeFileSync('docs/vendor/nacl-fast.min.js', nacl);
copyFileSync('src/serial.js', 'docs/serial.js');
