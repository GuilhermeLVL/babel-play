#!/usr/bin/env node
/**
 * O PREÇO DE USAR O TEXTO COMO CHAVE, cobrado à vista.
 *
 * Traduzir por chave-texto (ver `src/lib/i18n.ts`) tem uma consequência: mudar a frase portuguesa
 * troca a chave, e a tradução daquela frase volta ao português sem ninguém perceber — nenhum teste
 * falha, porque o fallback é legível. Este script é o detector: lista as chaves do catálogo que
 * não aparecem mais em nenhum `t(...)` do código.
 *
 *   node scripts/i18n/orfas.mjs            # órfãs de todos os catálogos
 *   node scripts/i18n/orfas.mjs --progresso # quanto da interface já passa por t()
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR_CATALOGOS = join(RAIZ, 'public', 'i18n');

function arquivosDeCodigo(dir, fora = []) {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, nome.name);
    if (nome.isDirectory()) arquivosDeCodigo(caminho, fora);
    else if (/\.(ts|tsx)$/.test(nome.name)) fora.push(caminho);
  }
  return fora;
}

const codigo = arquivosDeCodigo(join(RAIZ, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');

/* As chaves aparecem como `t('...')`, `t("...")` ou dentro de tabelas de rótulo que o ponto de uso
   traduz. Procurar a FRASE no código, e não só o `t(`, é o que permite migrar uma tabela sem
   reescrever cada entrada. */
const usada = (frase) => codigo.includes(frase);

let houveOrfa = false;
for (const arquivo of existsSync(DIR_CATALOGOS) ? readdirSync(DIR_CATALOGOS) : []) {
  if (!arquivo.endsWith('.json')) continue;
  const catalogo = JSON.parse(readFileSync(join(DIR_CATALOGOS, arquivo), 'utf8'));
  const orfas = Object.keys(catalogo).filter((k) => !usada(k));
  const total = Object.keys(catalogo).length;
  console.log(`${arquivo}: ${total} chaves · ${orfas.length} órfãs`);
  for (const o of orfas) console.log(`  não existe mais no código: "${o}"`);
  if (orfas.length) houveOrfa = true;
}

if (process.argv.includes('--progresso')) {
  // `t('...')` e tambem `t(item.short)`: traduzir uma tabela passa pelo ponto de uso.
  const chamadas = (codigo.match(/(?<![\w.])t\(/g) ?? []).length;
  /* Denominador honesto: literais com acento no JSX e em atributos de texto. Superestima (pega
     JSDoc), então serve para acompanhar a tendência, não para prometer um número exato. */
  const comAcento = (codigo.match(/['"`][^'"`\n]*[áàâãéêíóôõúçÁÉÍÓÚÂÊÔÃÕÇ][^'"`\n]*['"`]/g) ?? []).length;
  console.log(`\nprogresso: ${chamadas} chamadas de t() · ~${comAcento} literais em português no código`);
  /**
   * O PISO — a catraca que impede a migracao de andar para tras.
   *
   * Cobertura de i18n nao se perde por decisao: ela se perde por descuido, uma tela de cada vez, e
   * ninguem percebe porque o fallback e sempre legivel (a chave E o proprio portugues). Um piso no
   * CI transforma isso num erro de build: quem remover chamadas de `t()` precisa dizer por que e
   * baixar o numero a mao, no mesmo commit. O piso so sobe.
   */
  const arg = process.argv.find((a) => a.startsWith('--piso='));
  if (arg) {
    const piso = Number(arg.slice('--piso='.length));
    if (chamadas < piso) {
      console.error(
        `
ERRO: ${chamadas} chamadas de t(), abaixo do piso de ${piso}.
` +
        'A interface perdeu cobertura de traducao. Se a remocao foi deliberada (codigo morto, tela ' +
        'excluida), baixe o piso em .github/workflows/ci.yml no mesmo commit, dizendo por que.'
      );
      process.exit(1);
    }
    console.log(`piso de ${piso} chamadas: ok`);
  }
}

process.exit(houveOrfa ? 1 : 0);
