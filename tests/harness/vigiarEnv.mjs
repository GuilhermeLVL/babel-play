/**
 * PRELOAD (`node --import`) QUE VIGIA AS LEITURAS DE `process.env`.
 *
 * Usado por `tests/integration/importacao-sem-efeitos.test.ts`: embrulha `process.env` num Proxy que
 * guarda a pilha de cada leitura (`get`, `has`, `ownKeys`, `getOwnPropertyDescriptor`). Depois do import
 * do app, `globalThis.__leiturasDeEnvDoApp()` devolve as leituras feitas PELO APP: aquelas em que o
 * frame mais próximo da leitura (fora do runtime do Node e deste arquivo) está em `server/`, `src/` ou
 * `server.ts`, fora de `node_modules`. Leitura de biblioteca (`node_modules`, inclusive o `dotenv`) passa.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESTE = fileURLToPath(import.meta.url);
const leituras = [];
let dentro = false;

function quemLeu() {
  const limite = Error.stackTraceLimit;
  Error.stackTraceLimit = 60;
  const pilha = new Error().stack ?? '';
  Error.stackTraceLimit = limite;
  const frames = pilha.split('\n').slice(1);
  const leitor = frames.find((f) => !f.includes(ESTE) && !f.includes('node:') && !f.includes('(<anonymous>)'));
  return { leitor: leitor?.trim() ?? '?', pilha: frames.slice(0, 8).join('\n') };
}

function ehDoApp(frame) {
  const semUrl = frame.replace('file://', '');
  if (!semUrl.includes(RAIZ) || semUrl.includes('node_modules')) return false;
  const rel = semUrl.slice(semUrl.indexOf(RAIZ) + RAIZ.length + 1);
  return rel.startsWith('server/') || rel.startsWith('src/') || rel.startsWith('server.ts');
}

function registrar(op, chave) {
  if (dentro) return;
  dentro = true;
  try {
    const { leitor, pilha } = quemLeu();
    if (ehDoApp(leitor)) leituras.push(`${op} ${String(chave)} ← ${leitor}\n${pilha}`);
  } finally {
    dentro = false;
  }
}

const real = process.env;
process.env = new Proxy(real, {
  get(alvo, chave) {
    registrar('get', chave);
    return Reflect.get(alvo, chave);
  },
  has(alvo, chave) {
    registrar('has', chave);
    return Reflect.has(alvo, chave);
  },
  ownKeys(alvo) {
    registrar('ownKeys', '*');
    return Reflect.ownKeys(alvo);
  },
  getOwnPropertyDescriptor(alvo, chave) {
    registrar('getOwnPropertyDescriptor', chave);
    return Reflect.getOwnPropertyDescriptor(alvo, chave);
  },
});

globalThis.__leiturasDeEnvDoApp = () => leituras.slice();
