/**
 * Secrets do Worker por script (Fase 4, T4).
 *
 *   npx tsx scripts/cloudflare/secrets.ts <staging|production> [--dry-run] [--arquivo caminho]
 *   npx tsx scripts/cloudflare/secrets.ts --exemplo     (reescreve o .secrets.example.json)
 *
 * Lê `.secrets.<ambiente>.json` (objeto plano nome → texto, NUNCA versionado), confere as chaves contra
 * `server/lib/config.ts` e entrega ao `wrangler secret bulk`. Os VALORES nunca são impressos.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { nomesDosSecretsObrigatorios, VARIAVEIS } from '../../server/lib/config';

const AMBIENTES = ['staging', 'production'] as const;
const EXEMPLO = '.secrets.example.json';

const obrigatorias = nomesDosSecretsObrigatorios();

function falhar(msg: string): never {
  console.error(`[secrets] ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.includes('--exemplo')) {
  writeFileSync(EXEMPLO, JSON.stringify(Object.fromEntries(obrigatorias.map((n) => [n, ''])), null, 2) + '\n');
  console.log(`[secrets] ${EXEMPLO} reescrito com ${obrigatorias.length} nomes.`);
  process.exit(0);
}

const ambiente = args.find((a) => (AMBIENTES as readonly string[]).includes(a));
if (!ambiente) falhar(`uso: secrets.ts <${AMBIENTES.join('|')}> [--dry-run] [--arquivo caminho] | --exemplo`);
const dry = args.includes('--dry-run');
const i = args.indexOf('--arquivo');
const arquivo = i >= 0 ? args[i + 1] : `.secrets.${ambiente}.json`;
if (!arquivo) falhar('--arquivo precisa de um caminho');

if (!existsSync(arquivo)) {
  if (dry) {
    console.log(`[secrets] ${arquivo} não existe. Nomes obrigatórios (${obrigatorias.length}):`);
    for (const n of obrigatorias) console.log(`  - ${n}`);
    console.log(`Crie o arquivo a partir de ${EXEMPLO} (ele é ignorado pelo git).`);
    process.exit(0);
  }
  falhar(`${arquivo} não existe. Copie ${EXEMPLO} para ${arquivo} e preencha (o arquivo é ignorado pelo git).`);
}

let dados: unknown;
try {
  dados = JSON.parse(readFileSync(arquivo, 'utf8'));
} catch {
  falhar(`${arquivo} não é JSON válido.`);
}
if (!dados || typeof dados !== 'object' || Array.isArray(dados))
  falhar(`${arquivo} precisa ser um objeto { NOME: "valor" }.`);
const objeto = dados as Record<string, unknown>;
const naoTexto = Object.keys(objeto).filter((k) => typeof objeto[k] !== 'string');
if (naoTexto.length) falhar(`valores que não são texto: ${naoTexto.join(', ')}.`);

const preenchida = (n: string) => typeof objeto[n] === 'string' && (objeto[n] as string).trim().length > 0;
const ausentes = obrigatorias.filter((n) => !preenchida(n));
const conhecidas = new Set(VARIAVEIS.map((v) => v.nome));
const desconhecidas = Object.keys(objeto).filter((k) => !conhecidas.has(k));
const vazias = Object.keys(objeto).filter((k) => !preenchida(k) && !ausentes.includes(k));

if (desconhecidas.length)
  console.warn(`[secrets] AVISO: chaves que o config.ts não conhece: ${desconhecidas.join(', ')}`);
if (ausentes.length) falhar(`obrigatórias ausentes ou vazias em ${arquivo}: ${ausentes.join(', ')}`);
/* Vazio não é "sem valor": o wrangler o recusaria no meio do envio (ou gravaria um secret em branco). Quem
   não tem o valor tira a chave do arquivo. */
if (vazias.length) falhar(`chaves com valor vazio em ${arquivo} (preencha ou remova): ${vazias.join(', ')}`);

console.log(`[secrets] ${Object.keys(objeto).length} chaves em ${arquivo}; obrigatórias ok.`);
if (dry) {
  console.log('[secrets] --dry-run: nada foi enviado.');
  process.exit(0);
}

const r = spawnSync(
  'npx',
  [
    'wrangler',
    'secret',
    'bulk',
    arquivo,
    '-c',
    'wrangler.jsonc',
    ...(ambiente === 'staging' ? ['--env', 'staging'] : []),
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
