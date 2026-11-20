/**
 * AVISO ANTES DE BAIXAR MODELOS — o tamanho real, antes do primeiro byte.
 *
 * Quem decide o limite é o perfil do aparelho (`perfil.ts`, `confirmarDownloadAcimaDeMb`):
 * `navigator.connection.saveData` ou rede lenta (o tipo declarado abaixo de 4g ou, no Safari, a vazão medida em
 * `vazao.ts`) → perguntar sempre; celular/Quest → acima de 20 MB (era 100 até 17/11/2026: 90 MB saíam do plano
 * de dados sem pergunta, CEL-04); desktop → acima de 300 MB. Os limites são escolha nossa (decisão do dono),
 * não números normativos (a pesquisa não achou limite oficial, §4).
 */

/** MB que ainda faltam: soma só os modelos que NÃO estão completos no navegador. */
export function mbQueFaltaBaixar(
  modelos: ReadonlyArray<{ id: string; mbEstimado?: number }>,
  completos: ReadonlySet<string>,
): number {
  return modelos.reduce((soma, m) => soma + (completos.has(m.id) ? 0 : (m.mbEstimado ?? 0)), 0);
}

/** Perguntar antes de baixar? `limiteMb` null = nunca; 0 = sempre que houver algo a baixar. */
export function precisaConfirmarDownload(limiteMb: number | null, faltandoMb: number, jaConfirmado: boolean): boolean {
  if (limiteMb === null || jaConfirmado || faltandoMb <= 0) return false;
  return faltandoMb > limiteMb;
}
