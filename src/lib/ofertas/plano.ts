/**
 * O PLANO NO VOCABULÁRIO DAS OFERTAS — o mesmo das flags (`PlanoDaFlag`): `convidado` é quem não
 * tem conta. O cliente não decide plano nenhum: lê o cache de `GET /api/me/entitlements`.
 */
import type { PlanoDaFlag } from '../../core/flags';
import { getEntitlements } from '../entitlements';
import { estaAnonimo, estadoDeIdentidade } from '../identidade';
import { perfilProtegido } from '../protecaoDoMenor';
import { podeTestarConhecido } from './teste';

export function planoDaOferta(): PlanoDaFlag {
  if (estaAnonimo()) return 'convidado';
  const plan = getEntitlements().plan;
  return plan === 'anonimo' ? 'convidado' : plan;
}

/**
 * QUEM É A PESSOA, para o motor (C8): a CONTA de perfil protegido (menor, ou idade ainda não
 * declarada — `perfilProtegido()`, a configuração mais protetiva é a padrão) só recebe o funcional; e
 * quem o servidor deixa testar ouve o teste de 14 dias. O convidado não é "protegido" aqui: para ele a
 * única promocional já é criar a conta, que é também onde a idade é perguntada.
 */
export function pessoaDaOferta(): { protegido: boolean; podeTestar: boolean } {
  return {
    protegido: estadoDeIdentidade() === 'conta' && perfilProtegido(),
    podeTestar: podeTestarConhecido(),
  };
}
