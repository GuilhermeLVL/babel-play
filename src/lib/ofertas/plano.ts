/**
 * O PLANO NO VOCABULÁRIO DAS OFERTAS — o mesmo das flags (`PlanoDaFlag`): `convidado` é quem não
 * tem conta. O cliente não decide plano nenhum: lê o cache de `GET /api/me/entitlements`.
 */
import type { PlanoDaFlag } from '../../core/flags';
import { getEntitlements } from '../entitlements';
import { estaAnonimo } from '../identidade';

export function planoDaOferta(): PlanoDaFlag {
  if (estaAnonimo()) return 'convidado';
  const plan = getEntitlements().plan;
  return plan === 'anonimo' ? 'convidado' : plan;
}
