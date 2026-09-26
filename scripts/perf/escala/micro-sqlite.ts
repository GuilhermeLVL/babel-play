/**
 * THROUGHPUT DO SQLITE COM O DRIVER REAL — auditoria de prontidão, Fase 2, item 1.
 *
 *   npx tsx scripts/perf/escala/micro-sqlite.ts --db=<cópia do banco semeado> [--n=2000] [--saida=x.json]
 *
 * Importa os MÓDULOS DE PRODUÇÃO (`server/db/db.ts` com os mesmos PRAGMAs, `rateLimitStore`,
 * `usageCountersRepo`, `vocabRepo`, `computeProfile`) — nada é reimplementado aqui. O banco precisa
 * ser uma CÓPIA: (a) e (b) gravam de verdade.
 *
 * Para cada caso: latência por operação (p50/p95/p99/máx), operações/s em série e, com 50 em voo
 * ao mesmo tempo (`Promise.all`), o atraso do event loop medido por `monitorEventLoopDelay`
 * (resolução 1 ms) e a fração do tempo de parede em que o loop ficou preso.
 */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const arg = (n: string, d = '') => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const arquivo = arg('db');
if (!arquivo) {
  console.error('uso: npx tsx scripts/perf/escala/micro-sqlite.ts --db=<cópia.db>');
  process.exit(2);
}
process.env.DATABASE_URL = `file:${arquivo.replace(/\\/g, '/')}`;
const N = Number(arg('n', '2000'));
const saida = arg('saida');

