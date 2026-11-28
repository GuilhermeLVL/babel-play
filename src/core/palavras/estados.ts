/**
 * OS ESTADOS DO CARTÃO NA LISTA DE PALAVRAS (openspec `cartoes` 6.1; flag `estudo_palavras_v2`): o filtro por estado num lugar
 * só, o mesmo nome no navegador (aba Palavras) e no servidor (`GET /api/vocab/pagina?estados=`).
 *
 * As definições são as de `resumoDosCartoes` (o número da tela é o que a revisão abre):
 *   nova        no baralho e `stability` nula;
 *   aprendendo  no baralho, com estabilidade e menos de 2 repetições;
 *   revisao     no baralho, com estabilidade e 2 repetições ou mais;
 *   hoje        no baralho e `due_at <= agora`;
 *   dificeis    no baralho e errada `ERROS_DE_DIFICIL` vezes ou mais;
 *   suspensa    fora da revisão (`in_deck` = 0).
 * Vários estados juntos valem como "um OU outro".
 */
export const ESTADOS_DO_CARTAO = ['nova', 'aprendendo', 'revisao', 'hoje', 'dificeis', 'suspensa'] as const;
export type EstadoDoCartao = (typeof ESTADOS_DO_CARTAO)[number];

export function ehEstadoDoCartao(v: string): v is EstadoDoCartao {
  return (ESTADOS_DO_CARTAO as readonly string[]).includes(v);
}
