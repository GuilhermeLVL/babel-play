// Recorta e amplia a mesma regiao dos tres paineis (antes | depois | diferenca) de um -lado.png.
// uso: node recorte.mjs <lado.png> <x> <y> <w> <h> <zoom> <saida.png>
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/Guilh/dev/ei-polimento/node_modules/');
const { chromium } = require('playwright');
const [, , arq, x, y, w, h, z, saida] = process.argv;
const b = await chromium.launch();
const p = await b.newPage();
const out = await p.evaluate(async ({ b64, x, y, w, h, z }) => {
  const i = new Image(); await new Promise((r) => { i.onload = r; i.src = 'data:image/png;base64,' + b64; });
  const pw = i.width / 3; const c = new OffscreenCanvas((w * z + 8) * 3, h * z); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let k = 0; k < 3; k++) g.drawImage(i, pw * k + x, y, w, h, k * (w * z + 8), 0, w * z, h * z);
  const bl = await c.convertToBlob(); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let j = 0; j < u.length; j += 0x8000) s += String.fromCharCode.apply(null, u.subarray(j, j + 0x8000)); return btoa(s);
}, { b64: fs.readFileSync(arq).toString('base64'), x: +x, y: +y, w: +w, h: +h, z: +z });
fs.writeFileSync(saida, Buffer.from(out, 'base64')); await b.close();
