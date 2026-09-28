#!/usr/bin/env -S npx tsx
/**
 * Gera `public/trilha/<lang>.json` no schema v2 (design.md, Decisão 1). O dado é SERVIDO, não
 * embutido: com dezesseis idiomas, embutir custava 6,4 MB de build sem que ninguém baixasse mais.
 *
 *   npx tsx scripts/trilha/gerar.mjs es
 *   npx tsx scripts/trilha/gerar.mjs es --dry-run --limite=5000 --sem-frases
 *   npx tsx scripts/trilha/gerar.mjs es --dicionario=10000   # glosas p/ o toque em palavra (M1)
 *   npx tsx scripts/trilha/gerar.mjs es --so-glosas --dicionario=10000 --extrato=2026-09-25
 *
 * `--dicionario=N` amplia o arquivo de GLOSAS (não a trilha) para os N lemas mais frequentes com
 * glosa, e grava `formas` (forma → lema) para o app achar `hablo` → `hablar` sem regra. Precisa do
 * dump do Wikcionário do nativo em `.cache/trilha/<nativo>-extract.jsonl.gz` (kaikki.org, 35 MB
 * comprimido para pt; o script NÃO baixa) e baixa sozinho o resto (SPARQL do Wikidata,
 * FrequencyWords). Sem o dump, só o Wikidata responde — cobertura bem menor (6% em es-pt), e o
 * relatório diz.
 *
 * `--so-glosas` regera SÓ `public/glosas/<lang>-<nativo>.json`, contra a trilha JÁ PUBLICADA: lê
 * `public/trilha/<lang>.json` sem reescrevê-la e conserva as `frases` traduzidas do arquivo atual.
 * É o caminho para ampliar o dicionário sem os dumps do Tatoeba e sem mexer na trilha — a
 * lematização do Wikidata muda entre consultas, e regerar a trilha junto a reordenaria. Recusa
 * trilha v1 (`en`), cujo formato traz a tradução dentro da própria trilha. `--extrato=AAAA-MM-DD`
 * registra no `fonte` a data do extrato do kaikki.org usado.
 *
 * Roda sob **tsx** porque o pipeline importa `src/core/learning/quality.ts` — a régua real do
 * app. É o único módulo com efeito colateral: os outros são funções puras.
 *
 * A trilha sai MONOLÍNGUE (palavra + frase). Glosas são um arquivo à parte, por par de idiomas.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atribuicao, frequenciaDe, frasesDe, traducoesDasFrases } from './fontes.mjs';
import { filtrar } from './filtrar.mjs';
import { faixas, coberturaDasFaixas, NIVEIS } from './faixas.mjs';
import { formasPorLema, glosas as glosasDoIdioma, lematizar, montarDicionario } from './lexemes.mjs';
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

/** O arquivo do par. Mesmo formato nos dois caminhos (trilha inteira ou `--so-glosas`). */
export function arquivoDeGlosas({ lang, nativo, cobertura, glosas, frases, formas, extrato, geradoEm }) {
  return {
    par: `${lang}-${nativo}`, praticado: lang, nativo, versao: 1, trilhaVersao: 2,
    fonte: 'Wikidata Lexemes (CC0), pares por P5137; Wikcionário via Wiktextract/kaikki.org (CC BY-SA)'
      + (extrato ? `, extrato de ${extrato}` : ''),
    ...(geradoEm ? { geradoEm } : {}),
    cobertura, glosas, frases, ...(formas ? { formas } : {}),
  };
}

/** Glosas das palavras da trilha + o dicionário do toque, que SOMA e nunca tira. */
function glosasDoPacote({ trilha, glosas, tamanhoDoDicionario, bruta, mapaDeLemas, lang, nativo }) {
  const glosasDaTrilha = {};
  let comGlosa = 0;
  for (const n of NIVEIS) {
    for (const [palavra] of trilha.niveis[n] ?? []) {
      const g = glosas.get(String(palavra).toLowerCase());
      if (g) { glosasDaTrilha[palavra] = g; comGlosa++; }
    }
  }
  let formas;
  if (tamanhoDoDicionario) {
    const dic = montarDicionario({
      bruta, mapaDeLemas, glosas, limite: tamanhoDoDicionario, lang, nativo,
    });
    for (const [k, v] of Object.entries(dic.glosas)) if (!(k in glosasDaTrilha)) glosasDaTrilha[k] = v;
    formas = dic.formas;
    console.log(`  dicionário do toque: ${Object.keys(dic.glosas).length} lemas com glosa`
      + ` (pedido ${tamanhoDoDicionario}) · ${Object.keys(formas).length} formas → lema`);
  }
  return { glosasDaTrilha, comGlosa, formas };
}

