/**
 * A PRÉVIA DA RODADA DENTRO DA FOLHA "COMO SE JOGA" (change `tela-de-jogos-v2`, 2.6b).
 *
 * Só CONTAGENS, nunca texto de item: quem conta recebe a lista que já passou por `previaSegura`
 * (a `ItemDaAntessala[]` da antessala), então a folha não tem como imprimir a resposta de um jogo
 * que não pode revelá-la. A regra de zeros é a de 2.6a: "já viu" e "para repetir" somem quando são
 * zero; "novas" FICA mesmo em zero, porque zero ali é a denúncia de sorteio repetido.
 */

export interface PreviaDaFolha {
  novas: number;
  jaViu: number;
  paraRepetir: number;
}

export type ChaveDaPrevia = 'novas' | 'jaViu' | 'paraRepetir';

/** Conta a rodada: `historico` = refs já jogadas; `vencidos` = refs que a memória pede para rever. */
export function previaDaFolha(
  itens: ReadonlyArray<{ ref: string }>,
  historico: { has(ref: string): boolean },
  vencidos: { has(ref: string): boolean },
): PreviaDaFolha {
  let novas = 0;
  let jaViu = 0;
  let paraRepetir = 0;
  for (const it of itens) {
    if (historico.has(it.ref)) jaViu++;
    else novas++;
    if (vencidos.has(it.ref)) paraRepetir++;
  }
  return { novas, jaViu, paraRepetir };
}

/** As linhas que a folha mostra, em ordem fixa: "novas" sempre, as outras só quando diferentes de zero. */
export function linhasDaPrevia(p: PreviaDaFolha): Array<{ chave: ChaveDaPrevia; n: number }> {
  const linhas: Array<{ chave: ChaveDaPrevia; n: number }> = [{ chave: 'novas', n: p.novas }];
  if (p.jaViu > 0) linhas.push({ chave: 'jaViu', n: p.jaViu });
  if (p.paraRepetir > 0) linhas.push({ chave: 'paraRepetir', n: p.paraRepetir });
  return linhas;
}
