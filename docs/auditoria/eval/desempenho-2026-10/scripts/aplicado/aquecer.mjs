// Primeira abertura da conta semeada: credita as conquistas devidas, fecha as comemoracoes e guarda
// o banco e o localStorage desse estado ("quem ja usa o app") como modelo de toda medida.
import fs from 'fs';
import { subir } from './ambiente.mjs';
import { abrir, URL0 } from './lib.mjs';
const TMP = 'C:/Users/Guilh/AppData/Local/Temp/e2e-babel';
const amb = await subir('antes', 4310);
const s = await abrir('desktop', { cpu: 1, semInstr: true });
const { page } = s;
page.on('crash', () => console.log('CRASH da pagina'));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 160)));
try {
  await page.goto(URL0 + '/', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 40; i++) {
    const b = page.locator('button:has-text("Resgatar e continuar"), button:has-text("Resgatar")').first();
    let visivel = await b.isVisible().catch(() => false);
    if (!visivel) {
      await page.waitForTimeout(2500);
      visivel = await b.isVisible().catch(() => false);
    }
    if (!visivel) break;
    console.log('it', i);
    await b.click({ timeout: 3000 }).catch((e) => console.log('clique', String(e).slice(0, 80)));
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'aquecido.png' });
  const ls = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  fs.writeFileSync('storage.json', JSON.stringify(ls, null, 1));
  console.log('chaves', Object.keys(ls).join(' '));
} catch (e) {
  console.log('ERRO', String(e).slice(0, 500));
}
await s.browser.close();
amb.parar();
await new Promise((r) => setTimeout(r, 1500));
for (const x of ['', '-wal', '-shm']) {
  if (fs.existsSync(TMP + '/perf-cli.db' + x)) fs.copyFileSync(TMP + '/perf-cli.db' + x, TMP + '/perf-cli-modelo.db' + x);
  else if (fs.existsSync(TMP + '/perf-cli-modelo.db' + x)) fs.rmSync(TMP + '/perf-cli-modelo.db' + x);
}
console.log('modelo guardado');
process.exit(0);
