/**
 * O RECONHECIMENTO COMEÇA A CHEGAR AO ENTRAR NO INTÉRPRETE (conversa-de-verdade, 4.2) — puro.
 *
 * No primeiro uso, a pessoa tocava "Falar" e só ali o reconhecimento começava a carregar: ela falava sobre um modelo em
 * 0% e a fala era entregue muito depois (CONV-01, CONV-09). Quem já aceitou o download — o modelo desta conversa está
 * inteiro no aparelho — não precisa esperar o toque: ao abrir a tela do Intérprete, ele sobe do cache para a memória.
 *
 * O QUE NÃO FAZ: baixar pela rede antes do toque. O aceite do download não é guardado entre visitas (a folha "Baixar e
 * iniciar" já começa a conversa), então sem o modelo no aparelho nada sai da rede aqui — nem na rede lenta, nem com a
 * economia de dados, nem na boa. O download continua sendo o do toque, com a pergunta de sempre.
 */
export function carregarAoEntrarNoInterprete(o: {
  /** A tela aberta é a do Intérprete (e não a Capturar). */
  noInterprete: boolean;
  /** Já há uma sessão (o modelo é da preparação dela). */
  gravando: boolean;
  /** O modelo de transcrição desta conversa já está inteiro no aparelho (o aceite foi dado antes). */
  noAparelho: boolean;
  /** Nada a carregar: a transcrição é da nuvem. */
  semModeloLocal: boolean;
}): boolean {
  return o.noInterprete && !o.gravando && !o.semModeloLocal && o.noAparelho;
}
