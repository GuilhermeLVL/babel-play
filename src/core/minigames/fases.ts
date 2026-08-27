/**
 * FASES — a memória das rodadas jogadas, lida como um mapa de fases de jogo de celular.
 *
 * O pedido do dono (2026-08-27): a antessala escondia o PROGRESSO — quantas vezes jogou, em que
 * nível está, quais rodadas já venceu e com quantas estrelas — atrás de configuração. Este módulo
 * é a parte PURA disso: transforma as linhas cruas de `exercise_results` (que o Play já baixa por
 * fonte) em fases com estrelas, e converte rodadas concluídas em nível com barra de progresso.
 *
 * Nada aqui toca rede ou storage: recebe linhas, devolve estrutura. É o que o torna testável e o
 * que permite à antessala e à tela de fim usarem a MESMA régua de estrelas — duas réguas
 * divergindo é como "3 estrelas aqui, 2 lá" nasceria.
 */

/** O sub-conjunto de `ExerciseResultRow` que este módulo lê. Estrutural de propósito: o tipo
 *  completo mora em `data/api.ts` e importá-lo aqui inverteria a dependência core→data. */
export interface LinhaDeExercicio {
  roundId?: string | null;
  exerciseKind?: string | null;
  itemRef?: string | null;
  correct?: number | null;
  score?: number | null;
  melhorSequencia?: number | null;
  ms?: number | null;
  createdAt?: number;
}

export interface FaseJogada {
  roundId: string;
  /** Quando a fase foi jogada (ms epoch, a linha mais recente da rodada). */
  quando: number;
  pontos: number;
  /** Combo máximo da rodada (0 quando a rodada é antiga e não gravava). */
  combo: number;
  acertos: number;
  total: number;
  precisao: number;
  estrelas: 0 | 1 | 2 | 3;
  /** Os itens exatos — é o que permite REJOGAR esta fase para melhorar a pontuação. */
  refs: string[];
}

/**
 * A régua de estrelas, uma só para o app inteiro.
 * 3 = perfeita; 2 = três quartos; 1 = metade. Abaixo disso a fase conta como jogada, sem estrela —
 * a fase aparece no mapa mesmo assim, porque "você jogou e foi mal" é progresso visível e é o
 * convite honesto para rejogar.
 */
export function estrelasDaRodada(precisao: number): 0 | 1 | 2 | 3 {
  if (precisao >= 100) return 3;
  if (precisao >= 75) return 2;
  if (precisao >= 50) return 1;
  return 0;
}

/**
 * Agrupa as linhas de UM jogo em fases, mais recente primeiro.
 *
 * `score`/`melhorSequencia` são gravados repetidos em cada linha da rodada (formato do F3); o
 * máximo cobre tanto esse formato quanto linhas antigas gravadas uma a uma.
 */
export function agruparFases(linhas: LinhaDeExercicio[], jogo: string): FaseJogada[] {
  const porRodada = new Map<string, FaseJogada>();
  for (const l of linhas) {
    if (l.exerciseKind !== jogo || !l.roundId) continue;
    const f = porRodada.get(l.roundId) ?? {
      roundId: l.roundId, quando: 0, pontos: 0, combo: 0,
      acertos: 0, total: 0, precisao: 0, estrelas: 0 as const, refs: [],
    };
    f.quando = Math.max(f.quando, l.createdAt ?? 0);
    f.pontos = Math.max(f.pontos, l.score ?? 0);
    f.combo = Math.max(f.combo, l.melhorSequencia ?? 0);
    if (l.correct != null) { f.total += 1; if (l.correct === 1) f.acertos += 1; }
    if (l.itemRef && !f.refs.includes(l.itemRef)) f.refs.push(l.itemRef);
    porRodada.set(l.roundId, f);
  }
  const fases = [...porRodada.values()];
  for (const f of fases) {
    f.precisao = f.total ? Math.round((f.acertos / f.total) * 100) : 0;
    f.estrelas = estrelasDaRodada(f.precisao);
  }
  return fases.sort((a, b) => b.quando - a.quando);
}

/** Rodadas por nível. 3 é curto de propósito: o primeiro "subiu de nível" tem que chegar na
 *  primeira sessão de uso, senão a barra parece decorativa. */
export const RODADAS_POR_NIVEL = 3;

export interface NivelNoJogo {
  nivel: number;
  /** Rodadas já feitas DENTRO do nível atual (0..RODADAS_POR_NIVEL-1). */
  noNivel: number;
  porNivel: number;
  /** % da barra até o próximo nível (0..100). */
  pct: number;
}

/** Converte rodadas concluídas em nível: começa no 1, sobe a cada `RODADAS_POR_NIVEL`. */
export function nivelNoJogo(rodadas: number): NivelNoJogo {
  const r = Math.max(0, Math.floor(rodadas));
  const noNivel = r % RODADAS_POR_NIVEL;
  return {
    nivel: 1 + Math.floor(r / RODADAS_POR_NIVEL),
    noNivel,
    porNivel: RODADAS_POR_NIVEL,
    pct: Math.round((noNivel / RODADAS_POR_NIVEL) * 100),
  };
}
