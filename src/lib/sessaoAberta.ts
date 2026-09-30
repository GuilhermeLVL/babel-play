/**
 * A SESSÃO QUE A ANÁLISE ABRE (`/sessao/<id>`), decidida antes de montar a tela.
 *
 * O DEFEITO: abrir o endereço direto numa aba nova, com a lista de gravações ainda a caminho (no modo
 * com login ela chega depois da sessão da conta), derrubava a tela — a Análise recebia `recording`
 * vazio. E um id que não estava na lista já carregada (sessão apagada, de outra conta) abria a mais
 * recente, sem avisar que não era a pedida.
 *
 * Sem id (`/sessao`), vale o de antes: a mais recente.
 */
export type SessaoAberta<G> =
  | { tipo: 'carregando' }
  | { tipo: 'sessao'; gravacao: G }
  /** O id pedido não está na lista carregada. */
  | { tipo: 'nao-encontrada' }
  /** Sem id, e a biblioteca está vazia. */
  | { tipo: 'vazia' };

export function sessaoAberta<G extends { id: string }>(o: {
  /** A lista de gravações já respondeu (com sucesso ou não). */
  carregadas: boolean;
  gravacoes: ReadonlyArray<G>;
  id: string | null | undefined;
}): SessaoAberta<G> {
  const pedida = o.id ? o.gravacoes.find((g) => g.id === o.id) : o.gravacoes[0];
  if (pedida) return { tipo: 'sessao', gravacao: pedida };
  if (!o.carregadas) return { tipo: 'carregando' };
  return o.id ? { tipo: 'nao-encontrada' } : { tipo: 'vazia' };
}
