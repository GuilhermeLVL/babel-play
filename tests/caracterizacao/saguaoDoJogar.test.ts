/**
 * CARACTERIZAÇÃO DAS CONTAS DO SAGUÃO DO JOGAR — a saída de ANTES, gravada, contra a de agora.
 *
 * POR QUE ESTE ARQUIVO EXISTE. As contas do saguão (triagem, gate dos jogos, pool, itens, rodada
 * montada, sugestão) ganharam memória fora do componente para não serem refeitas a cada entrada na
 * tela (auditoria de desempenho de 10/10/2026, gargalos 2 e 8). Memória só vale se a resposta for a
 * MESMA: o ouro ao lado (`saguaoDoJogar.ouro.json`) foi gravado com o código de antes da mudança
 * (commit d4feb9bf) e cada caso aqui tem de dar o mesmo resumo, byte a byte.
 *
 * O QUE ENTRA: a trilha real de 13 idiomas (latinos, cirílico, árabe, hebraico, híndi, chinês,
 * japonês, coreano), um baralho de banco em inglês com vencidos, sem tradução, com frase e com
 * pista repetida, um baralho de ruído (o da semeadura de carga) e baralhos pequenos, onde o gate
 * fica na fronteira do mínimo de cada jogo.
 *
 * O SORTEIO. `buildItems` embaralha com `Math.random`. Aqui ele é trocado por um gerador com
 * semente, reiniciado a cada conta: a mesma sequência de sorteios dá a mesma saída, e uma mudança
 * que consuma um sorteio a mais ou a menos aparece como diferença.
 *
 * Cada caso roda DUAS vezes seguidas: a segunda passa pelas memórias já cheias, e tem de dar o
 * mesmo que a primeira (e que o ouro).
 *
 * Regravar (só com motivo, e dizendo no commit): `GRAVAR_OURO=1 npx vitest run tests/caracterizacao/saguaoDoJogar.test.ts`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CefrLevel } from '../../src/core/learning/cefrWordlist';
import { pistasDaTriagem } from '../../src/core/learning/quality';
import { cartoesDaTrilha, type DadoTrilha, frasesDaTrilha } from '../../src/core/learning/trilha';
import { estadoDeCadaJogo, poolDosJogosDePalavra } from '../../src/core/minigames/estadoDosJogos';
import { buildItems, canPlay } from '../../src/core/minigames/itemSource';
import { agruparJogos } from '../../src/core/minigames/painelDaPratica';
import { type EntradaDaRodada, type FalaDaRodada, montarRodada } from '../../src/core/minigames/rodada';
import { cartoesDaFonte, frasesDoAcervo, idiomasDisponiveis } from '../../src/core/minigames/source';
import { type MinigameId, MINIGAMES } from '../../src/core/minigames/types';
import { chaveDaPalavra } from '../../src/core/texto/palavra';
import type { VocabCard } from '../../src/types';

const RAIZ = path.resolve(__dirname, '..', '..');
const OURO = path.join(__dirname, 'saguaoDoJogar.ouro.json');
const AGORA = new Date('2026-03-15T12:00:00Z').getTime();
const DIA = 86_400_000;
const JOGOS = Object.keys(MINIGAMES) as MinigameId[];
const DE_PALAVRA = JOGOS.filter((id) => MINIGAMES[id].modalidade === 'palavra');

/** mulberry32: o mesmo gerador da semeadura de carga. */
function gerador(semente: number): () => number {
  let s = semente;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** JSON estável: Map e Set viram listas, função some, `undefined` some. */
function estavel(v: unknown): unknown {
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [k, estavel(x)]);
  if (v instanceof Set) return [...v.values()].map(estavel);
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'function' || x === undefined) continue;
      o[k] = estavel(x);
    }
    return o;
  }
  return v;
}
const resumo = (v: unknown) => createHash('sha256').update(JSON.stringify(estavel(v))).digest('hex').slice(0, 20);

const ler = <T>(relativo: string): T => JSON.parse(readFileSync(path.join(RAIZ, relativo), 'utf8')) as T;

