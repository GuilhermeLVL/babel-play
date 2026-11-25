/**
 * REGRAS PURAS DA CONVERSA VIRTUAL (`openspec/changes/interprete-conversa-virtual`, tarefa 1.9): quando a voz
 * da nuvem acabou de vez (e a conversa cai para só legenda) e como o tempo da conversa é contado.
 * Sem React, sem rede, sem DOM.
 */

/**
 * Os motivos de a voz da nuvem recuar que significam "o teto acabou": a cota do mês (402 `quota_exceeded`) e o
 * uso justo do dia (429). Os outros (rede, prazo, nuvem ocupada, plano sem a voz) são falhas da vez: a voz do
 * aparelho lê no lugar, como sempre, e a conversa não muda de modo.
 */
const MOTIVOS_DE_TETO: ReadonlySet<string> = new Set(['cota', 'uso-justo']);

/** O recuo da voz da nuvem foi o teto de voz da conta? Então a conversa segue só com legenda. */
export const ehTetoDeVoz = (motivo: string): boolean => MOTIVOS_DE_TETO.has(motivo);

/** Minutos inteiros de conversa (arredonda para baixo; negativo e NaN valem 0). */
export function minutosDaConversa(msAcumulados: number): number {
  if (!Number.isFinite(msAcumulados) || msAcumulados <= 0) return 0;
  return Math.floor(msAcumulados / 60_000);
}

/**
 * Soma o tempo em que ao menos uma fonte esteve aberta: `ativo` diz se havia fonte aberta nos últimos `deltaMs`.
 * Pausas (nenhuma fonte aberta) não contam.
 */
export const somarTempoAtivo = (acumuladoMs: number, deltaMs: number, ativo: boolean): number =>
  ativo && deltaMs > 0 ? acumuladoMs + deltaMs : acumuladoMs;
