// Spike S7 (descartável): Worker de sonda para Hyperdrive → Supabase São Paulo.
// Rotas: /select1, /rota7, /trava (precisam do binding HYPERDRIVE), /rede (RTT TCP do PoP até a origem,
// sem credencial), /runtime (capacidades do workerd) e /express (Express via httpServerHandler).
// Não faz parte do bundle do app; ver README.md ao lado.
import { connect } from 'cloudflare:sockets';
import pg from 'pg';

interface Env {
  HYPERDRIVE?: { connectionString: string };
  SPIKE_VAR?: string;
}

type Req = Request & { cf?: { colo?: string } };

const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

function percentil(valores: number[], p: number): number {
  const ord = [...valores].sort((a, b) => a - b);
  const i = Math.min(ord.length - 1, Math.ceil((p / 100) * ord.length) - 1);
  return ord[Math.max(0, i)];
}

const estat = (ms: number[]) => ({
  p50: percentil(ms, 50),
  p95: percentil(ms, 95),
  total: ms.reduce((a, b) => a + b, 0),
});

async function novoCliente(env: Env) {
  if (!env.HYPERDRIVE) throw new Error('sem binding HYPERDRIVE');
  const c = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  const t0 = performance.now();
  await c.connect();
  return { c, connectMs: performance.now() - t0 };
}

// performance.now() no workerd só avança depois de I/O, o que basta aqui: cada medida cerca uma ida à rede.
async function cronometrar<T>(fn: () => Promise<T>): Promise<[number, T]> {
  const t0 = performance.now();
  const r = await fn();
  return [performance.now() - t0, r];
}

async function select1(env: Env) {
  const { c, connectMs } = await novoCliente(env);
  try {
    const ms: number[] = [];
    for (let i = 0; i < 25; i++) ms.push((await cronometrar(() => c.query('select 1')))[0]);
    return { connectMs, ms, ...estat(ms) };
  } finally {
    await c.end();
  }
}

async function rota7(env: Env) {
  const { c, connectMs } = await novoCliente(env);
  try {
    const consultas: [string, unknown[]][] = [
      ['select count(*) from users', []],
      ['select * from sessions limit 5', []],
      ['select * from vocab_cards where user_id = $1 limit 20', ['inexistente-s7']],
      ['select now()', []],
      ['select * from flags', []],
      ['select count(*) from utterances', []],
      ['select 1', []],
    ];
    const ms: number[] = [];
    const erros: string[] = [];
    for (const [sql, params] of consultas) {
      const t0 = performance.now();
      try {
        await c.query(sql, params);
      } catch (e) {
        erros.push(`${sql}: ${(e as Error).message}`);
      }
      ms.push(performance.now() - t0);
    }
    return { connectMs, ms, ...estat(ms), erros };
  } finally {
    await c.end();
  }
}

// Duas transações concorrentes em clientes separados; se a segunda espera ~1 s, a trava serializou.
async function duasTransacoes(env: Env, travar: string) {
  const uma = async () => {
    const { c } = await novoCliente(env);
    const t0 = performance.now();
    try {
      await c.query('begin');
      await c.query(travar);
      const obtida = performance.now() - t0;
      await c.query('select pg_sleep(1)');
      await c.query('commit');
      return { obtidaMs: obtida, totalMs: performance.now() - t0 };
    } catch (e) {
      await c.query('rollback').catch(() => {});
      return { erro: (e as Error).message };
    } finally {
      await c.end();
    }
  };
  const t0 = performance.now();
  const [a, b] = await Promise.all([uma(), uma()]);
  const paredeMs = performance.now() - t0;
  const obtidas: number[] = [a, b]
    .map((r): number => ('obtidaMs' in r && r.obtidaMs !== undefined ? r.obtidaMs : NaN))
    .sort((x, y) => x - y);
  return {
    a,
    b,
    paredeMs,
    // serializou se a segunda obteve a trava ≥ 900 ms depois da primeira
    serializou: (obtidas[1] ?? NaN) - (obtidas[0] ?? NaN) >= 900,
  };
}

async function trava(env: Env) {
  const advisory = await duasTransacoes(env, "select pg_advisory_xact_lock(hashtext('s7'))");
  const { c } = await novoCliente(env);
  try {
    await c.query('create table if not exists s7_travas (chave text primary key)');
    await c.query("insert into s7_travas values ('x') on conflict do nothing");
  } finally {
    await c.end();
  }
  let forUpdate;
  try {
    forUpdate = await duasTransacoes(env, "select 1 from s7_travas where chave = 'x' for update");
  } finally {
    const { c: c2 } = await novoCliente(env);
    await c2.query('drop table if exists s7_travas');
    await c2.end();
  }
  return { advisory, forUpdate };
}

