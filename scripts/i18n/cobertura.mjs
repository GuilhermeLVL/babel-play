#!/usr/bin/env node
/**
 * QUANTO DE CADA CATÁLOGO EXISTE — o número que decide quais idiomas a interface oferece.
 *
 * A auditoria de 2026-09-07 (achado A38) encontrou `es` na lista de idiomas oferecidos com **20 de
 * 675 chaves traduzidas**: quem escolhesse espanhol via 3% da tela em espanhol e 97% em português,
 * sem nenhum aviso. O fallback por chave-texto (ver `src/lib/i18n.ts`) é o que torna isso possível
 * — e invisível.
 *
 * A lista de idiomas oferecidos passa a sair DAQUI, e não de uma constante escrita à mão. Um
 * idioma entra quando o catálogo dele cobre o piso; até lá ele existe no repositório (dá para
 * traduzir e medir o progresso) mas não é oferecido como opção de produto.
 *
 *   node scripts/i18n/cobertura.mjs          # regenera src/data/i18n/cobertura.json
 *   node scripts/i18n/cobertura.mjs --check  # falha se estiver desatualizado (para o CI)
 *
 * O DENOMINADOR é a união das chaves de todos os catálogos: é o conjunto de frases que já passaram
 * por `t()` e foram extraídas. Ele cresce a cada tela migrada, então a cobertura de um idioma CAI
 * quando a extração avança — o que é honesto: a tela nova não está traduzida.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR_CATALOGOS = join(RAIZ, 'public', 'i18n');
const DESTINO = join(RAIZ, 'src', 'data', 'i18n', 'cobertura.json');

/** O pseudo-idioma é ferramenta de teste de layout, não opção de produto — fica fora da conta. */
const FORA_DA_CONTA = new Set(['xx']);

/**
 * O PISO. Abaixo disto o idioma não é oferecido.
 *
 * 0,9 e não 1,0 porque uma tela recém-migrada sempre chega antes do tradutor, e derrubar um idioma
 * inteiro por uma frase nova seria pior para quem já lia a interface naquele idioma. Abaixo de 90%
 * a experiência vira mistura, que é o defeito que este piso existe para impedir.
 */
export const PISO_DE_COBERTURA = 0.9;

function catalogos() {
  const fora = new Map();
  for (const arquivo of existsSync(DIR_CATALOGOS) ? readdirSync(DIR_CATALOGOS) : []) {
    if (!arquivo.endsWith('.json')) continue;
    const idioma = arquivo.replace(/\.json$/, '');
    fora.set(idioma, JSON.parse(readFileSync(join(DIR_CATALOGOS, arquivo), 'utf8')));
  }
  return fora;
}

function medir() {
  const lidos = catalogos();
  const universo = new Set();
  for (const [idioma, catalogo] of lidos) {
    if (FORA_DA_CONTA.has(idioma)) continue;
    for (const chave of Object.keys(catalogo)) universo.add(chave);
  }
  const total = universo.size;

  /* Português é a ORIGEM: a chave é a própria frase portuguesa, então a cobertura é 1 por
     construção e não existe arquivo para medir. */
  const idiomas = { pt: { chaves: total, cobertura: 1 } };
  for (const [idioma, catalogo] of [...lidos].sort()) {
    if (FORA_DA_CONTA.has(idioma)) continue;
    const chaves = Object.keys(catalogo).filter((k) => universo.has(k)).length;
    idiomas[idioma] = { chaves, cobertura: total ? Number((chaves / total).toFixed(4)) : 0 };
  }
  return { total, piso: PISO_DE_COBERTURA, idiomas };
}

const medido = medir();
const serializado = JSON.stringify(medido, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const atual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  if (atual !== serializado) {
    console.error('cobertura.json está desatualizado. Rode: node scripts/i18n/cobertura.mjs');
    process.exit(1);
  }
  console.log(`cobertura em dia · ${medido.total} chaves no universo`);
  process.exit(0);
}

mkdirSync(dirname(DESTINO), { recursive: true });
writeFileSync(DESTINO, serializado);
for (const [idioma, m] of Object.entries(medido.idiomas)) {
  const oferecido = m.cobertura >= PISO_DE_COBERTURA ? 'oferecido' : 'abaixo do piso';
  console.log(`${idioma}: ${m.chaves}/${medido.total} (${Math.round(m.cobertura * 100)}%) — ${oferecido}`);
}
