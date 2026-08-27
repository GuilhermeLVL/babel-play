import type { AppMetrics } from '../data/api';
import { xpDeEventos, seedsGanhasDeEventos, posicaoNoNivel, PESOS_XP, PESOS_SEEDS } from '@core';

/**
 * PROGRESSO DERIVADO — a camada de gamificação, e nada além disso.
 *
 * A versão anterior do Hub exibia "Level 4 · 340/500 XP" e "+50 XP · 20 Seeds" como TEXTO FIXO:
 * números idênticos para quem nunca abriu o app e para quem estuda há meses. Isso quebra a regra
 * mais dura deste projeto — a tela não inventa o que o servidor não sabe.
 *
 * Aqui não há armazenamento novo, nem contador paralelo. XP, nível e Seeds são uma FUNÇÃO PURA das
 * métricas que `/api/metrics/profile` já calcula (ver server/db/repositories/metrics.ts). Trocar a
 * fórmula muda a apresentação; nunca o dado. E sem métrica carregada, `available: false` — a UI
 * mostra carregamento em vez de um número plausível.
 */

/**
 * OS PESOS E A CURVA MORAM NO CORE (`@core/learning/xp`).
 *
 * Estavam aqui, e enquanto o único leitor era a tela isso bastava. O servidor passou a precisar
 * deles para reconstruir a curva de XP ao longo do tempo, e uma segunda cópia divergiria na
 * primeira mudança de fórmula: o gráfico contaria uma história e o distintivo contaria outra,
 * sobre a mesma pessoa.
 *
 * A SUPERFÍCIE PÚBLICA DESTE ARQUIVO NÃO MUDOU — `deriveProgress`, `DerivedProgress`,
 * `EMPTY_PROGRESS` e `compactNumber` continuam iguais. Hub, App, ShellBits e Play são todos
 * jusante disto e não sabem que a conta se mudou de casa.
 */

export interface Mission {
  id: 'capture' | 'practice' | 'vocabulary';
  /** View de destino — o mesmo `navigateTo` do App. */
  view: string;
  /** Quantos itens ainda esperam por você. 0 = nada pendente. */
  pending: number;
  /** `true` quando não há nada pendente NESTA frente. */
  done: boolean;
  /** Recompensa da ação, em XP e Seeds, segundo os pesos acima. */
  rewardXp: number;
  rewardSeeds: number;
  /** O que a recompensa remunera. Sem isto, "+2 XP" no card não diz por qual esforço. */
  rewardUnit: string;
}

export interface DerivedProgress {
  /** `false` enquanto as métricas não chegaram. A UI mostra esqueleto, não número. */
  available: boolean;
  xp: number;
  level: number;
  /** XP acumulado dentro do nível atual e o total necessário para o próximo. */
  xpIntoLevel: number;
  xpForLevel: number;
  levelPct: number;
  /** SALDO: ganhas − gastas, com piso em zero. É o número que se pode gastar. */
  seeds: number;
  /** Só o que foi ganho. A tela usa para explicar um saldo que encolheu por compra. */
  seedsGanhas: number;
  streakDays: number;
  /** `true` quando houve ao menos uma revisão hoje (é o que streakDays > 0 significa). */
  practicedToday: boolean;
  missions: Mission[];
}

export const EMPTY_PROGRESS: DerivedProgress = {
  available: false,
  xp: 0,
  level: 1,
  xpIntoLevel: 0,
  xpForLevel: 100,
  levelPct: 0,
  seeds: 0,
  seedsGanhas: 0,
  streakDays: 0,
  practicedToday: false,
  missions: [
    { id: 'capture', view: 'capture', pending: 0, done: false, rewardXp: PESOS_XP.sessao, rewardSeeds: 0, rewardUnit: 'por gravação' },
    { id: 'practice', view: 'study', pending: 0, done: false, rewardXp: PESOS_XP.revisao, rewardSeeds: PESOS_SEEDS.revisaoCerta, rewardUnit: 'por revisão' },
    { id: 'vocabulary', view: 'metrics', pending: 0, done: false, rewardXp: PESOS_XP.palavraCapturada, rewardSeeds: PESOS_SEEDS.palavraCapturada, rewardUnit: 'por palavra' }
  ]
};

