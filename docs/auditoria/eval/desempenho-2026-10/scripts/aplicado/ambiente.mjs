// Sobe o servidor de producao (dist-server/server.cjs de <raiz>) com um banco proprio semeado.
// O banco e restaurado do modelo a cada subida: ANTES e DEPOIS partem do mesmo estado.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
const REPO = 'C:/Users/Guilh/dev/ei-polimento';
const TMP = 'C:/Users/Guilh/AppData/Local/Temp/e2e-babel';
const BANCO = TMP + '/perf-cli.db';
const MODELO = TMP + '/perf-cli-modelo.db';
const AQUI = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
export async function subir(nome, porta = 4310, { restaurar = true } = {}) {
  const raiz = path.join(AQUI, nome);
  mkdirSync(TMP + '/audio-perf-cli', { recursive: true });
  if (!existsSync(MODELO)) {
    const { preparar } = await import('file:///' + REPO + '/scripts/perf/suite/preparar.mjs');
    console.log('semeando', JSON.stringify(await preparar({ db: MODELO, pesados: 0, medios: 0 })));
  }
  if (restaurar) {
    for (const s of ['', '-wal', '-shm']) if (existsSync(BANCO + s)) rmSync(BANCO + s);
    for (const s of ['', '-wal', '-shm']) if (existsSync(MODELO + s)) copyFileSync(MODELO + s, BANCO + s);
  }
  const base = `http://127.0.0.1:${porta}`;
  const filho = spawn(process.execPath, [REPO + '/node_modules/.cache/perf-cli/' + (nome.startsWith('legivel') ? 'antes' : nome) + '/server.cjs'], {
    cwd: raiz,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      NODE_PATH: REPO + '/node_modules',
      NODE_ENV: 'production', PORT: String(porta), HOST: '127.0.0.1',
      DATABASE_URL: 'file:' + BANCO, MIGRATIONS_DIR: REPO + '/server/db/migrations',
      AUDIO_DIR: TMP + '/audio-perf-cli', BACKUP_DIARIO: '0', SECRET_KEY: randomBytes(32).toString('hex'),
      AUTH_REQUIRED: '0', SELF_HOST: '1', TRUST_PROXY: 'false', LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  filho.stderr.on('data', (d) => (err += d));
  let morreu = null;
  filho.on('exit', (c) => (morreu = c));
  const parar = () => { if (filho.exitCode === null) filho.kill(); };
  process.on('exit', parar);
  for (const t0 = Date.now(); ; ) {
    if (morreu !== null) throw new Error('servidor morreu: ' + err.slice(-1500));
    try { if ((await fetch(base + '/api/ready', { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
    if (Date.now() - t0 > 90000) throw new Error('servidor nao subiu: ' + err.slice(-1500));
    await new Promise((r) => setTimeout(r, 300));
  }
  const r = await fetch(base + '/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ui: { onboarded: true, providerMode: 'local', credentialId: null } }) });
  if (!r.ok) throw new Error('PUT settings ' + r.status);
  process.env.URL0 = base;
  return { base, parar };
}
