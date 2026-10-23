/**
 * A OFERTA DO MODELO PRECISO na Captura: baixar o Parakeet (672 MB) em segundo plano, quando o automático
 * cabe nele aqui mas ainda não há cópia.
 *
 * - A conta é a da rota REAL: com a nuvem disponível o automático vai à nuvem (o Whisper base é só a
 *   reserva) e o Parakeet nunca seria usado; oferecer 672 MB ali é download à toa. Enquanto a nuvem não
 *   respondeu, não oferece. No modo nuvem (chave própria), nunca.
 * - O download nunca carrega o Parakeet por cima dos modelos da captura: antes de começar, solta o
 *   Whisper/Moonshine e os tradutores (o mesmo caminho de quando se sai da tela); eles voltam do cache
 *   no próximo Iniciar.
 */
import { apiFetch } from '../../data/api';
import { routeStt, type SttRouteInput } from '../../gateway/sttRouter';
import { cabecalhoDoAlivio } from '../nuvemDeAlivio/estado';
import { cabecalhoDoDono, ENDPOINT_DA_NUVEM_DO_QUEST, nuvemDoQuestAtiva } from '../nuvemDoQuest';

/** A nuvem do STT responde? A mesma pergunta que a captura faz ao começar. Nunca lança (falha = não). */
export function nuvemDoSttDisponivel(): Promise<boolean> {
  /* Com a nuvem de alívio ACEITA (A10), a pergunta leva o cabeçalho dela: o servidor responde pela
     franquia da conta Grátis (flag, responsável, pool), o mesmo veredicto que a transcrição vai ouvir. */
  /* No Quest (site estático) a nuvem é a função do próprio site, e só com o consentimento dado. */
  return (
    nuvemDoQuestAtiva()
      ? fetch(ENDPOINT_DA_NUVEM_DO_QUEST, { headers: cabecalhoDoDono() })
      : apiFetch('/api/ai/stt/available', { headers: cabecalhoDoAlivio() })
  )
    .then((r) => r.ok)
    .catch(() => false);
}

/** Oferecer o download? `nuvemDoStt` = a resposta de `nuvemDoSttDisponivel` (`null` = ainda não veio). Pura. */
export function ofereceOPreciso(
  entrada: Omit<SttRouteInput, 'cloudAvailable'>,
  ctx: { nuvemDoStt: boolean | null; modoNuvem: boolean },
): boolean {
  if (ctx.modoNuvem || ctx.nuvemDoStt === null) return false;
  return !!routeStt({ ...entrada, cloudAvailable: ctx.nuvemDoStt }).parakeetDisponivelParaBaixar;
}

/** Solta os modelos da captura e SÓ ENTÃO baixa. Um erro ao soltar não impede o download. */
export function baixarSemEmpilhar<T>(liberarModelos: () => void, baixar: () => Promise<T>): Promise<T> {
  try {
    liberarModelos();
  } catch {
    /* worker já morto */
  }
  return baixar();
}
