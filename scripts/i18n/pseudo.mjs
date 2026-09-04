#!/usr/bin/env node
/**
 * PSEUDO-LOCALIZAÇÃO — o teste de i18n que não precisa de tradutor.
 *
 * Gera `public/i18n/xx.json` a partir das chaves do catálogo, trocando cada frase por uma versão
 * acentuada e ~40% mais longa: `Jogo da memória` vira `[Ĵöĝö dá mémöŕíá ····]`.
 *
 * Numa passada pela tela, duas coisas aparecem sozinhas:
 *
 *  1. **Toda string que escapou da extração** continua em português limpo, no meio de um texto
 *     visivelmente estrangeiro. É o único jeito de achar as ~1.400 frases que ainda não passam por
 *     `t()` sem ler 121 arquivos.
 *  2. **Todo lugar que quebra com texto longo.** O alemão ocupa ~30% mais espaço que o português;
 *     os `truncate max-w-[180px]` e os botões `min-w-[160px]` deste app não têm essa folga. A
 *     expansão de 40% antecipa o estrago antes de haver alemão para reclamar.
 *
 * A escrita continua LEGÍVEL de propósito — `Ĵöĝö` se lê, `Jxgx` não. Quem revisa precisa
 * reconhecer a frase para julgar se ela cabe.
 *
 * `xx` é código de idioma reservado para uso privado (ISO 639-2), então não colide com idioma real.
 *
 *   node scripts/i18n/pseudo.mjs          # gera public/i18n/xx.json
 *   node scripts/i18n/pseudo.mjs --check  # falha se estiver desatualizado (para o CI)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(RAIZ, 'public', 'i18n');
const DESTINO = join(DIR, 'xx.json');

/* Uma letra por letra, sem mudar a contagem de caracteres: o que estica o texto é o sufixo, e ele
   fica separado no fim para não atrapalhar a leitura da frase. */
const SOTAQUE = {
  a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', y: 'ý', s: 'š', z: 'ž',
  A: 'Á', E: 'É', I: 'Í', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ', J: 'Ĵ', G: 'Ĝ', S: 'Š',
};

/** Alemão ocupa ~30% mais que português; 40% dá margem e ainda é realista. */
const EXPANSAO = 0.4;

/**
 * `{n}` e `<b>` ficam INTACTOS. Acentuar um placeholder quebraria a interpolação, e acentuar uma
 * tag quebraria o `<T>` — o pseudo-idioma precisa exercitar o caminho real, não um caminho
 * inventado. Se `{n}` aparecer acentuado na tela, é bug de verdade.
 */
function pseudo(frase) {
  const partes = frase.split(/(\{\w+\}|<\/?[a-zA-Z][\w-]*\s*\/?>)/g);
  const texto = partes
    .map((p, i) => (i % 2 === 1 ? p : [...p].map((c) => SOTAQUE[c] ?? c).join('')))
    .join('');
  const enchimento = '·'.repeat(Math.max(2, Math.round(frase.length * EXPANSAO)));
  return `[${texto} ${enchimento}]`;
}

function pseudoValor(valor) {
  if (typeof valor === 'string') return pseudo(valor);
  // Plural: cada forma vira pseudo, e as categorias do idioma se mantêm.
  return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, pseudo(v)]));
}

/* As chaves de TODOS os catálogos, unidas: a chave é o texto português, então a união é o que o
   app já sabe traduzir. Uma frase que só existe no `en.json` também precisa aparecer no pseudo. */
function chavesConhecidas() {
  const chaves = new Map();
  for (const arquivo of readdirSync(DIR)) {
    if (!arquivo.endsWith('.json') || arquivo === 'xx.json') continue;
    const catalogo = JSON.parse(readFileSync(join(DIR, arquivo), 'utf8'));
    for (const [chave, valor] of Object.entries(catalogo)) {
      // Guarda a forma mais rica vista: um plural em pt vale mais que uma string.
      if (!chaves.has(chave) || typeof valor !== 'string') chaves.set(chave, valor);
    }
  }
  return chaves;
}

const catalogo = {};
for (const [chave, valor] of [...chavesConhecidas()].sort(([a], [b]) => a.localeCompare(b, 'pt'))) {
  // O pseudo é gerado da CHAVE (português), não da tradução — é o português que a tela mostra.
  catalogo[chave] = typeof valor === 'string' ? pseudo(chave) : pseudoValor(
    Object.fromEntries(Object.keys(valor).map((k) => [k, chave])),
  );
}

const conteudo = JSON.stringify(catalogo, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const atual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  if (atual !== conteudo) {
    console.error(
      '❌ i18n/pseudo: `public/i18n/xx.json` está desatualizado.\n'
      + '   Rode `npm run i18n:pseudo` e faça commit — sem isso o teste de layout roda sobre um\n'
      + '   catálogo velho e deixa de ver as strings novas.',
    );
    process.exit(1);
  }
  console.log(`✅ i18n/pseudo: xx.json em dia (${Object.keys(catalogo).length} chaves).`);
} else {
  writeFileSync(DESTINO, conteudo);
  console.log(`escrito ${DESTINO} · ${Object.keys(catalogo).length} chaves`);
  console.log(`  exemplo: ${pseudo('Jogo da memória')}`);
}
