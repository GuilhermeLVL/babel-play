// O servidor de producao do build <nome> com um banco VAZIO (so as migrations), para as suites e2e.
// Fica de pe ate o arquivo `parar-e2e` aparecer ao lado (ou ate ser encerrado).
// uso: node servidorE2e.mjs <depois|antes2> <porta>
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
const nome = process.argv[2] || 'depois';
const porta = process.argv[3] || '4331';
const REPO = 'C:/Users/Guilh/dev/ei-polimento';
const TMP = 'C:/Users/Guilh/AppData/Local/Temp/e2e-babel';
const BANCO = `${TMP}/perf-cli-e2e-${porta}.db`;
const AQUI = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const SINAL = path.join(AQUI, 'm', `parar-e2e-${porta}`);
if (existsSync(SINAL)) rmSync(SINAL);
for (const s of ['', '-wal', '-shm']) if (existsSync(BANCO + s)) rmSync(BANCO + s);
mkdirSync(`${TMP}/audio-perf-cli`, { recursive: true });
const { createClient } = await import('file:///' + REPO + '/node_modules/@libsql/client/lib-esm/node.js').catch(() => import('file:///' + REPO + '/node_modules/@libsql/client/lib-cjs/node.js'));
const { drizzle } = await import('file:///' + REPO + '/node_modules/drizzle-orm/libsql/index.js');
const { migrate } = await import('file:///' + REPO + '/node_modules/drizzle-orm/libsql/migrator.js');
const c = createClient({ url: 'file:' + BANCO });
await migrate(drizzle(c), { migrationsFolder: REPO + '/server/db/migrations' });
c.close();
const filho = spawn(process.execPath, [`${REPO}/node_modules/.cache/perf-cli/${nome}/server.cjs`], {
  cwd: path.join(AQUI, nome),
  env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    NODE_ENV: 'production', PORT: porta, HOST: '127.0.0.1',
    DATABASE_URL: 'file:' + BANCO, MIGRATIONS_DIR: REPO + '/server/db/migrations',
    AUDIO_DIR: `${TMP}/audio-perf-cli`, BACKUP_DIARIO: '0', SECRET_KEY: randomBytes(32).toString('hex'),
    AUTH_REQUIRED: '0', SELF_HOST: '1', TRUST_PROXY: 'false', LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
process.on('exit', () => filho.exitCode === null && filho.kill());
for (const t0 = Date.now(); ; ) {
  try {
    if ((await fetch(`http://127.0.0.1:${porta}/api/ready`, { signal: AbortSignal.timeout(2000) })).ok) break;
  } catch {}
  if (Date.now() - t0 > 60000) throw new Error('servidor nao subiu');
  await new Promise((r) => setTimeout(r, 300));
}
console.log('PRONTO', nome, porta);
const fim = setInterval(() => {
  if (existsSync(SINAL) || filho.exitCode !== null) {
    clearInterval(fim);
    if (filho.exitCode === null) filho.kill();
    if (existsSync(SINAL)) rmSync(SINAL);
    console.log('ENCERRADO');
    process.exit(0);
  }
}, 1000);
