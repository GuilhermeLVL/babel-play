// App REAL (edição estática construída) + seletor real dirigido por UI Automation.
// Uso: node app-real.mjs <raiz do repo com dist/> <superfície> [porta]
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const [raiz, fonte = 'Entire Screen', porta = '4185'] = process.argv.slice(2);
const require = createRequire('C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4/package.json');
const { chromium } = require('playwright');
const srv = spawn('node', [join(raiz, 'tests/e2e-estatica/_servidor-estatico.mjs'), porta], { cwd: raiz, stdio: 'ignore' });
console.log('servidor PID', srv.pid);
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--lang=en-US'] });
const ctx = await browser.newContext();
await ctx.grantPermissions(['microphone'], { origin: `http://localhost:${porta}` });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/cap:vad|sistema|getDisplayMedia|superf|captura/i.test(t)) { logs.push(t); } });
await page.goto(`http://localhost:${porta}/capturar`);
await page.waitForTimeout(2500);
const titulo = await page.title();
console.log('título:', titulo);
// Som FORA do Chrome (processo próprio, encerrado pelo PID) para provar que o sinal chega.
const somPid = Number(spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./tom.ps1', import.meta.url))], { encoding: 'utf8' }).stdout.trim()); const som = { pid: somPid };
console.log('som PID', som.pid);
await page.waitForTimeout(1500);
const iniciar = page.getByRole('button', { name: 'Iniciar captura' });
await iniciar.click();
const drive = fileURLToPath(new URL('./uia-drive.ps1', import.meta.url));
const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', drive, '-Surface', fonte, ...(process.env.ITEM ? ['-Item', process.env.ITEM] : [])], { env: { ...process.env, WIN: `*${titulo}*` }, encoding: 'utf8' });
console.log('uia:', r.stdout.trim().split('\n').filter((l) => !l.startsWith('  Control')).join(' | '));

await page.waitForTimeout(6500);
try { process.kill(som.pid); } catch {}
for (const l of logs) console.log('[console]', l.replace(/%c/g, '').slice(0, 300));
const toasts = await page.locator('[role=status], [role=dialog]').allTextContents();
console.log('status/diálogos:', JSON.stringify(toasts).slice(0, 800));
await page.screenshot({ path: fileURLToPath(new URL(`./app-${fonte.replace(/\s/g, '')}.png`, import.meta.url)) });
await browser.close();
srv.kill();
console.log('servidor encerrado');
