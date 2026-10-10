/**
 * EM QUE BLOCO DA LISTA CADA FALA MORA — a conta que deixa a legenda longa custar o mesmo que a curta.
 *
 * O PROBLEMA (auditoria de desempenho de 10/10/2026, gargalo 10). Cada fala nova na captura custava mais
 * que a anterior: 45 ms no começo, 81 ms depois de 200 (celular médio, CPU 4×). A linha já tinha
 * `content-visibility: auto`, que tira do cálculo o MIOLO de quem está fora da tela, mas a própria linha
 * continua sendo um elemento da lista: a cada fala inserida o navegador recalcula o estilo de TODAS as
 * linhas (as regras `:has()` do app mandam revisitar a tela inteira a cada inserção) e refaz o layout de
 * uma coluna com centenas de filhos. Medido com trace, 20 falas novas sobre 180: 1.359 ms de estilo e
 * 374 ms de layout; sobre 400, 1.669 e 546.
 *
 * O CONSERTO. As falas ficam em blocos de 20, e o bloco que já passou é quem tem o
 * `content-visibility: auto`: fora da tela, o navegador pula o bloco inteiro, com as linhas dentro. A
 * lista passa a ter um filho a cada 20 falas. O mesmo trace, com blocos: 707 ms de estilo e 93 de layout
 * sobre 180 falas; 859 e 106 sobre 400 (com 1 fala na tela: 691 e 104).
 *
 * A FALA NÃO MUDA DE BLOCO. Mudar de bloco é mudar de pai no DOM, e o React desmontaria a linha (a
 * entrada animada rodaria de novo no meio da leitura). Por isso a conta parte do que já estava
 * decidido (`anterior`) e só responde por quem chegou:
 *  - quem já tinha bloco fica nele, mesmo que o bloco esvazie por outras saírem;
 *  - fala que entra no MEIO (o reconhecimento entrega fora de ordem e a lista é ordenada) vai para o
 *    bloco da vizinha de baixo, e assim os blocos continuam em ordem;
 *  - fala que entra no FIM enche o último bloco e, cheio, abre o seguinte.
 */

/** Quantas falas cabem num bloco. Com 20, o bloco tem mais ou menos duas telas de celular. */
export const FALAS_POR_BLOCO = 20;

export function blocosDasFalas(
  ids: readonly string[],
  anterior: ReadonlyMap<string, number>,
  porBloco = FALAS_POR_BLOCO,
): Map<string, number> {
  const bloco = new Map<string, number>();
  const quantas = new Map<number, number>();
  const por = (id: string, b: number) => {
    bloco.set(id, b);
    quantas.set(b, (quantas.get(b) ?? 0) + 1);
  };

  for (const id of ids) {
    const b = anterior.get(id);
    if (b !== undefined) por(id, b);
  }

  /* Do fim para o começo: a nova que tem uma antiga DEPOIS dela entra no bloco dessa vizinha. As que
     não têm ninguém depois são as do fim da lista. */
  let daVizinha: number | undefined;
  const doFim: string[] = [];
  for (let i = ids.length - 1; i >= 0; i--) {
    const id = ids[i];
    const b = bloco.get(id);
    if (b !== undefined) daVizinha = b;
    else if (daVizinha === undefined) doFim.push(id);
    else por(id, daVizinha);
  }

  let ultimo = 0;
  for (const b of bloco.values()) if (b > ultimo) ultimo = b;
  for (let i = doFim.length - 1; i >= 0; i--) {
    if ((quantas.get(ultimo) ?? 0) >= porBloco) ultimo += 1;
    por(doFim[i], ultimo);
  }
  return bloco;
}

/** As falas agrupadas pelos blocos, na ordem em que vieram. Cada grupo é um bloco da lista. */
export function agruparEmBlocos<T extends { id: string }>(
  falas: readonly T[],
  bloco: ReadonlyMap<string, number>,
): Array<{ bloco: number; falas: T[] }> {
  const grupos: Array<{ bloco: number; falas: T[] }> = [];
  for (const fala of falas) {
    const b = bloco.get(fala.id) ?? 0;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.bloco === b) ultimo.falas.push(fala);
    else grupos.push({ bloco: b, falas: [fala] });
  }
  return grupos;
}
