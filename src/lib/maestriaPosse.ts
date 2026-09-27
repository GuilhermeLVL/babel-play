/**
 * POSSE DA MAESTRIA — só o espelho local, num módulo minúsculo (o padrão de `conquistasPosse`).
 *
 * Separado de `lib/maestria` (que fala com a API) porque `loja.estadoDoItem` precisa perguntar
 * "que nível de maestria este jogo já tem creditado?" sem arrastar rede nem criar ciclo de
 * importação. Guarda só o que o SERVIDOR confirmou: os `maestria:<jogo>:<nível>` já lançados.
 */
import { creditoDeMaestria, type MinigameId, type NivelDeMaestria } from '@core';

const CHAVE = 'babel.maestria_creditada';

/** Os `maestria:<jogo>:<nível>` que o servidor já creditou (espelho local). */
export function maestriasCreditadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Substitui o espelho pela lista do servidor — ele é a fonte. */
export function hidratarMaestria(creditados: readonly string[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...new Set(creditados)].sort()));
  } catch {
    /* sem storage: os itens de maestria ficam trancados até a próxima leitura */
  }
}

/** O maior nível creditado de um jogo (0 = nenhum). */
export function nivelCreditado(
  jogo: MinigameId,
  creditados: ReadonlySet<string> = maestriasCreditadas(),
): NivelDeMaestria {
  let maior: NivelDeMaestria = 0;
  for (const id of creditados) {
    const m = creditoDeMaestria(id);
    if (m && m.jogo === jogo && m.nivel > maior) maior = m.nivel;
  }
  return maior;
}
