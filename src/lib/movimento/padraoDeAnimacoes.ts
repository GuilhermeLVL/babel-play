/**
 * O PADRÃO DO INTERRUPTOR "ANIMAÇÕES" quando a pessoa ainda não escolheu nada.
 *
 * Antes o padrão era sempre ligado, e a classe `body.animations-on` (que autoriza o CSS e `reduz()` a
 * IGNORAR o `prefers-reduced-motion` do sistema) nascia junto: quem pedia menos movimento ao sistema
 * recebia o app inteiro animado (defeito de acessibilidade, `polimento-movimento` 8.5; o público inclui
 * menores). Agora, sem escolha guardada, o sistema decide: pediu menos movimento, as animações nascem
 * desligadas. Escolha guardada (a pessoa mexeu no interruptor) vence o sistema, nos dois sentidos.
 */
export function animacoesLigadasPorPadrao(guardado: string | null | undefined, sistemaPedeMenos: boolean): boolean {
  if (guardado === 'true') return true;
  if (guardado === 'false') return false;
  return !sistemaPedeMenos;
}