export function deriveProgress(metrics: AppMetrics | null | undefined): DerivedProgress {
  if (!metrics) return EMPTY_PROGRESS;

  const eventos = {
    sessoes: metrics.sessions,
    palavrasCapturadas: metrics.wordsCaptured,
    revisoes: metrics.reviews,
    revisoesCertas: metrics.correctReviews,
    itensDeJogo: metrics.drillItems ?? 0,
    itensDeJogoCertos: metrics.drillCorrect ?? 0,
  };
  const xp = xpDeEventos(eventos);

  /* GANHAS: só cresce. É a metade de cima do saldo — a de baixo (`seedsGastas`) vem do servidor,
     de uma tabela de gastos, porque gasto é evento e não pode ser recalculado a partir de métrica. */
  const seedsGanhas = seedsGanhasDeEventos(eventos);
  /* Piso em zero: um gasto gravado antes de a fórmula mudar poderia, em tese, passar do ganho.
     Saldo negativo na tela seria pior do que a perda de precisão de mostrar 0. */
  const seeds = Math.max(0, seedsGanhas - (metrics.seedsGastas ?? 0));

  const { level, xpForLevel, xpIntoLevel, levelPct } = posicaoNoNivel(xp);

  // As três missões são as três frentes reais do app, e o "pendente" de cada uma é um número
  // que o servidor mediu — não uma meta inventada.
  const missions: Mission[] = [
    {
      id: 'capture',
      view: 'capture',
      // Sem nenhuma sessão gravada, capturar é literalmente o que falta fazer.
      pending: metrics.sessions === 0 ? 1 : 0,
      done: metrics.sessions > 0,
      rewardXp: PESOS_XP.sessao,
      /* ERA 20, E ERA MENTIRA. Nenhuma regra de ganho dá seeds por gravar: `seedsGanhasDeEventos`
         só conta palavra capturada (1) e revisão certa (4). O "+20 Seeds" era um número solto que
         prometia uma recompensa que o sistema nunca creditou. As seeds de uma gravação vêm das
         PALAVRAS que ela produz, e essa é a missão de vocabulário, aqui a recompensa é o XP. */
      rewardSeeds: 0,
      rewardUnit: 'por gravação'
    },
    {
      id: 'practice',
      view: 'study',
      pending: metrics.dueToday,
      done: metrics.dueToday === 0,
      rewardXp: PESOS_XP.revisao + PESOS_XP.revisaoCerta,
      rewardSeeds: PESOS_SEEDS.revisaoCerta,
      rewardUnit: 'por revisão'
    },
    {
      id: 'vocabulary',
      view: 'metrics',
      pending: metrics.newCards,
      done: metrics.newCards === 0,
      rewardXp: PESOS_XP.palavraCapturada,
      rewardSeeds: PESOS_SEEDS.palavraCapturada,
      rewardUnit: 'por palavra'
    }
  ];

  return {
    available: true,
    xp,
    level,
    xpIntoLevel,
    xpForLevel,
    levelPct,
    seeds: Math.round(seeds),
    seedsGanhas: Math.round(seedsGanhas),
    streakDays: metrics.streakDays,
    practicedToday: metrics.streakDays > 0,
    missions
  };
}

/** 1.240 → "1,2 mil". Números grandes numa pílula estreita precisam caber sem cortar. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k.toFixed(k < 10 ? 1 : 0).replace('.', ',')} mil`;
  }
  const m = value / 1_000_000;
  return `${m.toFixed(m < 10 ? 1 : 0).replace('.', ',')} mi`;
}
