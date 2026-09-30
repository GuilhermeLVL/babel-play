/**
 * O PEDIDO DE DESTAQUE NA TELA DE PLANOS — a oferta não tem comparação própria: ela ABRE a tela de
 * Planos (`views/Planos.tsx`, a única comparação do app) com o plano sugerido destacado, ou direto
 * na aba "Consumo do mês" quando o assunto é a cota.
 *
 * Um recado de uma vez só em `sessionStorage`: a oferta escreve, a tela de Planos lê ao montar e
 * apaga. Recarregar Planos depois disso volta ao normal.
 *
 * `teste` (C8): a oferta sugeriu o teste de 14 dias — a tela destaca o cartão do Premium, onde o
 * toque do teste já é o botão principal para quem pode testar.
 */
export type PedidoDeDestaque = { plano: 'premium' | 'teste' } | { aba: 'consumo' };

const CHAVE = 'babel.planos.destaque';
let emMemoria: PedidoDeDestaque | null = null;

export function pedirDestaqueEmPlanos(p: PedidoDeDestaque): void {
  emMemoria = p;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    /* fica a memória */
  }
}

/** Lê e apaga. `null` quando não há pedido (ou ele está fora da forma). */
export function consumirDestaqueEmPlanos(): PedidoDeDestaque | null {
  let p: unknown = emMemoria;
  emMemoria = null;
  try {
    const b = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    if (b) p = JSON.parse(b);
  } catch {
    /* idem */
  }
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  /* O nome antigo de um pedido gravado antes do deploy (`essencial`/`pro`) destaca o Premium. */
  if (o.plano === 'teste') return { plano: 'teste' };
  if (o.plano === 'premium' || o.plano === 'essencial' || o.plano === 'pro') return { plano: 'premium' };
  if (o.aba === 'consumo') return { aba: 'consumo' };
  return null;
}
