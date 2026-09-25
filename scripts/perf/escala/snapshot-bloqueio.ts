/**
 * QUANTO O SNAPSHOT DIÁRIO PRENDE O EVENT LOOP — auditoria de prontidão, Fase 2, item 4.
 *
 *   npx tsx scripts/perf/escala/snapshot-bloqueio.ts --dbs=<a.db>,<b.db>,... [--saida=x.json]
 *
 * Chama a função de PRODUÇÃO `fazerSnapshot` (`server/operacao/snapshot.ts`) com um armazenamento
 * falso injetado (o mesmo seam que o teste usa) — `VACUUM INTO`, `integrity_check` + contagens,
 * `readFile`, `gzipSync` level 9. Enquanto ela roda, um batimento de 1 ms mede o maior intervalo
 * sem o laço rodar (= bloqueio contínuo) e a sonda de memória mede o pico de RSS.
 *
 * Depois, ISOLA a etapa citada na Fase 1 (`snapshot.ts:117-120`): o mesmo `gzipSync(buf, {level: 9})`
 * sobre os bytes do mesmo arquivo, cronometrado sozinho.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

import { fazerSnapshot } from '../../../server/operacao/snapshot';
import type { Armazenamento } from '../../../server/lib/armazenamento';

const arg = (n: string, d = '') => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const dbs = arg('dbs').split(',').filter(Boolean);
const saida = arg('saida');

let gravado = 0;
const falso = {
  tipo: 's3',
  async gravar(_n: string, b: Buffer) {
    gravado = b.length;
  },
} as unknown as Armazenamento;

const MB = (b: number) => Math.round(b / 1048576);
const resultados = [];
for (const db of dbs) {
  const tamanho = statSync(db).size;
  // batimento de 1 ms + pico de RSS a cada batimento
  let maior = 0;
  let presoTotal = 0;
  let ult = performance.now();
  let rssPico = process.memoryUsage().rss;
  const rssAntes = rssPico;
  const bat = setInterval(() => {
    const a = performance.now();
    const gap = a - ult;
    if (gap > maior) maior = gap;
    if (gap > 5) presoTotal += gap;
    ult = a;
    const r = process.memoryUsage().rss;
    if (r > rssPico) rssPico = r;
  }, 1);
  await new Promise((r) => setTimeout(r, 30));
  const t0 = performance.now();
  const r = await fazerSnapshot({
    urlDoBanco: `file:${db.replace(/\\/g, '/')}`,
    dirTemporario: path.dirname(db),
    destino: { cfg: {} as never, prefixo: 'perf/' },
    armazenamento: falso,
  });
  const total = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(bat);
  const rssDepois = process.memoryUsage().rss;

  // etapa isolada: gzipSync level 9 dos mesmos bytes
  const bytes = readFileSync(db);
  const g0 = performance.now();
  const gz = gzipSync(bytes, { level: 9 });
  const gzipMs = performance.now() - g0;
  const g1 = performance.now();
  gzipSync(bytes, { level: 6 });
  const gzip6Ms = performance.now() - g1;

  const linha = {
    banco: path.basename(db),
    tamanhoMB: MB(tamanho),
    snapshotTotalMs: Math.round(total),
    maiorBloqueioContinuoMs: Math.round(maior),
    tempoPresoTotalMs: Math.round(presoTotal),
    gzipSyncLevel9Ms: Math.round(gzipMs),
    gzipSyncLevel6Ms: Math.round(gzip6Ms),
    comprimidoMB: MB(gz.length),
    razao: Math.round((gz.length / tamanho) * 1000) / 1000,
    rssAntesMB: MB(rssAntes),
    rssPicoMB: MB(rssPico),
    rssDepoisMB: MB(rssDepois),
    enviadoMB: MB(gravado),
    integridade: r.verificacao.integridade,
  };
  resultados.push(linha);
  console.log(JSON.stringify(linha));
}
if (saida)
  writeFileSync(saida, JSON.stringify({ node: process.version, em: new Date().toISOString(), resultados }, null, 2));
process.exit(0);
