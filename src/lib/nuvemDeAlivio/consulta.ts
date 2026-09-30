/**
 * A NUVEM DE ALÍVIO NO CLIENTE — a CONSULTA ao servidor e a decisão de oferecer (A10).
 *
 * Quem chama é a captura, quando o aparelho mostra que não aguenta (perfil leve, sem GPU real, ou o
 * regulador no chão da escada/travamento). A pergunta ao servidor (`GET /api/me/uso` → `alivio`) só
 * sai quando ela pode mudar alguma coisa: com a flag ligada, numa conta Grátis de verdade, e com o
 * aparelho pedindo — no aparelho forte a pessoa roda local de graça, e nem se pergunta.
 */
import {
  type AlivioDoServidor,
  deveOferecerAlivio,
  FLAG_NUVEM_GRATUITA_ALIVIO,
  type SinaisDoAparelhoParaAlivio,
} from '../../core/nuvemDeAlivio';
import { getActiveProfile } from '../../gateway/activeProfile';
import { edicaoEstatica } from '../edicaoEstatica';
import { getEntitlements } from '../entitlements';
import { flagLigada } from '../flagsCache';
import { estadoDeIdentidade } from '../identidade';
import { carregarUso } from '../uso';
import { alivioAceito, alivioDispensado } from './estado';

/**
 * O que o servidor diz do alívio desta conta. `null` sem pergunta nenhuma quando a resposta já é
 * "não": flag desligada, plano que não é o Grátis, sem conta (o convidado tem o pool dele) ou a
 * edição estática. A nuvem global fechada (chave de emergência, orçamento) também é "indisponível".
 */
export async function consultarAlivio(): Promise<AlivioDoServidor | null> {
  if (edicaoEstatica() || estadoDeIdentidade() !== 'conta') return null;
  if (getEntitlements().plan !== 'free' || !flagLigada(FLAG_NUVEM_GRATUITA_ALIVIO)) return null;
  const uso = await carregarUso();
  const a = uso?.alivio;
  if (!a) return null;
  return { disponivel: a.disponivel && uso.iaDeNuvem?.disponivel !== false, restanteSegundos: a.restanteSegundos };
}

/**
 * A oferta "Usar a nuvem grátis (restam X)" aparece agora? Devolve o que resta para a tela mostrar,
 * ou `null`. Decide primeiro com o que já se sabe no aparelho — e só pergunta ao servidor se a
 * resposta dele puder virar um "sim".
 */
export async function ofertaDoAlivio(
  aparelho: SinaisDoAparelhoParaAlivio,
): Promise<{ restanteSegundos: number } | null> {
  const local = {
    aparelho,
    aceito: alivioAceito(),
    dispensado: alivioDispensado(),
    perfilPrivado: getActiveProfile().id === 'local-private',
    edicaoEstatica: edicaoEstatica(),
  };
  if (!deveOferecerAlivio({ ...local, servidor: { disponivel: true, restanteSegundos: Infinity } })) return null;
  const servidor = await consultarAlivio();
  return servidor && deveOferecerAlivio({ ...local, servidor })
    ? { restanteSegundos: servidor.restanteSegundos }
    : null;
}
