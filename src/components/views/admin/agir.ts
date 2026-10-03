import type { Resposta } from '../../../lib/admin';
import { askConfirm, type ConfirmRequest, toast } from '../../Toast';

/**
 * UMA AÇÃO DE ADMINISTRAÇÃO, do pedido ao resultado: confirma (com `askConfirm`, nunca `confirm()`),
 * chama a rota, avisa o que houve e, só se deu certo, recarrega o que estava na tela.
 *
 * Devolve `null` quando a pessoa desistiu na confirmação; senão, a resposta do servidor. O pedido do
 * segundo fator (403 `aal2_requerido`) não vira aviso de erro: vai para `aoPedirCodigo`.
 */
export interface PedidoDeAcao<T> {
  confirmacao: ConfirmRequest;
  fazer: () => Promise<Resposta<T>>;
  sucesso: string;
  aoPedirCodigo: () => void;
  depois: () => void;
}

export async function agir<T>(p: PedidoDeAcao<T>): Promise<Resposta<T> | null> {
  if (!(await askConfirm(p.confirmacao))) return null;
  const r = await p.fazer();
  if (r.ok) {
    toast.ok(p.sucesso);
    p.depois();
  } else if (r.segundoFator) {
    p.aoPedirCodigo();
  } else {
    toast.error(r.erro);
  }
  return r;
}