// RTT de rede do PoP até a origem sem credencial: abre TCP e manda o SSLRequest do protocolo Postgres
// (8 bytes); a resposta 'S' é uma ida e volta completa. Mede conexão TCP e essa ida.
async function rede(host: string, n: number) {
  const conexoes: number[] = [];
  const idas: number[] = [];
  const erros: string[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const t0 = performance.now();
      const s = connect({ hostname: host, port: 5432 });
      await s.opened;
      const t1 = performance.now();
      const w = s.writable.getWriter();
      await w.write(new Uint8Array([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]));
      const r = s.readable.getReader();
      const { value } = await r.read();
      const t2 = performance.now();
      if (!value || String.fromCharCode(value[0]) !== 'S') erros.push(`resposta inesperada: ${value?.[0]}`);
      conexoes.push(t1 - t0);
      idas.push(t2 - t1);
      await s.close();
    } catch (e) {
      erros.push((e as Error).message);
    }
  }
  return {
    host,
    conexaoMs: conexoes,
    idaSslRequestMs: idas,
    conexao: conexoes.length ? estat(conexoes) : null,
    ida: idas.length ? estat(idas) : null,
    erros,
  };
}

async function runtime(env: Env, req: Req) {
  const r: Record<string, unknown> = {};
  const tentar = async (k: string, fn: () => Promise<unknown> | unknown) => {
    try {
      r[k] = await fn();
    } catch (e) {
      r[k] = `ERRO: ${(e as Error).message}`;
    }
  };
  await tentar('typeof process.env.SPIKE_VAR', () => typeof process.env.SPIKE_VAR);
  await tentar('env.SPIKE_VAR (binding)', () => env.SPIKE_VAR);
  await tentar('typeof crypto.scryptSync', async () => typeof (await import('node:crypto')).scryptSync);
  await tentar('scryptSync(a,b,16)', async () =>
    (await import('node:crypto')).scryptSync('a', 'b', 16).toString('hex'),
  );
  await tentar('typeof zlib.zstdDecompressSync', async () => typeof (await import('node:zlib')).zstdDecompressSync);
  await tentar('zstd ida e volta', async () => {
    const z = await import('node:zlib');
    const comp = z.zstdCompressSync(Buffer.from('babel'));
    return z.zstdDecompressSync(comp).toString();
  });
  await tentar('navigator.userAgent', () => navigator.userAgent);
  await tentar('colo', () => req.cf?.colo);
  await tentar('typeof httpServerHandler', async () => typeof (await import('cloudflare:node')).httpServerHandler);
  return r;
}

// Express mínimo via httpServerHandler (cloudflare:node), montado sob demanda.
let expressHandler: { fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response> } | null = null;
async function viaExpress(req: Request, env: Env, ctx: ExecutionContext) {
  if (!expressHandler) {
    const [{ default: express }, { httpServerHandler }, http] = await Promise.all([
      import('express'),
      import('cloudflare:node'),
      import('node:http'),
    ]);
    const app = express();
    app.set('case sensitive routing', true);
    app.get('/express/api/health', (_q, s) => s.json({ ok: true }));
    const server = http.createServer(app);
    server.listen(8787);
    expressHandler = httpServerHandler({ port: 8787 }) as unknown as typeof expressHandler;
  }
  return expressHandler!.fetch(req, env, ctx);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const req = request as Req;
    const url = new URL(request.url);
    const colo = req.cf?.colo;
    try {
      if (url.pathname.startsWith('/express/')) return await viaExpress(request, env, ctx);
      switch (url.pathname) {
        case '/select1':
          return json({ colo, ...(await select1(env)) });
        case '/rota7':
          return json({ colo, ...(await rota7(env)) });
        case '/trava':
          return json({ colo, ...(await trava(env)) });
        case '/rede': {
          const ref = 'bqfjvcfjkyeehizydqfw';
          const [pooler, direto] = await Promise.all([
            rede('aws-1-sa-east-1.pooler.supabase.com', 10),
            rede(`db.${ref}.supabase.co`, 3),
          ]);
          return json({ colo, pooler, direto });
        }
        case '/runtime':
          return json(await runtime(env, req));
        default:
          return json({ rotas: ['/select1', '/rota7', '/trava', '/rede', '/runtime', '/express/api/health'] }, 404);
      }
    } catch (e) {
      return json({ colo, erro: (e as Error).message, stack: (e as Error).stack }, 500);
    }
  },
};
