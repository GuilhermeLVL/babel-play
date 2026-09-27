// Exercita public/diagnostico-audio.html com o seletor real dirigido por UI Automation.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4/package.json');
const { chromium } = require('playwright');
const [arquivo, fonte = 'Entire Screen'] = process.argv.slice(2);
const html = readFileSync(arquivo);
const srv = createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }); r.end(html); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--lang=en-US'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(800);
console.log('ambiente:', await page.textContent('#ambiente'));
const drive = fileURLToPath(new URL('./uia-drive.ps1', import.meta.url));
for (let tent = 0; tent < 12; tent++) {
  const n = JSON.parse(await page.inputValue('#relatorio')).resultados.length;
  if (n >= 5) break;
  if (await page.isEnabled('#testar')) { await page.click('#testar'); console.log('clique (casos feitos:', n, ')'); }
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', drive, '-Surface', fonte], { env: { ...process.env, WIN: '*Diagn*' }, encoding: 'utf8' });
  console.log(r.stdout.trim().split('\n').filter((l) => !l.startsWith('  Control')).join(' | '));
  await page.waitForTimeout(2500);
}
const rel = JSON.parse(await page.inputValue('#relatorio'));
for (const r of rel.resultados) console.log(JSON.stringify(r));
console.log('conclusão:', await page.textContent('#conclusao'));
await page.screenshot({ path: fileURLToPath(new URL('./diag-' + fonte.replace(/\s/g, '') + '.png', import.meta.url)), fullPage: true });
await browser.close(); srv.close();
