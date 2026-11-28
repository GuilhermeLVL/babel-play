/**
 * O PEDIDO DE ABRIR UMA PALAVRA vindo de fora da lista (a busca global; openspec `cartoes` 9.2, flag `estudo_palavras_v2`).
 * A lista de Palavras ainda pode nem estar montada quando a busca pede, então o pedido fica guardado em memória (nunca em
 * disco) até a lista o consumir. Um pedido vale uma vez só.
 */
let pendente: string | null = null;

export function pedirParaAbrirPalavra(id: string): void {
  pendente = id;
}

/** O id pedido, ou `null`. Consumir apaga: a segunda chamada devolve `null`. */
export function consumirPedidoDePalavra(): string | null {
  const id = pendente;
  pendente = null;
  return id;
}

/** Espia sem consumir (a lista só consome quando o cartão já chegou). */
export function pedidoDePalavraPendente(): string | null {
  return pendente;
}
