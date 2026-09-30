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
import { ehPlanoPago, normalizarPlano } from '../core/planos';

export const CHAVE_DO_PLANO_DO_CHECKOUT = 'babel.checkout.plano';

/** MATRIZ V2: o nome antigo guardado por uma intenção de antes do deploy (`essencial`/`pro`) é o Premium. */
export function lembrarPlanoDoCheckout(plano: string | undefined): void {
  const pago = normalizarPlano(plano);
  if (!ehPlanoPago(pago)) return;
  try {
    sessionStorage.setItem(CHAVE_DO_PLANO_DO_CHECKOUT, pago);
  } catch {
    /* sem armazenamento: o checkout abre no plano padrão */
  }
}