/** A trilha de um idioma como o app a entrega (`data/trilha/carregar.ts`: v1 embutida, v2 unida às glosas). */
function trilhaDe(lang: string): DadoTrilha {
  const cru = ler<{ versao: unknown; lang: string; niveis: Record<string, string[][]> } & Record<string, unknown>>(
    `public/trilha/${lang}.json`,
  );
  if (cru.versao !== 2) return cru as unknown as DadoTrilha;
  const glosas = ler<{ glosas?: Record<string, string>; frases?: Record<string, string> }>(
    `public/glosas/${lang}-pt.json`,
  );
  const niveis: DadoTrilha['niveis'] = {};
  for (const [nivel, entradas] of Object.entries(cru.niveis)) {
    niveis[nivel as CefrLevel] = (entradas ?? []).map(
      ([palavra, frase]) =>
        [palavra, glosas.glosas?.[palavra] ?? '', frase, frase ? glosas.frases?.[frase] : undefined] as [
          string,
          string,
          string?,
          string?,
        ],
    );
  }
  return { ...(cru as unknown as DadoTrilha), versao: String(cru.versao), niveis };
}

const semSorteio = <T>(xs: T[]): T[] => [...xs];
const cartoesDe = (dado: DadoTrilha, niveis: CefrLevel[]) =>
  niveis.flatMap((n) => cartoesDaTrilha(dado, n, { shuffle: semSorteio })) as unknown as VocabCard[];

/** Um baralho de banco em inglês: ids, vencidos, novos, sem tradução, baralho importado, pista repetida. */
function baralhoDeBanco(quantos: number): VocabCard[] {
  const rnd = gerador(7);
  const en = trilhaDe('en');
  const base = cartoesDe(en, ['A1', 'A2', 'B1']).slice(0, quantos);
  return base.map((c, i) => {
    const sorte = rnd();
    const vencido = sorte < 0.25;
    const futuro = sorte >= 0.25 && sorte < 0.55;
    return {
      ...c,
      id: `c-${i}`,
      daTrilha: false,
      sourceSessionId: i % 5 === 0 ? 's-1' : undefined,
      daAnki: i % 7 === 0,
      translation: i % 11 === 0 ? '' : i % 13 === 0 ? base[(i + 1) % base.length].translation : c.translation,
      sentence: i % 4 === 0 ? undefined : c.sentence,
      fsrsState: vencido || futuro ? 'Review' : 'New',
      fsrsDueAt: vencido
        ? new Date(AGORA - (1 + Math.floor(rnd() * 20)) * DIA).toISOString()
        : futuro
          ? new Date(AGORA + (1 + Math.floor(rnd() * 20)) * DIA).toISOString()
          : '',
      dueAtMs: vencido ? AGORA - DIA : futuro ? AGORA + DIA : null,
      difficultyScore: Math.round(rnd() * 100) / 100,
      inDeck: i % 17 !== 0,
    } as unknown as VocabCard;
  });
}

/** O baralho da semeadura de carga (`scripts/perf/escala/semear.mjs`): sílabas com número no fim. */
function baralhoDeRuido(quantos: number): VocabCard[] {
  const rnd = gerador(11);
  const SIL = ['ka', 'lo', 'mer', 'ti', 'sun', 'da', 're', 'po', 'vin', 'ghe', 'the', 'and', 'ing', 'wor', 'ld'];
  const palavra = () => Array.from({ length: 2 + Math.floor(rnd() * 2) }, () => SIL[Math.floor(rnd() * SIL.length)]).join('');
  const texto = (n: number) => {
    let t = '';
    while (t.length < n) t += (t ? ' ' : '') + palavra();
    return t.slice(0, n);
  };
  return Array.from({ length: quantos }, (_, i) => ({
    id: `r-${i}`,
    word: `${palavra()}${i}`,
    translation: texto(44),
    sentence: texto(64),
    srcLang: 'en',
    tgtLang: 'pt',
    inDeck: true,
    fsrsDueAt: i % 3 ? '' : new Date(AGORA - DIA).toISOString(),
    leitnerDueAt: '',
  })) as unknown as VocabCard[];
}

interface Caso {
  nome: string;
  lang: string;
  fonteId: 'baralho' | 'trilha';
  /** O acervo cru (o que `fetchDeck` devolveria) ou os cartões embutidos da trilha. */
  cartas: () => VocabCard[];
  frasesDaTrilha?: () => FalaDaRodada[];
}

