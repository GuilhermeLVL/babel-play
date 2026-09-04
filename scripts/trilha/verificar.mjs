#!/usr/bin/env node
// Confere os derivados contra a trilha de origem: contagens do índice, e toda palavra de
// `niveis/<lang>.json` presente no `<lang>.json` no mesmo nível. Sai 1 em divergência.
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RAIZ, 'public', 'trilha')
const DIR_DERIVADOS = join(RAIZ, 'src', 'data', 'trilha')
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const erros = []

function chave(palavra) {
  return palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * GATE DE PUBLICAÇÃO — uma trilha ruim é pior que nenhuma.
 *
 * Medido no tailandês, que a fonte de frequência não segmenta em palavras (o idioma não usa espaço
 * entre elas, e o corpus foi cortado por espaço): 2% de glosas, 21% com frase, 15% de palavras
 * latinas no meio. Quem escolhesse "Curso de palavras" ali não conseguiria jogar quase nada, e a
 * tela não teria como explicar. Os cortes são frouxos de propósito: barram o inaceitável, não o
 * imperfeito.
 */
const MINIMO_DE_GLOSA = 0.05;
const MAXIMO_FORA_DA_ESCRITA = 0.10;

const ESCRITA_DO_IDIOMA = {
  ar: /\p{Script=Arabic}/u, he: /\p{Script=Hebrew}/u, hi: /\p{Script=Devanagari}/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, zh: /\p{Script=Han}/u,
  ko: /\p{Script=Hangul}/u, ru: /\p{Script=Cyrillic}/u, th: /\p{Script=Thai}/u,
};

function auditarPublicacao(lang, trilha, glosas) {
  const problemas = [];
  const palavras = Object.values(trilha.niveis ?? {}).flat().map((p) => p[0]);
  if (!palavras.length) return ['sem palavras'];

  const comGlosa = palavras.filter((p) => glosas?.[p]).length;
  const taxa = comGlosa / palavras.length;
  if (taxa < MINIMO_DE_GLOSA) {
    problemas.push(`só ${Math.round(taxa * 100)}% das palavras têm tradução (mínimo ${MINIMO_DE_GLOSA * 100}%)`);
  }

  const escrita = ESCRITA_DO_IDIOMA[lang];
  if (escrita) {
    const fora = palavras.filter((p) => !escrita.test(p)).length / palavras.length;
    if (fora > MAXIMO_FORA_DA_ESCRITA) {
      problemas.push(`${Math.round(fora * 100)}% das palavras não estão na escrita do idioma (máximo ${MAXIMO_FORA_DA_ESCRITA * 100}%)`);
    }
  }
  return problemas;
}

const indice = JSON.parse(readFileSync(join(DIR_DERIVADOS, 'indice.json'), 'utf8'))

for (const [lang, entrada] of Object.entries(indice)) {
  const origem = join(DIR, `${lang}.json`)
  const derivado = join(DIR_DERIVADOS, 'niveis', `${lang}.json`)
  if (!existsSync(origem)) { erros.push(`${lang}: falta ${lang}.json`); continue }
  if (!existsSync(derivado)) { erros.push(`${lang}: falta niveis/${lang}.json`); continue }

  const dado = JSON.parse(readFileSync(origem, 'utf8'))
  const niveis = JSON.parse(readFileSync(derivado, 'utf8'))

  let total = 0
  let comFrase = 0
  // v1 guarda a frase em [2] (depois da tradução); v2 é monolíngue e a guarda em [1].
  const colunaDaFrase = Number(dado.versao) === 2 ? 1 : 2
  const porNivelReal = {}
  const nivelDaPalavra = new Map()
  for (const nivel of NIVEIS) {
    const itens = dado.niveis?.[nivel] ?? []
    porNivelReal[nivel] = itens.length
    total += itens.length
    for (const item of itens) {
      if (item[colunaDaFrase]) comFrase++
      const k = chave(item[0])
      if (k && !nivelDaPalavra.has(k)) nivelDaPalavra.set(k, nivel)
    }
  }

  if (entrada.total !== total) erros.push(`${lang}: índice total ${entrada.total} ≠ ${total}`)
  if (entrada.comFrase !== comFrase) erros.push(`${lang}: índice comFrase ${entrada.comFrase} ≠ ${comFrase}`)
  for (const nivel of NIVEIS) {
    if ((entrada.porNivel?.[nivel] ?? 0) !== porNivelReal[nivel]) {
      erros.push(`${lang}: índice porNivel.${nivel} ${entrada.porNivel?.[nivel]} ≠ ${porNivelReal[nivel]}`)
    }
  }

  let derivadas = 0
  for (const nivel of NIVEIS) {
    for (const palavra of (niveis[nivel] ?? '').split('|')) {
      if (!palavra) continue
      derivadas++
      const real = nivelDaPalavra.get(palavra)
      if (!real) erros.push(`${lang}: "${palavra}" (${nivel}) não existe em ${lang}.json`)
      else if (real !== nivel) erros.push(`${lang}: "${palavra}" está em ${nivel} mas ${lang}.json diz ${real}`)
    }
  }
  if (derivadas !== nivelDaPalavra.size) {
    erros.push(`${lang}: niveis/${lang}.json tem ${derivadas} palavras, esperava ${nivelDaPalavra.size}`)
  }

  /* O gate roda aqui, e não num script à parte, porque é a mesma pergunta: este dado pode ir para
     a mão de alguém? Sem a glosa do par declarado não há como medir, e aí ele se cala. */
  const par = (entrada.glosas ?? [])[0]
  const arquivoDeGlosas = par && join(RAIZ, 'public', 'glosas', `${lang}-${par}.json`)
  if (arquivoDeGlosas && existsSync(arquivoDeGlosas)) {
    const { glosas } = JSON.parse(readFileSync(arquivoDeGlosas, 'utf8'))
    for (const problema of auditarPublicacao(lang, dado, glosas)) erros.push(`${lang}: ${problema}`)
  }

  console.log(`${lang}: ${total} palavras · ${comFrase} com frase · ${derivadas} no derivado`)
}

if (erros.length) {
  console.error('❌ trilha/verificar:\n  ' + erros.join('\n  '))
  process.exit(1)
}
console.log('✅ trilha/verificar: índice e derivados batem com a origem.')
