import { type MinigameId, MINIGAMES } from './minigames/types';

/**
 * MAESTRIA POR JOGO (recompensas v2, onda 3 — spec 8.1).
 *
 * Cada jogo tem a sua escada de cinco níveis (Bronze → Mestre), e a subida vem só de RESULTADO:
 * acertos, multiplicados pela precisão da rodada, mais um bônus pequeno pelo combo máximo. Nada
 * por tempo (Decreto 12.880, art. 9º) — a assinatura de `pontosDeMaestria` não tem por onde
 * receber minutos, e `tests/maestria.test.ts` trava isso.
 *
 * QUEM SOMA É O SERVIDOR. Os pontos saem das linhas gravadas em `exercise_results` (e do mesmo
 * store no espelho sem conta), nunca de um número que o cliente manda. A tela calcula o ganho da
 * rodada com a MESMA função, sobre os mesmos acertos e o mesmo combo que acabou de gravar — é o que
 * faz "o que a tela diz" ser "o que o servidor creditou".
 *
 * IDEMPOTENTE POR `roundId`. Uma rodada salva duas vezes (a rede caiu e o cliente tentou de novo)
 * vira dois lotes de linhas com o mesmo `roundId` e carimbos diferentes. Vale só o PRIMEIRO lote:
 * a gravação de uma rodada é um INSERT único com um carimbo só, então o lote é exatamente a rodada.
 *
 * Regra deste arquivo: TS puro, sem DOM — roda no Express e no navegador.
 */

export const LIMIARES_DE_MAESTRIA = [30, 100, 220, 400, 600] as const;
export const NOMES_DE_MAESTRIA = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Mestre'] as const;

export type NivelDeMaestria = 0 | 1 | 2 | 3 | 4 | 5;
export type NivelAlcancavel = Exclude<NivelDeMaestria, 0>;
export const NIVEIS_DE_MAESTRIA_ALCANCAVEIS: readonly NivelAlcancavel[] = [1, 2, 3, 4, 5];

/** O nome curto de cada jogo, para "Maestria: Memória Ouro" e "Mestre de Memória". */
export const NOME_DO_JOGO_NA_MAESTRIA: Record<MinigameId, string> = {
  memory: 'Memória',
  wordsearch: 'Caça-palavras',
  blitz: 'Duelo',
  termo: 'Termo',
  scramble: 'Frase embaralhada',
  karaoke: 'Karaokê',
  escuta: 'Qual foi?',
  ditado: 'Ditado',
  conectores: 'Caça-conectores',
  karuta: 'Karuta',
  choseong: 'Choseong',
  tenis: 'Tênis',
  koffer: 'A mala',
  bao: 'Bao',
  vitendawili: 'Vitendawili',
  shiritori: 'Shiritori',
  cadavre: 'Cadavre exquis',
  taboo: 'Tabu',
};

/** Os jogos na ordem do catálogo — a mesma de `MINIGAMES`. */
export const JOGOS_DA_MAESTRIA = Object.keys(MINIGAMES) as MinigameId[];

export function ehJogo(id: string | null | undefined): id is MinigameId {
  return !!id && Object.prototype.hasOwnProperty.call(MINIGAMES, id);
}

/**
 * Pontos de uma rodada: acertos × multiplicador de precisão (0,5 abaixo de 75%; 1 a 75%; 1,5 a
 * 90%; 2 a 100%) + combo máximo ÷ 3, com teto 5. Mestre (600) ≈ 40 rodadas boas.
 */
export function pontosDeMaestria(r: { acertos: number; total: number; comboMaximo: number }): number {
  if (r.total === 0) return 0;
  const precisao = r.acertos / r.total;
  const mult = precisao >= 1 ? 2 : precisao >= 0.9 ? 1.5 : precisao >= 0.75 ? 1 : 0.5;
  return Math.round(r.acertos * mult) + Math.min(5, Math.floor(r.comboMaximo / 3));
}

export function nivelDeMaestria(pontos: number): {
  nivel: NivelDeMaestria;
  pontos: number;
  proximo: number | null;
  pctNoNivel: number;
} {
  const p = Math.max(0, Math.floor(Number.isFinite(pontos) ? pontos : 0));
  const nivel = LIMIARES_DE_MAESTRIA.filter((l) => p >= l).length as NivelDeMaestria;
  if (nivel === 5) return { nivel, pontos: p, proximo: null, pctNoNivel: 100 };
  const base = nivel === 0 ? 0 : LIMIARES_DE_MAESTRIA[nivel - 1];
  const proximo = LIMIARES_DE_MAESTRIA[nivel];
  return { nivel, pontos: p, proximo, pctNoNivel: Math.round(((p - base) / (proximo - base)) * 100) };
}

