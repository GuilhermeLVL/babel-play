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

/**
 * Este aparelho PODE usar a nuvem do site estático? Todo aparelho LEVE (`perfil.ts`: Quest, celular
 * fraco, desktop de 2 núcleos ou 2 GB) — os que não acompanham a fala com o modelo local. O nome ficou
 * do Quest, onde ela nasceu. A cota é do servidor: 15 min por dia por endereço de rede.
 */
export function nuvemDoQuestExiste(): boolean {
  return edicaoEstatica() && perfilDoDispositivo().leve;
}

/** A nuvem do Quest está LIGADA: existe aqui e a pessoa consentiu. Lida a cada chamada. */
export function nuvemDoQuestAtiva(): boolean {
  return nuvemDoQuestExiste() && lerPreferencias().consentimentos.nuvem === true;
}

/** Onde a chave de dono fica neste navegador (digitada em `/diagnostico`). */
export const CHAVE_DO_DONO_NO_APARELHO = 'babel.chaveDoDono';

/**
 * O cabeçalho da CHAVE DE DONO: quem a tem não cai na cota por visitante (o dono testando no próprio
 * aparelho). O servidor compara com o segredo `CHAVE_DO_DONO` do Pages; o teto global continua valendo.
 * Sem chave guardada, cabeçalho nenhum.
 */
export function cabecalhoDoDono(): Record<string, string> {
  try {
    const chave = localStorage.getItem(CHAVE_DO_DONO_NO_APARELHO)?.trim();
    return chave ? { 'x-chave-do-dono': chave } : {};
  } catch {
    return {};
  }
}
