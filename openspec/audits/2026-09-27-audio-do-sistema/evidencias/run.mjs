// Uso: node run.mjs <modo> <casos,separados|all> [fonte] [coopcoep]
// modo: autoselect | fakeui
import { createServer } from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4/package.json');
const { chromium } = require('playwright');

const [modo = 'autoselect', casosArg = 'all', fonte = 'Entire screen', coep = ''] = process.argv.slice(2);
const html = readFileSync(new URL('./pagina-matriz.html', import.meta.url));
const srv = createServer((req, res) => {
  const h = { 'content-type': 'text/html' };
  if (coep) { h['Cross-Origin-Opener-Policy'] = 'same-origin'; h['Cross-Origin-Embedder-Policy'] = 'require-corp'; }
  res.writeHead(200, h); res.end(html);
}).listen(0);
const port = srv.address().port;

const args = ['--lang=en-US'];
if (process.env.LOG) args.push('--enable-logging=stderr', '--v=0', '--vmodule=*wasapi*=2,*core_audio*=2,*audio_input*=2,*media_stream*=1,*loopback*=2');
if (modo === 'autoselect') args.push(`--auto-select-desktop-capture-source=${fonte}`);
if (modo === 'fakeui') args.push('--use-fake-ui-for-media-stream');
if (modo === 'tab') args.push('--auto-accept-this-tab-capture');
const TIMEOUT = Number(process.env.TIMEOUT_MS || 20000);
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args, ...(process.env.LOG ? { logger: undefined } : {}) });
if (process.env.LOG) { /* stderr do chrome vai para o console via DEBUG */ }
console.log('chrome', browser.version(), 'args', args.join(' '));
const ctx = await browser.newContext();
await ctx.grantPermissions(['microphone'], { origin: `http://localhost:${port}` });
const alvo = await ctx.newPage(); await alvo.setContent('<title>alvo-aba</title><h1>alvo</h1>'); if (process.env.TOM) { await alvo.click('h1'); await alvo.evaluate(() => { const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0.03; o.connect(g).connect(c.destination); o.start(); window.__c = c; }); }
const page = await ctx.newPage();
page.on('console', (m) => console.log('[console]', m.text()));
await page.goto(`http://localhost:${port}/`);
const casos = casosArg === 'all' ? await page.evaluate(() => Object.keys(window.CASOS)) : casosArg.split(',');
for (const c of casos) {
  const [nome, extraS] = c.split('+');
  const extra = extraS === 'ctx' ? { preAudioCtx: true } : extraS === 'mic' ? { preMic: true } : null;
  await page.evaluate(({ nome, extra }) => {
    document.getElementById('go').onclick = () => { window.__p = window.rodar(nome, extra); };
  }, { nome, extra });
  await page.click('#go');
  if (modo === 'uia') {
    const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./uia-drive.ps1', import.meta.url)), '-Surface', fonte, '-Audio', process.env.AUDIO || '1'], { stdio: 'inherit' });
    await new Promise((r) => ps.on('exit', r));
  }
  const r = await Promise.race([
    page.evaluate(() => window.__p),
    new Promise((r) => setTimeout(() => r({ caso: nome, timeout: true }), TIMEOUT)),
  ]);
  r.modo = modo; r.fonte = fonte; r.coep = !!coep; r.extra = extraS || '';
  delete r.constraints;
  const linha = JSON.stringify(r);
  console.log(linha);
  appendFileSync(new URL('./resultados.jsonl', import.meta.url), linha + '\n');
  await page.waitForTimeout(800);
}
await browser.close();
srv.close();