const LATINOS = ['es', 'fr', 'de', 'it', 'nl', 'pl', 'sv', 'tr'];
const OUTROS = ['ru', 'ar', 'he', 'hi', 'zh', 'ja', 'ko'];
const CASOS: Caso[] = [
  {
    nome: 'trilha en, todos os níveis',
    lang: 'en',
    fonteId: 'trilha',
    cartas: () => cartoesDe(trilhaDe('en'), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
    frasesDaTrilha: () =>
      (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CefrLevel[]).flatMap(
        (n) => frasesDaTrilha(trilhaDe('en'), n, { shuffle: semSorteio }) as unknown as FalaDaRodada[],
      ),
  },
  {
    nome: 'trilha en, A1',
    lang: 'en',
    fonteId: 'trilha',
    cartas: () => cartoesDe(trilhaDe('en'), ['A1']),
    frasesDaTrilha: () => frasesDaTrilha(trilhaDe('en'), 'A1', { shuffle: semSorteio }) as unknown as FalaDaRodada[],
  },
  ...[...LATINOS, ...OUTROS].map(
    (lang): Caso => ({
      nome: `trilha ${lang}, A1 e A2`,
      lang,
      fonteId: 'trilha',
      cartas: () => cartoesDe(trilhaDe(lang), ['A1', 'A2']),
      frasesDaTrilha: () =>
        (['A1', 'A2'] as CefrLevel[]).flatMap(
          (n) => frasesDaTrilha(trilhaDe(lang), n, { shuffle: semSorteio }) as unknown as FalaDaRodada[],
        ),
    }),
  ),
  { nome: 'banco en, 900 cartões', lang: 'en', fonteId: 'baralho', cartas: () => baralhoDeBanco(900) },
  { nome: 'banco en, 9 cartões', lang: 'en', fonteId: 'baralho', cartas: () => baralhoDeBanco(60).slice(20, 29) },
  { nome: 'banco en, 5 cartões', lang: 'en', fonteId: 'baralho', cartas: () => baralhoDeBanco(60).slice(1, 6) },
  { nome: 'banco en, 3 cartões', lang: 'en', fonteId: 'baralho', cartas: () => baralhoDeBanco(60).slice(1, 4) },
  { nome: 'banco vazio', lang: 'en', fonteId: 'baralho', cartas: () => [] },
  { nome: 'ruído da semeadura, 400 cartões', lang: 'en', fonteId: 'baralho', cartas: () => baralhoDeRuido(400) },
  {
    nome: 'banco misto en e es',
    lang: 'es',
    fonteId: 'baralho',
    cartas: () => [
      ...baralhoDeBanco(120),
      ...cartoesDe(trilhaDe('es'), ['A1']).slice(0, 150).map((c, i) => ({ ...c, id: `e-${i}`, daTrilha: false })),
    ],
  },
];

/** Todas as contas de um caso, cada uma com o sorteio reiniciado. */
function contasDoCaso(caso: Caso): Record<string, string> {
  let semente = 1;
  const comSorteio = <T>(f: () => T): T => {
    const g = gerador(semente++);
    const espia = vi.spyOn(Math, 'random').mockImplementation(g);
    try {
      return f();
    } finally {
      espia.mockRestore();
    }
  };
  const cru = caso.cartas();
  const saida: Record<string, string> = {};

  /* A triagem: no baralho, o recorte da fonte; na trilha, os embutidos entram como estão (`jogaveis`). */
  const triagem = cartoesDaFonte(cru, { id: 'baralho', lang: caso.lang });
  const jogaveis = caso.fonteId === 'trilha' ? cru : triagem.usaveis;
  saida.triagem = resumo({
    usaveis: triagem.usaveis.map((c) => c.id || c.word),
    fora: triagem.fora.map((f) => [f.card.id || f.card.word, f.motivo]),
    outroIdioma: triagem.outroIdioma,
  });
  saida.pistas = resumo(
    (() => {
      const p = pistasDaTriagem({ ...triagem, usaveis: jogaveis });
      return { com: p.comTraducao.length, so: p.soComFrase.length };
    })(),
  );
  saida.idiomas = resumo(idiomasDisponiveis(cru));

  const doAcervo = frasesDoAcervo(jogaveis, caso.lang) as unknown as FalaDaRodada[];
  const daTrilha = caso.frasesDaTrilha?.() ?? [];
  saida.frasesDoAcervo = resumo(doAcervo);

  for (const temVoz of [true, false]) {
    const estados = comSorteio(() =>
      estadoDeCadaJogo({
        cartas: jogaveis,
        frases: doAcervo as never,
        frasesDaTrilha: caso.fonteId === 'trilha' ? (daTrilha as never) : undefined,
        temAudio: false,
        audioPronto: false,
        temVoz,
        fonteId: caso.fonteId,
        lang: caso.lang,
      }),
    );
    saida[`estados, voz ${temVoz}`] = resumo(estados);
    /* A sugestão do dia sai daqui: o primeiro dos prontos, na ordem de rendimento. */
    saida[`grupos, voz ${temVoz}`] = resumo(agruparJogos(JOGOS.map((id) => estados[id])));
  }
  saida.pool = resumo(poolDosJogosDePalavra(jogaveis));

  for (const id of DE_PALAVRA) {
    saida[`itens ${id}`] = resumo(comSorteio(() => buildItems(id, jogaveis, { now: AGORA })));
    saida[`cabe ${id}`] = resumo(comSorteio(() => canPlay(id, jogaveis, { now: AGORA })));
    saida[`cabe sem requisito ${id}`] = resumo(
      comSorteio(() => canPlay(id, jogaveis, { now: AGORA, ignorarRequisitos: true })),
    );
  }

  const entrada = (jogo: MinigameId): EntradaDaRodada => ({
    jogo,
    agora: AGORA,
    jogaveis,
    fonte: { id: caso.fonteId, lang: caso.lang },
    etapaDaTrilha: null,
    memoria: new Map(),
    estrategia: 'equilibrado',
    faixas: [],
    cortes: null,
    decisaoAuto: () => ({ faixa: 'medio' }),
    vistasRecentes: new Set(),
    frasesGravadas: [],
    frasesDaTrilha: daTrilha,
    frasesDoAcervo: doAcervo,
    comTrilha: caso.fonteId === 'trilha',
    temVoz: true,
    temAudio: false,
    porPalavra: new Map(jogaveis.map((c) => [c.word.toLowerCase(), c])),
    origemDaPalavra: () => caso.fonteId,
  });
  for (const jogo of JOGOS) saida[`rodada ${jogo}`] = resumo(comSorteio(() => montarRodada(entrada(jogo))));

  saida.chaves = resumo(jogaveis.slice(0, 400).map((c) => [chaveDaPalavra(c.word), chaveDaPalavra(c.translation)]));
  return saida;
}

describe('as contas do saguão do Jogar dão o mesmo que antes (ouro gravado em d4feb9bf)', () => {
  const gravando = process.env.GRAVAR_OURO === '1';
  const ouro: Record<string, Record<string, string>> = existsSync(OURO)
    ? (JSON.parse(readFileSync(OURO, 'utf8')) as Record<string, Record<string, string>>)
    : {};
  const novo: Record<string, Record<string, string>> = {};

  beforeEach(() => vi.useFakeTimers({ now: AGORA, toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  for (const caso of CASOS) {
    it(caso.nome, () => {
      const primeira = contasDoCaso(caso);
      /* A segunda passada encontra as memórias cheias: tem de dar o mesmo. */
      const segunda = contasDoCaso(caso);
      expect(segunda).toEqual(primeira);
      if (gravando) {
        novo[caso.nome] = primeira;
        return;
      }
      expect(ouro[caso.nome], 'caso sem ouro gravado').toBeDefined();
      expect(primeira).toEqual(ouro[caso.nome]);
    });
  }

  it('o ouro cobre todos os casos', () => {
    if (gravando) {
      writeFileSync(OURO, JSON.stringify(novo, null, 1) + '\n');
      return;
    }
    expect(Object.keys(ouro).sort()).toEqual(CASOS.map((c) => c.nome).sort());
  });
});
