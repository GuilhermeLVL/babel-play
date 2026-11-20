/**
 * PEDIR A CONTA DE QUALQUER TELA, sem prop do App.
 *
 * Dois pedidos, os dois por evento (o App escuta em `useGateDeConta`):
 *
 *  · `pedirConta(origem)` abre o convite (`GateDeConta`) com o motivo de `motivoDoGate(origem)`. É o
 *    CLIQUE da pessoa: abre SEMPRE, mesmo depois de ela ter fechado o convite nesta visita. O aviso que
 *    o servidor em memória dispara sozinho (`naoDisponivelSemConta`) continua valendo uma vez por visita.
 *  · `pedirEntrada(modo)` vai direto à porta: "Criar conta" abre o Login no cadastro; "Já tenho conta",
 *    na entrada. É o que os dois botões de todo convite chamam.
 */
import { useEffect, useState } from 'react';

import { EVENTO_EXIGE_CONTA } from '../data/efemero/nucleo';
import { edicaoEstatica } from './edicaoEstatica';
import { aoMudarIdentidade, estaAnonimo } from './identidade';

export type ModoDeEntrada = 'login' | 'signup';

export const EVENTO_PEDIR_ENTRADA = 'babel_pedir_entrada';

/**
 * Sem conta, num app que TEM conta a oferecer: o modo público sem sessão (inclusive o convidado anônimo
 * do Supabase). A edição estática também é `anonimo`, mas lá não há porta — e o self-host nunca é.
 */
export const semContaComPorta = (): boolean => estaAnonimo() && !edicaoEstatica();

/**
 * O mesmo, acompanhando a identidade: a sessão restaurada tarde (ou o `USER_UPDATED` da conversão) troca
 * a tela para o ramo da conta, e o ramo de visitante nunca fica à vista de uma conta de verdade.
 */
export function useSemContaComPorta(): boolean {
  const [semConta, setSemConta] = useState(semContaComPorta);
  useEffect(() => {
    setSemConta(semContaComPorta());
    return aoMudarIdentidade(() => setSemConta(semContaComPorta()));
  }, []);
  return semConta;
}

export function pedirConta(origem: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_EXIGE_CONTA, { detail: { rota: origem, explicito: true } }));
}

export function pedirEntrada(modo: ModoDeEntrada): void {
  window.dispatchEvent(new CustomEvent(EVENTO_PEDIR_ENTRADA, { detail: { modo } }));
}

/**
 * A ação que precisa de conta: sem conta, o clique vira o convite (e a ação não roda); com conta, a
 * ação de sempre. Nada de botão morto nem de erro cru depois do primeiro convite.
 */
export function comConta<A extends unknown[]>(origem: string, acao: (...a: A) => void): (...a: A) => void {
  return (...a: A) => {
    if (semContaComPorta()) pedirConta(origem);
    else acao(...a);
  };
}
