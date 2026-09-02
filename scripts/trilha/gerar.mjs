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
import { atribuicao, frequenciaDe, frasesDe } from './fontes.mjs';
import { filtrar } from './filtrar.mjs';
import { faixas, coberturaDasFaixas, NIVEIS } from './faixas.mjs';
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

  const bruta = await frequenciaDe(lang);
  const { palavras, descartes } = filtrar(limite ? bruta.slice(0, limite) : bruta, lang);
  const porNivel = faixas(palavras);

  const comFrases = new Map();
  if (!semFrases) {
    const indice = indexar(await frasesDe(lang));
    const acumulado = new Set();
    for (const n of NIVEIS) {
      for (const chave of vocabularioDe(porNivel[n])) acumulado.add(chave);
      for (const { palavra } of porNivel[n]) {
        const frase = escolherFrase(palavra, indice, acumulado);
        if (frase) comFrases.set(palavra, frase);
      }
    }
  }

  const trilha = montarTrilha(lang, porNivel, comFrases);

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
  if (reprovados) console.log(`  ATENÇÃO: ${reprovados} entradas reprovam na régua do app`);

  const destino = path.resolve(process.cwd(), 'src/data/trilha', `${lang}.json`);
  if (seco) { console.log(`--dry-run: nada escrito (seria ${destino})`); return; }
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, JSON.stringify(trilha) + '\n');
  console.log(`escrito ${destino}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gerar.mjs')) {
  principal(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