export interface MaestriaDoJogo {
  jogo: MinigameId;
  pontos: number;
  nivel: NivelDeMaestria;
}

/** "Memória Ouro". */
export function rotuloDaMaestria(jogo: MinigameId, nivel: NivelAlcancavel): string {
  return `${NOME_DO_JOGO_NA_MAESTRIA[jogo]} ${NOMES_DE_MAESTRIA[nivel - 1]}`;
}

/** Uma linha gravada — só as colunas que a soma lê (`exercise_results` e o store sem conta). */
export interface LinhaDeMaestria {
  exerciseKind: string | null;
  roundId: string | null;
  correct: number | null;
  combo: number | null;
  createdAt: number;
}

/**
 * Os pontos de cada RODADA gravada: um valor por `roundId`, do primeiro lote dela.
 *
 * Fica de fora: linha sem `roundId` (anterior à rodada ter nome), exercício que não é jogo
 * (`read-aloud`, revisão) e linha sem resposta (`correct` nulo — não se sabe se acertou).
 */
export function rodadasDeMaestria(
  linhas: ReadonlyArray<LinhaDeMaestria>,
): { jogo: MinigameId; roundId: string; pontos: number }[] {
  const porRodada = new Map<string, { jogo: MinigameId; em: number; linhas: LinhaDeMaestria[] }>();
  for (const l of linhas) {
    if (!l.roundId || !ehJogo(l.exerciseKind)) continue;
    const r = porRodada.get(l.roundId);
    if (!r || l.createdAt < r.em) porRodada.set(l.roundId, { jogo: l.exerciseKind, em: l.createdAt, linhas: [l] });
    else if (l.createdAt === r.em) r.linhas.push(l);
  }
  return [...porRodada.entries()].map(([roundId, r]) => {
    const respondidas = r.linhas.filter((l) => l.correct != null);
    return {
      jogo: r.jogo,
      roundId,
      pontos: pontosDeMaestria({
        acertos: respondidas.filter((l) => (l.correct ?? 0) > 0).length,
        total: respondidas.length,
        comboMaximo: Math.max(0, ...r.linhas.map((l) => l.combo ?? 0)),
      }),
    };
  });
}

/** A maestria dos 18 jogos, somada das linhas gravadas. Jogo nunca jogado aparece com zero. */
export function maestriaPorJogo(linhas: ReadonlyArray<LinhaDeMaestria>): MaestriaDoJogo[] {
  const soma = new Map<MinigameId, number>();
  for (const r of rodadasDeMaestria(linhas)) soma.set(r.jogo, (soma.get(r.jogo) ?? 0) + r.pontos);
  return JOGOS_DA_MAESTRIA.map((jogo) => {
    const pontos = soma.get(jogo) ?? 0;
    return { jogo, pontos, nivel: nivelDeMaestria(pontos).nivel };
  });
}

/** `maestria:<jogo>:<nível>` → o par, ou null. Nível de 1 a 5; jogo do catálogo. */
export function creditoDeMaestria(creditoId: string): { jogo: MinigameId; nivel: NivelAlcancavel } | null {
  const m = /^maestria:([a-z]+):([1-5])$/.exec(creditoId);
  if (!m || !ehJogo(m[1])) return null;
  return { jogo: m[1], nivel: Number(m[2]) as NivelAlcancavel };
}

export function idDoCreditoDeMaestria(jogo: MinigameId, nivel: NivelAlcancavel): string {
  return `maestria:${jogo}:${nivel}`;
}

/** Os créditos a pedir: um por nível alcançado em cada jogo, menos os já lançados. */
export function creditosDeMaestriaDevidos(
  maestrias: ReadonlyArray<MaestriaDoJogo>,
  jaCreditados: ReadonlySet<string>,
): string[] {
  const devidos: string[] = [];
  for (const m of maestrias) {
    for (let n = 1; n <= m.nivel; n++) {
      const id = idDoCreditoDeMaestria(m.jogo, n as NivelAlcancavel);
      if (!jaCreditados.has(id)) devidos.push(id);
    }
  }
  return devidos;
}