/** `--so-glosas`: a trilha publicada fica intocada; só o arquivo do par é reescrito. */
async function soGlosas({ lang, nativo, seco, semLema, tamanhoDoDicionario, extrato }) {
  const origemDaTrilha = path.resolve(process.cwd(), 'public/trilha', `${lang}.json`);
  const destinoGlosas = path.resolve(process.cwd(), 'public/glosas', `${lang}-${nativo}.json`);
  const trilha = JSON.parse(await readFile(origemDaTrilha, 'utf8'));
  if (Number(trilha.versao) !== 2) {
    throw new Error(`${origemDaTrilha} é trilha v${trilha.versao}: a glosa mora nela, --so-glosas não se aplica`);
  }
  let frases = {};
  try { frases = JSON.parse(await readFile(destinoGlosas, 'utf8')).frases ?? {}; } catch { /* par novo */ }

  const bruta = await frequenciaDe(lang);
  const mapaDeLemas = semLema ? new Map() : await formasPorLema(lang);
  const { mapa: glosas, doWikidata, doWikcionario } = await glosasDoIdioma(lang, nativo);
  const { glosasDaTrilha, comGlosa, formas } = glosasDoPacote({
    trilha, glosas, tamanhoDoDicionario, bruta, mapaDeLemas, lang, nativo,
  });
  const total = NIVEIS.reduce((s, n) => s + (trilha.niveis[n]?.length ?? 0), 0);
  console.log(`  glosas ${lang}-${nativo} na trilha publicada: ${comGlosa} de ${total} (${pct(comGlosa / Math.max(1, total))})`
    + ` · fontes: wikidata ${doWikidata}, wikcionario ${doWikcionario} · frases conservadas: ${Object.keys(frases).length}`);
  if (seco) { console.log(`--dry-run: nada escrito (seria ${destinoGlosas})`); return; }
  await mkdir(path.dirname(destinoGlosas), { recursive: true });
  await writeFile(destinoGlosas, JSON.stringify(arquivoDeGlosas({
    lang, nativo, extrato, geradoEm: new Date().toISOString().slice(0, 10),
    cobertura: { palavras: comGlosa, doWikidata, doWikcionario },
    glosas: glosasDaTrilha, frases, formas,
  })) + '\n');
  console.log(`escrito ${destinoGlosas} (trilha intocada)`);
}

async function principal(argv) {
  const lang = argv.find((a) => !a.startsWith('-'));
  if (!lang) throw new Error('uso: npx tsx scripts/trilha/gerar.mjs <lang> [--dry-run]');
  const seco = argv.includes('--dry-run');
  const semFrases = argv.includes('--sem-frases');
  const limite = Number((argv.find((a) => a.startsWith('--limite=')) ?? '').split('=')[1]) || 0;

  const nativo = (argv.find((a) => a.startsWith('--nativo=')) ?? '--nativo=pt').split('=')[1];
  const semLema = argv.includes('--sem-lema');
  const tamanhoDoDicionario = Number((argv.find((a) => a.startsWith('--dicionario=')) ?? '').split('=')[1]) || 0;
  const extrato = (argv.find((a) => a.startsWith('--extrato=')) ?? '').split('=')[1] || '';
  if (argv.includes('--so-glosas')) {
    return soGlosas({ lang, nativo, seco, semLema, tamanhoDoDicionario, extrato });
  }

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
     tradução pertence a "praticado × nativo". Sem isto os jogos de par não abrem. O dicionário
     do toque SOMA ao que a trilha já usa, nunca tira — os jogos seguem lendo `glosas[palavra]`. */
  const { glosasDaTrilha, comGlosa, formas } = glosasDoPacote({
    trilha, glosas, tamanhoDoDicionario, bruta, mapaDeLemas, lang, nativo,
  });

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

  const destino = path.resolve(process.cwd(), 'public/trilha', `${lang}.json`);
  const destinoGlosas = path.resolve(process.cwd(), 'public/glosas', `${lang}-${nativo}.json`);
  if (seco) { console.log(`--dry-run: nada escrito (seriam ${destino} e ${destinoGlosas})`); return; }
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, JSON.stringify(trilha) + '\n');
  await mkdir(path.dirname(destinoGlosas), { recursive: true });
  await writeFile(destinoGlosas, JSON.stringify(arquivoDeGlosas({
    lang, nativo, extrato, geradoEm: new Date().toISOString().slice(0, 10),
    cobertura: { palavras: comGlosa, doWikidata, doWikcionario },
    glosas: glosasDaTrilha, frases: traducaoDaFrase, formas,
  })) + '\n');
  console.log(`escrito ${destino}`);
  console.log(`escrito ${destinoGlosas}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gerar.mjs')) {
  principal(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
