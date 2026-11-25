/**
 * SIMULA O MAPA FORÇA -> ETIQUETA da legenda (openspec `status-da-palavra-na-legenda`, tarefa 1.1). Offline, sem tela,
 * sem servidor, sem flag: lê um deck (JSON) ou gera um sintético com semente e compara, palavra a palavra, a etiqueta da
 * régua de hoje (3 estados, depende do relógio) com cada mapa candidato (depende só da força).
 *
 *   npx tsx scripts/etiquetas/simular-forca.ts                       # deck sintético (semente 1, 5000 cartões)
 *   npx tsx scripts/etiquetas/simular-forca.ts --deck meu.json       # [{ stability, reps, lapses, lastReview? }] (lastReview em ms)
 *   npx tsx scripts/etiquetas/simular-forca.ts --semente 7 --n 20000 --json
 *
 * Métricas por mapa: (1) % de palavras que mudam de etiqueta contra hoje, com a tabela de transição; (2) quantas
 * palavras MUDAM de etiqueta só pela passagem de 30 dias sem revisar (oscilação). Hoje a régua de retenção oscila; um
 * mapa por força dá 0 por construção (a força não lê o relógio), e a simulação confere isso recalculando a força
 * depois dos dias. Critério do design: escolher o primeiro mapa que não oscile e mude <= 15%.
 *
 * O corpus Anki de teste (`tests/fixtures/*.apkg`) NÃO traz estabilidade FSRS (só intervalo do Anki), então a simulação
 * usa o deck sintético e, para o deck do dono, um export em JSON (tarefa 1.2, [D]).
 */
import { readFileSync } from 'node:fs';

import { estadoDoCartao, fsrsStateDaLinha } from '../../src/core/learning/estadoDoCartao';
import { type Forca, forcaDoCartao } from '../../src/core/learning/forcaDoCartao';
import { type Etiqueta, etiquetaDaForca } from '../../src/core/vocabulario/etiquetas';

const DIA = 86_400_000;

export interface CartaoSimulado {
  stability: number | null;
  reps: number;
  lapses: number;
  /** Há quantos dias foi a última revisão (relativo ao "agora" da simulação). */
  diasDesdeRevisao: number;
}

/** Gerador determinístico (mulberry32). */
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Um deck plausível: ~25% sem revisão, o resto com estabilidade log-uniforme de 0,3 a 250 dias. */
export function deckSintetico(n: number, semente = 1): CartaoSimulado[] {
  const r = aleatorio(semente);
  const saida: CartaoSimulado[] = [];
  for (let i = 0; i < n; i++) {
    if (r() < 0.25) {
      saida.push({ stability: null, reps: 0, lapses: 0, diasDesdeRevisao: 0 });
      continue;
    }
    const stability = 0.3 * Math.exp(r() * Math.log(250 / 0.3));
    const reps = 1 + Math.floor(r() * 12);
    const lapses = r() < 0.2 ? Math.floor(r() * 6) : 0;
    /* Quando foi revisada: até ~1,5x a estabilidade atrás (quem está em dia e quem se atrasou). */
    const diasDesdeRevisao = r() * stability * 1.5;
    saida.push({ stability, reps, lapses, diasDesdeRevisao });
  }
  return saida;
}

export function lerDeck(arquivo: string, agora = Date.now()): CartaoSimulado[] {
  const bruto = JSON.parse(readFileSync(arquivo, 'utf8')) as Array<Record<string, number | null | undefined>>;
  return bruto.map((c) => ({
    stability: c.stability ?? c.fsrsStability ?? null,
    reps: c.reps ?? 0,
    lapses: c.lapses ?? 0,
    diasDesdeRevisao: c.lastReview ? Math.max(0, (agora - c.lastReview) / DIA) : 0,
  }));
}

/** A etiqueta de HOJE (régua de 3 estados, com relógio), `diasAMais` dias depois sem revisar. */
export function etiquetaDeHoje(c: CartaoSimulado, diasAMais = 0): Etiqueta {
  const agora = Date.now();
  const estado = estadoDoCartao(
    {
      fsrsState: fsrsStateDaLinha(c),
      fsrsStability: c.stability,
      lastReview: agora - (c.diasDesdeRevisao + diasAMais) * DIA,
    },
    agora,
  );
  return estado === 'nova' ? 'salva' : estado === 'aprendida' ? 'aprendendo' : 'dominada';
}

export type Mapa = (f: Forca) => Etiqueta;

/** Os candidatos da triagem. O primeiro é o que o código usa (`etiquetaDaForca`). */
export const MAPAS: Record<string, Mapa> = {
  '1 / 2-3 / 4 (escolhido)': etiquetaDaForca,
  '1-2 / 3 / 4': (f) => (f <= 2 ? 'salva' : f === 3 ? 'aprendendo' : 'dominada'),
  '1 / 2 / 3-4': (f) => (f === 1 ? 'salva' : f === 2 ? 'aprendendo' : 'dominada'),
};

export interface RelatorioDoMapa {
  mapa: string;
  total: number;
  mudam: number;
  porCentoMudam: number;
  oscilamHoje: number;
  oscilamMapa: number;
  transicao: Record<string, number>;
}

const forcaDe = (c: CartaoSimulado): Forca => forcaDoCartao({ stability: c.stability, reps: c.reps, lapses: c.lapses });

export function simular(deck: readonly CartaoSimulado[], dias = 30): RelatorioDoMapa[] {
  const oscilamHoje = deck.filter((c) => etiquetaDeHoje(c) !== etiquetaDeHoje(c, dias)).length;
  return Object.entries(MAPAS).map(([mapa, f]) => {
    const transicao: Record<string, number> = {};
    let mudam = 0;
    let oscilam = 0;
    for (const c of deck) {
      const antiga = etiquetaDeHoje(c);
      const nova = f(forcaDe(c));
      if (antiga !== nova) mudam++;
      const k = `${antiga} -> ${nova}`;
      transicao[k] = (transicao[k] ?? 0) + 1;
      /* 30 dias sem revisar: nada na linha do cartão muda, a força é recalculada e a etiqueta tem de ser a mesma. */
      if (f(forcaDe({ ...c, diasDesdeRevisao: c.diasDesdeRevisao + dias })) !== nova) oscilam++;
    }
    return {
      mapa,
      total: deck.length,
      mudam,
      porCentoMudam: Math.round((1000 * mudam) / Math.max(1, deck.length)) / 10,
      oscilamHoje,
      oscilamMapa: oscilam,
      transicao,
    };
  });
}

function principal() {
  const a = process.argv.slice(2);
  const valor = (n: string) => {
    const i = a.indexOf(n);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const arquivo = valor('--deck');
  const deck = arquivo
    ? lerDeck(arquivo)
    : deckSintetico(Number(valor('--n') ?? 5000), Number(valor('--semente') ?? 1));
  const rel = simular(deck);
  if (a.includes('--json')) return console.log(JSON.stringify(rel, null, 2));
  console.log(`Cartões: ${deck.length}. Oscilam em 30 dias sem revisar na régua de HOJE: ${rel[0].oscilamHoje}`);
  for (const r of rel) {
    console.log(`\nMapa ${r.mapa}: mudam ${r.mudam} (${r.porCentoMudam}%), oscilam em 30 dias: ${r.oscilamMapa}`);
    for (const [k, n] of Object.entries(r.transicao).sort()) console.log(`  ${k}: ${n}`);
  }
}

if (process.argv[1]?.endsWith('simular-forca.ts')) principal();
