/**
 * FOLHA DE CAPTURAS DA COLEÇÃO: cada modelo, em `corpo` e em `rosto`, com as câmeras do catálogo, num PNG por
 * modelo/modo (e um relatório de pixels que tocam a borda do quadro). Para olhar a calibração a olho nu.
 *
 * Uso: BASE_URL=http://localhost:3217 SAIDA=/tmp/colecao npx tsx scripts/avatar/capturar-colecao.ts [tier]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { COLECAO_CURADA } from '../../src/data/avatar/colecao';

const base = process.env.BASE_URL || 'http://localhost:3100';
const saida = process.env.SAIDA || '/tmp/colecao';
const tier = process.argv[2] || 'medio';
mkdirSync(saida, { recursive: true });

const navegador = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const m of COLECAO_CURADA) {
  const page = await navegador.newPage({ viewport: { width: 420, height: 520 } });
  await page.goto(
    `${base}/tests/e2e/avatar-harness/index.html?fonte=/avatares/colecao/${m.id}.vrm&tier=${tier}&tamanho=320&base=${m.id}&catalogo=1`,
  );
  await page.waitForSelector('[data-avatar-pronto="true"]', { timeout: 60_000 });
  for (const modo of ['corpo', 'rosto'] as const) {
    await page.evaluate((x) => (window as any).__avatarHarness.modo(x), modo);
    await page.waitForTimeout(400);
    const b = await page.evaluate(() => (window as any).__avatarHarness.bordas());
    await page.locator('[data-avatar-pronto]').screenshot({ path: path.join(saida, `${m.id}-${modo}.png`) });
    console.log(m.id, modo, JSON.stringify(b));
  }
  await page.close();
}

// Folha de contato: uma linha por modo, uma coluna por modelo.
const folha = await navegador.newPage({ viewport: { width: 330 * COLECAO_CURADA.length, height: 680 } });
const celulas = (['corpo', 'rosto'] as const)
  .flatMap((modo) =>
    COLECAO_CURADA.map(
      (m) =>
        `<figure style="margin:0"><img src="file://${path.resolve(saida, `${m.id}-${modo}.png`)}" width="320" height="320" style="background:#ddd6c8"><figcaption style="font:12px sans-serif">${m.id} · ${modo}</figcaption></figure>`,
    ),
  )
  .join('');
const arquivoDaFolha = path.resolve(saida, 'folha.html');
writeFileSync(
  arquivoDaFolha,
  `<body style="margin:4px;display:grid;grid-template-columns:repeat(${COLECAO_CURADA.length},330px);gap:4px">${celulas}</body>`,
);
await folha.goto(`file://${arquivoDaFolha}`);
await folha.waitForTimeout(500);
await folha.screenshot({ path: path.join(saida, 'folha.png') });
await navegador.close();
