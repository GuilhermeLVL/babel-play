/**
 * AS REGRAS DE CADA JOGO, POR PERFIL E POR NÍVEL — num lugar só.
 *
 * Antes cada jogo guardava as suas constantes (segundos, vidas, quantas ajudas) dentro do próprio
 * componente, por perfil de idade. Isso servia enquanto a regra era uma só. Com os NÍVEIS (Fácil,
 * Médio, Difícil) a mesma regra passa a ter três valores, e espalhada ninguém conseguiria ver o
 * jogo inteiro nem testar que o Médio continua igual.
 *
 * O MÉDIO É A REGRA DE SEMPRE. Os números de base desta tabela são os que estavam nos componentes;
 * no Médio nada muda, e `tests/regrasDosJogos.test.ts` trava isso.
 *
 * O QUE O NÍVEL FAZ (igual para todos os jogos, para a pessoa poder prever):
 *   - Fácil: metade a mais de tempo, uma vida a mais, uma ajuda a mais de cada tipo.
 *   - Difícil: um quarto a menos de tempo, uma vida a menos, uma ajuda a menos (nunca zero).
 *
 * O nível NÃO entra na nota de revisão: errar a palavra no Difícil e errar no Fácil dizem a mesma
 * coisa sobre a memória. Ele só muda quanto o jogo aperta.
 *
 * Sem DOM e sem React (este diretório compila sem eles): quem guarda a escolha da pessoa é
 * `src/lib/jogos/nivelDoJogo.ts`.
 */
import type { MinigameId } from './types';

export type NivelDoJogo = 'facil' | 'medio' | 'dificil';
export const NIVEIS_DO_JOGO: readonly NivelDoJogo[] = ['facil', 'medio', 'dificil'];

/** O perfil de idade da conta (o mesmo `AgeProfileType` das telas, repetido aqui para não puxar DOM). */
export type PerfilDeIdade = 'kids' | 'pro' | 'senior';
type PorPerfil = Readonly<Record<PerfilDeIdade, number>>;

interface RegrasDeBase {
  /** Segundos do relógio (por item, ou da rodada inteira no Duelo). */
  segundos?: PorPerfil;
  /** Vidas ou erros tolerados antes de perder o item ou a rodada. */
  vidas?: PorPerfil;
  /** Quanto tempo a peça fica à vista para ser decorada, em ms. */
  aVistaMs?: PorPerfil;
  /** Quantas vezes cada ajuda pode ser usada (por rodada, ou por item onde o jogo conta assim). */
  ajudas?: Readonly<Record<string, number>>;
}

/** Os números de base: exatamente os que cada componente trazia antes dos níveis. */
const BASE: Partial<Record<MinigameId, RegrasDeBase>> = {
  memory: { ajudas: { espiar: 2 } },
  wordsearch: { ajudas: { radar: 3 } },
  blitz: { segundos: { kids: 60, pro: 60, senior: 90 }, ajudas: { cortar: 2 } },
  karuta: { segundos: { kids: 12, pro: 8, senior: 14 } },
  choseong: { segundos: { kids: 18, pro: 15, senior: 22 }, ajudas: { vogal: 2 } },
  tenis: { segundos: { kids: 8, pro: 6, senior: 9 }, ajudas: { letra: 2 } },
  shiritori: { segundos: { kids: 20, pro: 15, senior: 25 } },
  taboo: { segundos: { kids: 35, pro: 30, senior: 45 } },
  koffer: { vidas: { kids: 4, pro: 3, senior: 4 }, aVistaMs: { kids: 2600, pro: 2000, senior: 3000 } },
  bao: { vidas: { kids: 4, pro: 3, senior: 4 } },
};

const FATOR_DO_TEMPO: Record<NivelDoJogo, number> = { facil: 1.5, medio: 1, dificil: 0.75 };
const PASSO_DA_CONTAGEM: Record<NivelDoJogo, number> = { facil: 1, medio: 0, dificil: -1 };

/** O jogo tem alguma regra que o nível muda? (Quem não tem não mostra o seletor.) */
export function jogoTemNiveis(jogo: MinigameId): boolean {
  return jogo in BASE;
}

/** Segundos do relógio do jogo. `null` se o jogo não tem relógio. */
export function segundosDoJogo(jogo: MinigameId, perfil: PerfilDeIdade, nivel: NivelDoJogo): number | null {
  const base = BASE[jogo]?.segundos;
  return base ? Math.round(base[perfil] * FATOR_DO_TEMPO[nivel]) : null;
}

/** Vidas (ou erros tolerados) do jogo, nunca menos que uma. `null` se o jogo não conta vidas. */
export function vidasDoJogo(jogo: MinigameId, perfil: PerfilDeIdade, nivel: NivelDoJogo): number | null {
  const base = BASE[jogo]?.vidas;
  return base ? Math.max(1, base[perfil] + PASSO_DA_CONTAGEM[nivel]) : null;
}

/** Quanto tempo a peça fica à vista para decorar, em ms. `null` se o jogo não tem essa fase. */
export function tempoAVistaDoJogo(jogo: MinigameId, perfil: PerfilDeIdade, nivel: NivelDoJogo): number | null {
  const base = BASE[jogo]?.aVistaMs;
  return base ? Math.round(base[perfil] * FATOR_DO_TEMPO[nivel]) : null;
}

/** Quantas vezes a ajuda `qual` pode ser usada, nunca menos que uma. 0 se o jogo não tem essa ajuda. */
export function ajudasDoJogo(jogo: MinigameId, qual: string, nivel: NivelDoJogo): number {
  const base = BASE[jogo]?.ajudas?.[qual];
  return base === undefined ? 0 : Math.max(1, base + PASSO_DA_CONTAGEM[nivel]);
}

/** Para a tela que explica o nível: o que muda neste jogo, em números. */
export interface ResumoDasRegras {
  segundos: number | null;
  vidas: number | null;
  ajudas: Readonly<Record<string, number>>;
}

export function resumoDasRegras(jogo: MinigameId, perfil: PerfilDeIdade, nivel: NivelDoJogo): ResumoDasRegras {
  const ajudas: Record<string, number> = {};
  for (const qual of Object.keys(BASE[jogo]?.ajudas ?? {})) ajudas[qual] = ajudasDoJogo(jogo, qual, nivel);
  return { segundos: segundosDoJogo(jogo, perfil, nivel), vidas: vidasDoJogo(jogo, perfil, nivel), ajudas };
}

/** Só para o teste que trava "o Médio é a regra de sempre". */
export const REGRAS_DE_BASE: Readonly<Partial<Record<MinigameId, RegrasDeBase>>> = BASE;
