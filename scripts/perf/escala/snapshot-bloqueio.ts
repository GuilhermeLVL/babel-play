/**
 * QUANTO O SNAPSHOT DIÁRIO PRENDE O EVENT LOOP — auditoria de prontidão, Fase 2, item 4.
 *
 *   npx tsx scripts/perf/escala/snapshot-bloqueio.ts --dbs=<a.db>,<b.db>,... [--modo=filho|processo]
 *       [--cli=dist-server/operacao.cjs] [--saida=x.json]
 *
 * `--modo=filho` (padrão) é o caminho de PRODUÇÃO depois da correção: `fazerSnapshotEmProcessoFilho`
 * dá `fork` na CLI de operação (`server/operacao/cli.ts` com o carregador do tsx, ou o bundle
 * `dist-server/operacao.cjs` com `--cli=`), que envia o `.gz` a um S3 FALSO servido AQUI, neste
 * processo (drena o corpo e conta os bytes) — o recebimento pesa no laço medido, o que deixa a
 * medida do lado conservador.
 *
 * `--modo=processo` é o ANTES: `fazerSnapshot` chamado no próprio processo, com um `enviar` falso.
 *
 * Nos dois, um batimento de 1 ms mede o maior intervalo sem o laço rodar (= bloqueio contínuo) e o
 * pico de RSS DESTE processo (o do filho não entra: é memória que some quando ele sai).
 */
import { statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { fazerSnapshot, fazerSnapshotEmProcessoFilho } from '../../../server/operacao/snapshot';

const arg = (n: string, d = '') => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const dbs = arg('dbs').split(',').filter(Boolean);
const modo = arg('modo', 'filho');
const saida = arg('saida');
const cliArg = arg('cli');
const cli = cliArg
  ? { modulo: path.resolve(cliArg), execArgv: cliArg.endsWith('.ts') ? process.execArgv : [] }
  : { modulo: path.resolve('server/operacao/cli.ts'), execArgv: process.execArgv };

// S3 falso: aceita o PUT, drena o corpo, guarda só o tamanho.
let recebido = 0;
const s3 = createServer((req, res) => {
  let n = 0;
  req.on('data', (p: Buffer) => (n += p.length));
  req.on('end', () => {
    recebido = n;
    res.statusCode = 200;
    res.end();
  });
});
await new Promise<void>((ok) => s3.listen(0, '127.0.0.1', () => ok()));
const porta = (s3.address() as { port: number }).port;
const envS3 = {
  ...process.env,
  S3_ENDPOINT: `http://127.0.0.1:${porta}`,
  S3_BUCKET: 'perf',
  S3_ACCESS_KEY_ID: 'x',
  S3_SECRET_ACCESS_KEY: 'y',
};

const MB = (b: number) => Math.round(b / 1048576);
const resultados = [];
for (const db of dbs) {
  const tamanho = statSync(db).size;
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
  const url = `file:${db.replace(/\\/g, '/')}`;
  const t0 = performance.now();
  let bytes: number;
  if (modo === 'processo') {
    const r = await fazerSnapshot({
      urlDoBanco: url,
      dirTemporario: path.dirname(db),
      destino: { cfg: {} as never, prefixo: 'perf/' },
      enviar: async (_c, arquivo) => {
        recebido = statSync(arquivo).size;
      },
    });
    bytes = r.bytes;
  } else {
    bytes = (await fazerSnapshotEmProcessoFilho({ urlDoBanco: url, cli, env: envS3 })).bytes;
  }
  const total = performance.now() - t0;
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(bat);

  const linha = {
    modo,
    cli: modo === 'filho' ? path.basename(cli.modulo) : null,
    banco: path.basename(db),
    tamanhoMB: MB(tamanho),
    snapshotTotalMs: Math.round(total),
    maiorBloqueioContinuoMs: Math.round(maior),
    tempoPresoTotalMs: Math.round(presoTotal),
    comprimidoMB: MB(bytes),
    enviadoMB: MB(recebido),
    rssAntesMB: MB(rssAntes),
    rssPicoMB: MB(rssPico),
    deltaRssMB: MB(rssPico - rssAntes),
  };
  resultados.push(linha);
  console.log(JSON.stringify(linha));
}
s3.close();
if (saida)
  writeFileSync(saida, JSON.stringify({ node: process.version, em: new Date().toISOString(), resultados }, null, 2));
process.exit(0);
