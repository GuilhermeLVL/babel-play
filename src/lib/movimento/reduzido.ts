/**
 * O usuário desligou movimento? Morava em `juice.ts`; veio para cá sozinha para que quem só precisa
 * desta pergunta (a faixa de movimento, a troca de tema) não carregue o motor de efeitos junto.
 *
 * A ordem importa: o Modo desempenho e o interruptor desligado vencem; o interruptor LIGADO vence a
 * preferência do sistema (a pessoa escolheu ver as animações neste app).
 */
export function movimentoReduzido(): boolean {
  if (typeof window === 'undefined') return true;
  const body = document.body;
  if (body.classList.contains('performance-mode') || body.classList.contains('animations-off')) return true;
  if (body.classList.contains('animations-on')) return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
