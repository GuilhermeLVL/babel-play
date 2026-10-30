/**
 * CALIBRA O ENQUADRAMENTO DA COLEÇÃO: abre cada `.vrm` de `public/avatares/colecao/` no harness do avatar (Chromium
 * de verdade, o mesmo motor do app), lê as caixas do corpo e da cabeça (vértices pesados no osso da cabeça) e os ossos (`motor.medirModelo()`) e imprime, por modelo,
 * o `medidas` e o `camera` para colar em `src/data/avatar/colecao.ts`. O teste `tests/avatar-enquadramento.test.ts`
 * confere depois que o catálogo bate com o que se mede aqui.
 *
 * Uso (com o app de pé, `PORT=3217 npm run dev:local`):
 *   BASE_URL=http://localhost:3217 npx tsx scripts/avatar/calibrar-colecao.ts [id ...]
 */
import { chromium } from '@playwright/test';
import { readdirSync } from 'node:fs';

import { enquadrarCaixa, MARGEM_DO_ROSTO } from '../../src/core/avatar/enquadramento';

const base = process.env.BASE_URL || 'http://localhost:3100';
const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync('public/avatares/colecao')
      .filter((n) => n.endsWith('.vrm'))
      .map((n) => n.replace(/\.vrm$/, ''));

/**
 * Onde a CABEÇA medida pelos vértices não contém o rosto (o hidrante tem a "cara" numa faixa escura do corpo, abaixo
 * da tampa), a caixa do rosto é escolhida à mão, olhando a folha de capturas (`capturar-colecao.ts`).
 */
const AJUSTES_DO_ROSTO: Record<string, { ymin: number; ymax: number; meia: number }> = {
  '100avatars-r2-coolhydrant': { ymin: 1.47, ymax: 2.201, meia: 0.42 },
};

const navegador = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const saida: Record<string, unknown> = {};
for (const id of ids) {
  const page = await navegador.newPage();
  await page.goto(
    `${base}/tests/e2e/avatar-harness/index.html?fonte=/avatares/colecao/${id}.vrm&tier=medio&tamanho=256&base=${id}`,
  );
  await page.waitForSelector('[data-avatar-pronto="true"]', { timeout: 60_000 });
  const m = await page.evaluate(() =>
    (window as unknown as { __avatarHarness: { medidas(): unknown } }).__avatarHarness.medidas(),
  );
  await page.close();
  if (!m) throw new Error(`sem medidas para ${id}`);
  const medidas = m as {
    caixa: Parameters<typeof enquadrarCaixa>[0];
    caixaDoRosto: Parameters<typeof enquadrarCaixa>[0];
    rosto?: { cabecaY: number; olhoY?: number };
  };
  const ajuste = AJUSTES_DO_ROSTO[id];
  if (ajuste) {
    medidas.caixaDoRosto = {
      min: [-ajuste.meia, ajuste.ymin, medidas.caixa.min[2]],
      max: [ajuste.meia, ajuste.ymax, medidas.caixa.max[2]],
    };
  }
  saida[id] = {
    medidas,
    camera: {
      corpo: enquadrarCaixa(medidas.caixa),
      rosto: enquadrarCaixa(medidas.caixaDoRosto, { margem: MARGEM_DO_ROSTO }),
    },
  };
}
await navegador.close();
console.log(JSON.stringify(saida, null, 2));
