/**
 * O PERFIL É PROTEGIDO? (a pergunta do avatar). A fonte é `perfilProtegido()` (`protecaoDoMenor.ts`, o último valor
 * que o servidor disse sobre a idade): menor de 18 ou idade não declarada. Sem conta no modo público também conta
 * como protegido; no self-host, não. Em dúvida, protegido (falha fechada).
 *
 * `frasy.avatar.protegido = 1` no `sessionStorage` TRAVA o aparelho no modo protegido: só restringe, nunca libera.
 * Serve aos testes (o e2e do self-host não tem conta de menor) e a quem queira usar o app já travado.
 */
import { useSyncExternalStore } from 'react';

import { aoMudarProtecao, perfilProtegido } from '../protecaoDoMenor';

export const CHAVE_DA_TRAVA = 'frasy.avatar.protegido';

export function protegidoParaAvatar(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_DA_TRAVA) === '1') return true;
  } catch {
    /* armazenamento bloqueado: vale só a regra do app */
  }
  return perfilProtegido();
}

export function useProtegidoParaAvatar(): boolean {
  return useSyncExternalStore(aoMudarProtecao, protegidoParaAvatar, () => true);
}
