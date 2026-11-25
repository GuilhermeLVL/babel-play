/**
 * AS OPÇÕES DA REVISÃO NA CONTA, DO LADO DA TELA (openspec `cartoes`, 2.1 e 2.2).
 *
 * `sincronizarOpcoes` lê a conta: se ela já tem opções, valem em todos os aparelhos e viram o cache deste
 * (`localStorage`); se nunca teve, a escolha que a pessoa já fez neste aparelho sobe uma vez. O resultado traz
 * também o que sobra do limite de HOJE (contado pelo servidor, no fuso da pessoa), ou `null` quando não há como
 * contar (sem conta, sem rede): sem número inventado, a rodada só respeita o limite por rodada.
 */
import { type OpcoesDaConta, restamHoje } from '../../core/learning/opcoesDaRevisao';
import {
  fetchOpcoesDaRevisao,
  gravarOpcoesDaRevisaoNaConta,
  type HojeDaRevisao,
} from '../../data/rotas/opcoesDaRevisao';
import { gravarOpcoesDaRevisao, lerOpcoesDaRevisao, type OpcoesDaRevisao, temOpcoesLocais } from './preferencias';

export interface OpcoesSincronizadas {
  opcoes: OpcoesDaRevisao;
  hoje: HojeDaRevisao | null;
}

/** Quanto ainda cabe de cada tipo hoje; `null` sem contador (a tela não promete o que não sabe). */
export function restamDeHoje(hoje: HojeDaRevisao | null, opcoes: Pick<OpcoesDaConta, 'novas' | 'revisoes'>) {
  return hoje ? restamHoje(opcoes, hoje) : null;
}

export async function sincronizarOpcoes(): Promise<OpcoesSincronizadas | null> {
  const r = await fetchOpcoesDaRevisao();
  if (!r) return null;
  if (r.naConta) {
    gravarOpcoesDaRevisao(r.opcoes);
    return { opcoes: r.opcoes, hoje: r.hoje };
  }
  /* A conta nunca guardou opções (ou não há conta): vale o que a pessoa já escolheu aqui, e sobe uma vez. */
  const locais = lerOpcoesDaRevisao();
  if (r.hoje && temOpcoesLocais()) {
    const subiu = await gravarOpcoesDaRevisaoNaConta(locais);
    if (subiu) return { opcoes: locais, hoje: subiu.hoje };
  }
  return { opcoes: locais, hoje: r.hoje };
}

/** Guarda na conta o que a pessoa acabou de mudar. Sem rede ou sem conta, a escolha segue só neste aparelho. */
export function enviarOpcoes(mudou: Partial<OpcoesDaRevisao>): void {
  void gravarOpcoesDaRevisaoNaConta(mudou);
}
