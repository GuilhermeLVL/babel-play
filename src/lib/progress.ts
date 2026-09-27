import { economiaDeMetricas, posicaoNoNivel } from '@core';

import type { AppMetrics } from '../data/api';
import { estudouHoje } from './ofensiva';

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
  /** `true` quando houve revisão ou rodada DATADA de hoje (`lib/ofensiva`). Não é `streakDays > 0`:
      a ofensiva conta presença, e com isso o aviso "ofensiva em risco" nunca podia sair. */
  practicedToday: boolean;
  /**
   * Palavras novas no caderno esperando a primeira revisão — a linha do pilar Vocabulário no Início.
   * As "missões" que moravam aqui (capturar / praticar / vocabulário) SAÍRAM (recompensas v2, onda
   * 5): eram as três frentes do app, não missões. As missões do dia de verdade vêm do servidor
   * (`GET /api/metrics/missoes`, `src/core/missoes.ts`) e aparecem no cartão "Missões do dia".
   */
  palavrasNovas: number;
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
  palavrasNovas: 0,
};

export function deriveProgress(metrics: AppMetrics | null | undefined): DerivedProgress {
  if (!metrics) return EMPTY_PROGRESS;

  /* A DERIVAÇÃO É DO CORE (`economiaDeMetricas`), e não uma cópia local dos treze campos.
     Ela era escrita aqui e outra vez em `economiaDoUsuario`, no servidor: a tela e a cobrança
     somavam os mesmos eventos por duas listas diferentes, que concordavam só enquanto ninguém
     acrescentasse um evento novo.

     Os campos da economia v2 são OPCIONAIS no contrato e entram como zero quando faltam — o
     número na tela nunca vira NaN. */
  const { xp, ganhas: seedsGanhas, saldo: seeds } = economiaDeMetricas(metrics);

  const { level, xpForLevel, xpIntoLevel, levelPct } = posicaoNoNivel(xp);

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
    practicedToday: estudouHoje(metrics.revisoesRecentes),
    palavrasNovas: metrics.newCards,
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
