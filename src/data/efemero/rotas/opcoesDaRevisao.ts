/**
 * ESPELHO SEM CONTA — as opções da revisão na conta (openspec `cartoes`, 2.1 e 2.2).
 *
 * Metade de `src/data/rotas/opcoesDaRevisao.ts`. Sem conta não há o que guardar no servidor nem contador do dia
 * que ele garanta: as opções seguem no `localStorage` do aparelho (`lib/revisao/preferencias`) e a resposta diz
 * `hoje: null`, para a tela não inventar um número. O PUT é aceito e ignorado (a escolha já foi gravada no aparelho
 * por quem a fez).
 *
 * Rotas: GET e PUT `/api/vocab/opcoes-da-revisao`.
 */
import { OPCOES_DA_CONTA_PADRAO } from '../../../core/learning/opcoesDaRevisao';
import { json } from '../nucleo';

const resposta = () => json({ opcoes: OPCOES_DA_CONTA_PADRAO, naConta: false, hoje: null });

export async function lerOpcoesLocais(): Promise<Response> {
  return resposta();
}

export async function gravarOpcoesLocais(): Promise<Response> {
  return resposta();
}
