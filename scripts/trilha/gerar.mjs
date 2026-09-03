#!/usr/bin/env -S npx tsx
/**
 * Gera `src/data/trilha/<lang>.json` no schema v2 (design.md, Decisão 1).
 *
 *   npx tsx scripts/trilha/gerar.mjs es
 *   npx tsx scripts/trilha/gerar.mjs es --dry-run --limite=5000 --sem-frases
 *
 * Roda sob **tsx** porque o pipeline importa `src/core/learning/quality.ts` — a régua real do
 * app. É o único módulo com efeito colateral: os outros são funções puras.
 *
 * A trilha sai MONOLÍNGUE (palavra + frase). Glosas são um arquivo à parte, por par de idiomas.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { atribuicao, frequenciaDe, frasesDe, traducoesDasFrases } from './fontes.mjs';
import { filtrar } from './filtrar.mjs';
import { faixas, coberturaDasFaixas, NIVEIS } from './faixas.mjs';
import { formasPorLema, glosas as glosasDoIdioma, lematizar } from './lexemes.mjs';
import { indexar, escolherFrase, vocabularioDe } from './frases.mjs';
import { avaliarCartao } from '../../src/core/learning/quality.ts';

export function montarTrilha(lang, porNivel, comFrases) {
  const niveis = {};
  for (const n of NIVEIS) {
    niveis[n] = (porNivel[n] ?? []).map(({ palavra }) => {
      const frase = comFrases?.get(palavra);
      return frase ? [palavra, frase] : [palavra];
    });
  }
  return {
    lang,
    versao: 2,
    escala: 'frequencia',
    procedencia: 'frequencia',
    fonte: atribuicao(lang),
    niveis,
  };
}

export function relatorio(trilha, porNivel, descartes) {
  const cobertura = coberturaDasFaixas(porNivel);
  const linhas = [`trilha ${trilha.lang} — escala ${trilha.escala}, versão ${trilha.versao}`];
  let total = 0;
  let comFrase = 0;
  for (const c of cobertura) {
    const entradas = trilha.niveis[c.nivel];
    const frases = entradas.filter((e) => e.length > 1).length;
    total += entradas.length;
    comFrase += frases;
    linhas.push(
      `  ${c.nivel}: ${entradas.length} palavras · ${frases} com frase (${pct(frases / (entradas.length || 1))})`
      + ` · fatia do corpus ${pct(c.fatia)} · cumulativo ${pct(c.cumulativo)}`);
  }
  linhas.push(`  total: ${total} palavras · ${comFrase} com frase (${pct(comFrase / (total || 1))})`);
  const fora = Object.entries(descartes ?? {}).sort((a, b) => b[1] - a[1]);
  if (fora.length) linhas.push(`  descartes: ${fora.map(([m, n]) => `${n} ${m}`).join(', ')}`);
  return linhas.join('\n');
}

const pct = (x) => `${Math.round(x * 100)}%`;

async function principal(argv) {
  const lang = argv.find((a) => !a.startsWith('-'));
  if (!lang) throw new Error('uso: npx tsx scripts/trilha/gerar.mjs <lang> [--dry-run]');
  const seco = argv.includes('--dry-run');
  const semFrases = argv.includes('--sem-frases');
  const limite = Number((argv.find((a) => a.startsWith('--limite=')) ?? '').split('=')[1]) || 0;

  const nativo = (argv.find((a) => a.startsWith('--nativo=')) ?? '--nativo=pt').split('=')[1];
  const semLema = argv.includes('--sem-lema');

  const bruta = await frequenciaDe(lang);
  /* LEMATIZAR ANTES DE CORTAR: a lista de frequência traz conjugações (estoy, estás, estamos como
     três entradas), e cortar primeiro gastaria o limite com formas do mesmo verbo. */
  const mapaDeLemas = semLema ? new Map() : await formasPorLema(lang);
  const lematizada = mapaDeLemas.size ? lematizar(bruta, mapaDeLemas, lang) : bruta;
  const { palavras, descartes } = filtrar(limite ? lematizada.slice(0, limite) : lematizada, lang);
  const porNivel = faixas(palavras);

  const { mapa: glosas, doWikidata, doWikcionario } = await glosasDoIdioma(lang, nativo);

  const comFrases = new Map();
  /* Frase -> tradução, chaveada pelo TEXTO porque é assim que o carregador do app faz o join
     (`glosas.frases[frase]`); o id do Tatoeba serve só para achá-la aqui. */
  const traducaoDaFrase = {};
  let frasesTraduzidas = 0;
  if (!semFrases) {
    /* `alvos` = todas as palavras da trilha. Em japonês/chinês/tailandês é o que permite achar a
       palavra dentro da frase sem tokenizador — ver `tokensSemEspaco`. */
    const alvos = new Set(NIVEIS.flatMap((n) => [...vocabularioDe(porNivel[n])]));
    const indice = indexar(await frasesDe(lang), { alvos });
    const traducoes = await traducoesDasFrases(lang, nativo);
    const idsTraduzidos = traducoes.size ? new Set(traducoes.keys()) : undefined;
    const acumulado = new Set();
    for (const n of NIVEIS) {
      for (const chave of vocabularioDe(porNivel[n])) acumulado.add(chave);
      for (const { palavra } of porNivel[n]) {
        const escolhida = escolherFrase(palavra, indice, acumulado, idsTraduzidos);
        if (!escolhida) continue;
        comFrases.set(palavra, escolhida.frase);
        const pt = escolhida.id ? traducoes.get(escolhida.id) : undefined;
        if (pt && !traducaoDaFrase[escolhida.frase]) { traducaoDaFrase[escolhida.frase] = pt; frasesTraduzidas++; }
      }
    }
  }

  const trilha = montarTrilha(lang, porNivel, comFrases);

  /* A glosa é do PAR, e vive fora da trilha (design.md, Decisão 1): a trilha é monolíngue e a
     tradução pertence a "praticado × nativo". Sem isto os jogos de par não abrem. */
  const glosasDaTrilha = {};
  let comGlosa = 0;
  for (const n of NIVEIS) {
    for (const [palavra] of trilha.niveis[n]) {
      const g = glosas.get(String(palavra).toLowerCase());
      if (g) { glosasDaTrilha[palavra] = g; comGlosa++; }
    }
  }

  // Confere a saída com a régua do jogo, em vez de confiar no filtro de entrada.
  let reprovados = 0;
  for (const n of NIVEIS) {
    for (const [palavra, frase] of trilha.niveis[n]) {
      const v = avaliarCartao({ word: palavra, translation: '', sentence: frase ?? '', srcLang: lang },
        { lang, origem: 'curado' });
      if (!v.serve && v.motivo !== 'sem-pista') reprovados++;
    }
  }

  console.log(relatorio(trilha, porNivel, descartes));
  const total = NIVEIS.reduce((s, n) => s + trilha.niveis[n].length, 0);
  const pct = Math.round((comGlosa / Math.max(1, total)) * 100);
  console.log(`  lemas: ${mapaDeLemas.size ? 'sim' : 'NAO (--sem-lema)'} · glosas ${lang}-${nativo}: ${comGlosa} de ${total} (${pct}%)`
    + ` · fontes: wikidata ${doWikidata}, wikcionario ${doWikcionario}`);
  const comFrase = NIVEIS.reduce((s, n) => s + trilha.niveis[n].filter((p) => p.length > 1).length, 0);
  console.log(`  frases traduzidas ${lang}-${nativo}: ${frasesTraduzidas} de ${comFrase}`
    + ` (${Math.round((frasesTraduzidas / Math.max(1, comFrase)) * 100)}%) — é o que abre os jogos de frase`);
  if (reprovados) console.log(`  ATENÇÃO: ${reprovados} entradas reprovam na régua do app`);

  const destino = path.resolve(process.cwd(), 'src/data/trilha', `${lang}.json`);
  const destinoGlosas = path.resolve(process.cwd(), 'src/data/glosas', `${lang}-${nativo}.json`);
  if (seco) { console.log(`--dry-run: nada escrito (seriam ${destino} e ${destinoGlosas})`); return; }
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, JSON.stringify(trilha) + '\n');
  await mkdir(path.dirname(destinoGlosas), { recursive: true });
  await writeFile(destinoGlosas, JSON.stringify({
    par: `${lang}-${nativo}`, praticado: lang, nativo, versao: 1, trilhaVersao: 2,
    fonte: 'Wikidata Lexemes (CC0), pares por P5137; Wikcionário via Wiktextract (CC BY-SA)',
    cobertura: { palavras: comGlosa, doWikidata, doWikcionario },
    glosas: glosasDaTrilha, frases: traducaoDaFrase,
  }) + '\n');
  console.log(`escrito ${destino}`);
  console.log(`escrito ${destinoGlosas}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gerar.mjs')) {
  principal(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
