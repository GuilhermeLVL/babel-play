/**
 * A FALHA COMO A TELA DO APP A MOSTRA: o mapa puro de `core/falhas/mensagemDeFalha.ts` com o que só a
 * página sabe — se há rede (`navigator.onLine`) e se o detalhe técnico pode aparecer (dev e self-host).
 */
import { type FalhaNaTela, falhaParaATela, mostraDetalheTecnico } from '../../core/falhas/mensagemDeFalha';

export type { FalhaNaTela };

export function falhaDaCaptura(erro: unknown): FalhaNaTela {
  const online = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  return falhaParaATela(erro, { online, tecnico: mostraDetalheTecnico(import.meta.env) });
}
