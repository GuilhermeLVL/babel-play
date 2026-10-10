/**
 * O PLANO QUE O CHECKOUT ABRE — por aba (`sessionStorage`), como a tela de Planos sempre guardou.
 * Quem termina um login com a intenção "assinar o X" (`lib/intencaoDeLogin`) grava aqui antes de
 * navegar: a aba da confirmação do e-mail é outra, e sem isto ela abriria o checkout no plano padrão.
 *
 * Mora FORA de `lib/assinatura`: quem grava é o `useNavegacao`, do caminho inicial, e importar dali
 * levava o módulo inteiro da assinatura para o JS de arranque — com o aviso de pagamento atrasado,
 * 0,8 KB gzip de um orçamento que o funil deixou com 0,1 KB de folga (30/09/2026). A matriz
 * (`core/planos`) já está no arranque, pelos entitlements: daqui só se usa a régua dela.
 */
import { normalizarPlano, type PlanoDeAssinatura, planosAVenda } from '../core/planos';

export const CHAVE_DO_PLANO_DO_CHECKOUT = 'babel.checkout.plano';

/**
 * O nome antigo guardado por uma intenção de antes do deploy (`pro`) é o Premium. E só se guarda plano
 * À VENDA (`planosAVenda`): com a venda dos planos novos fechada (matriz v3), abrir o checkout num
 * plano que `/api/billing/assinar` recusa seria um botão que sempre falha.
 */
export function lembrarPlanoDoCheckout(plano: string | undefined): void {
  const pago = normalizarPlano(plano);
  if (!pago || !(planosAVenda(() => false) as PlanoDeAssinatura[]).includes(pago)) return;
  try {
    sessionStorage.setItem(CHAVE_DO_PLANO_DO_CHECKOUT, pago);
  } catch {
    /* sem armazenamento: o checkout abre no plano padrão */
  }
}