const { dbReady, client } = await import('../../../server/db/db');
const { createDbRateLimitStore, METRIC_RATELIMIT_ESCRITA, METRIC_RATELIMIT_AUTH } = await import(
  '../../../server/lib/rateLimitStore'
);
const { usageCountersRepo } = await import('../../../server/db/repositories/usageCounters');
const { vocabRepo } = await import('../../../server/db/repositories/vocab');
const { computeProfile } = await import('../../../server/db/repositories/metrics');
const { asUserId } = await import('../../../server/lib/authContext');
await dbReady;
const pragmas = {} as Record<string, unknown>;
for (const p of ['journal_mode', 'busy_timeout', 'synchronous', 'foreign_keys']) {
  pragmas[p] = Object.values((await client.execute(`PRAGMA ${p}`)).rows[0] ?? {})[0];
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const r2 = (x: number) => Math.round(x * 100) / 100;

interface Resultado {
  caso: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  opsPorSegSerie: number;
  opsPorSegParalelo50: number;
  loopP99ms: number;
  loopMaxMs: number;
  loopPresoPct: number;
  extra?: Record<string, unknown>;
}
const resultados: Resultado[] = [];

/** Mede `fn(i)` N vezes em série (latência) e depois N vezes com 50 em voo (vazão + event loop). */
async function medir(caso: string, n: number, fn: (i: number) => Promise<unknown>, extra?: Record<string, unknown>) {
  for (let i = 0; i < Math.min(20, n); i++) await fn(i); // aquecimento
  const lat: number[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    await fn(i);
    lat.push(performance.now() - a);
  }
  const serie = performance.now() - t0;

  const h = monitorEventLoopDelay({ resolution: 1 });
  // Fração presa: um "batimento" de 1 ms; cada atraso acima de 2 ms conta como tempo preso.
  let preso = 0;
  let ultimo = performance.now();
  const bat = setInterval(() => {
    const agora = performance.now();
    const d = agora - ultimo - 1;
    if (d > 2) preso += d;
    ultimo = agora;
  }, 1);
  h.enable();
  const t1 = performance.now();
  let prox = 0;
  /* `setImmediate` entre operações: sem ele, 50 cadeias de promessas resolvidas por microtarefa (o
     driver é síncrono, não há I/O) nunca devolvem o controle ao laço, e o histograma fica VAZIO —
     foi o que a primeira rodada mostrou (0 amostras). No servidor, o I/O de rede intercala as
     requisições do mesmo jeito que este `setImmediate`. */
  const trabalhador = async () => {
    while (prox < n) {
      await fn(n + prox++);
      await new Promise((r) => setImmediate(r));
    }
  };
  await Promise.all(Array.from({ length: 50 }, trabalhador));
  const paralelo = performance.now() - t1;
  await new Promise((r) => setTimeout(r, 5));
  h.disable();
  clearInterval(bat);
  const r: Resultado = {
    caso,
    n,
    p50: r2(pct(lat, 50)),
    p95: r2(pct(lat, 95)),
    p99: r2(pct(lat, 99)),
    max: r2(Math.max(...lat)),
    opsPorSegSerie: Math.round(n / (serie / 1000)),
    opsPorSegParalelo50: Math.round(n / (paralelo / 1000)),
    loopP99ms: r2(h.percentile(99) / 1e6),
    loopMaxMs: r2(h.max / 1e6),
    loopPresoPct: r2((preso / paralelo) * 100),
    extra,
  };
  resultados.push(r);
  console.log(JSON.stringify(r));
}

// (a) rate limit — a MESMA store que o app monta; uma chave por usuário (como em produção).
const escrita = createDbRateLimitStore(METRIC_RATELIMIT_ESCRITA);
escrita.init({ windowMs: 60_000 });
const auth = createDbRateLimitStore(METRIC_RATELIMIT_AUTH);
auth.init({ windowMs: 15 * 60_000 });
await medir('a1. rateLimit.increment (writeLimiter), 500 usuários', N, (i) =>
  escrita.increment(`u:u-l-${String(i % 500).padStart(4, '0')}`),
);
await medir('a2. increment+decrement (limitador de auth por IP, skipSuccessfulRequests), 500 IPs', N, async (i) => {
  const k = `ip:10.0.${Math.floor((i % 500) / 250)}.${i % 250}`;
  await auth.increment(k);
  await auth.decrement(k);
});
await medir('a3. increment+decrement no MESMO IP (NAT/escola)', N, async () => {
  await auth.increment('ip:10.9.9.9');
  await auth.decrement('ip:10.9.9.9');
});
await medir('a4. usageCounters.reserve (cota de STT por segundos)', N, (i) =>
  usageCountersRepo.reserve(asUserId(`u-l-${String(i % 500).padStart(4, '0')}`), 'stt_seconds', '2026-09', 1e9, 10),
);

// (b) revisão FSRS — o repositório real (get, UPDATE, INSERT, get) + a procedência da rota.
await medir('b. vocabRepo.review + procedenciaDe (rota POST /api/vocab/:id/review)', N, async (i) => {
  const u = asUserId(`u-p-${String(i % 200).padStart(4, '0')}`);
  const id = `c-${u}-${(i * 7) % 3000}`;
  await vocabRepo.review(u, id, 3);
  await vocabRepo.procedenciaDe(u, id);
});

// (c) GET /api/vocab: a query + o JSON.stringify que o res.json faz. Baralho de 3.000 cartões.
let bytes = 0;
let msQuery: number[] = [];
const msJson: number[] = [];
await medir('c. vocabRepo.list (3.000 cartões) + JSON.stringify', 100, async (i) => {
  const a = performance.now();
  const l = await vocabRepo.list(asUserId(`u-p-${String(i % 200).padStart(4, '0')}`));
  const b = performance.now();
  bytes = JSON.stringify(l).length;
  msQuery.push(b - a);
  msJson.push(performance.now() - b);
});
resultados.at(-1)!.extra = {
  bytesResposta: bytes,
  queryP50: r2(pct(msQuery, 50)),
  queryP95: r2(pct(msQuery, 95)),
  jsonP50: r2(pct(msJson, 50)),
  jsonP95: r2(pct(msJson, 95)),
};

// (d) computeProfile — 200 sessões × 100 falas (local-owner) e 20 × 100 (pesado típico).
msQuery = [];
await medir('d1. computeProfile 200 sessões × 100 falas, 3.000 cartões, 5k revisões, 5k exercícios', 40, async () => {
  const a = performance.now();
  bytes = JSON.stringify(await computeProfile(asUserId('local-owner'))).length;
  msQuery.push(performance.now() - a);
});
resultados.at(-1)!.extra = { bytesResposta: bytes };
await medir('d2. computeProfile 20 sessões × 100 falas, 3.000 cartões, 1k revisões, 1k exercícios', 100, async (i) => {
  await computeProfile(asUserId(`u-p-${String(i % 200).padStart(4, '0')}`));
});

// Prova de que o driver prende o laço: um batimento de 1 ms enquanto UMA `list` roda.
{
  let maior = 0;
  let ult = performance.now();
  const bat = setInterval(() => {
    const a = performance.now();
    maior = Math.max(maior, a - ult);
    ult = a;
  }, 1);
  await new Promise((r) => setTimeout(r, 20));
  const a = performance.now();
  const p = vocabRepo.list(asUserId('u-p-0003'));
  const antesDoAwait = performance.now() - a;
  await p;
  const total = performance.now() - a;
  await new Promise((r) => setTimeout(r, 20));
  clearInterval(bat);
  const r = {
    caso: 'prova: 1 vocabRepo.list com batimento de 1 ms',
    totalMs: r2(total),
    sincronoAntesDoAwaitMs: r2(antesDoAwait),
    maiorIntervaloEntreBatimentosMs: r2(maior),
  };
  console.log(JSON.stringify(r));
  (resultados as unknown[]).push(r);
}

const meta = {
  em: new Date().toISOString(),
  node: process.version,
  plataforma: `${process.platform} ${process.arch}`,
  banco: arquivo,
  pragmas,
};
console.log(JSON.stringify(meta));
if (saida) writeFileSync(saida, JSON.stringify({ meta, resultados }, null, 2));
process.exit(0);
