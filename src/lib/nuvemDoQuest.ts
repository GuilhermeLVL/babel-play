/**
 * A NUVEM DO QUEST — a única nuvem da edição estática.
 *
 * O Meta Quest dá 3 núcleos ao navegador, e o Whisper local não acompanha a fala ali (fator 0,81 a
 * 1,42, medido em 01/10/2026). O mercado inteiro de óculos e headsets resolve assim: o aparelho capta
 * e exibe, a nuvem transcreve, e o modelo local fica de reserva. No Quest, com o consentimento de
 * nuvem dado (o mesmo de Ajustes → Privacidade, com registro datado), a fala recortada vai à função
 * `functions/quest/stt.js` do próprio site (Workers AI, Whisper large-v3-turbo). Sem consentimento,
 * fora do Quest ou na edição com servidor, nada muda.
 */
import { perfilDoDispositivo } from './dispositivo/perfil';
import { edicaoEstatica } from './edicaoEstatica';
import { lerPreferencias } from './preferencias';

/** A função do Pages. Fora de `/api`: lá a edição estática responde em memória, sem rede. */
export const ENDPOINT_DA_NUVEM_DO_QUEST = '/quest/stt';

/** Este aparelho PODE usar a nuvem do Quest (é o Quest, no site estático)? */
export function nuvemDoQuestExiste(): boolean {
  return edicaoEstatica() && perfilDoDispositivo().tipo === 'quest';
}

/** A nuvem do Quest está LIGADA: existe aqui e a pessoa consentiu. Lida a cada chamada. */
export function nuvemDoQuestAtiva(): boolean {
  return nuvemDoQuestExiste() && lerPreferencias().consentimentos.nuvem === true;
}
