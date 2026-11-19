/**
 * A FALA FORA DO PAR NO INTÉRPRETE POR TOQUE (conversa-de-verdade, 3.1 e 3.2) — puro.
 *
 * No toque, o idioma vem do LADO: a fala é transcrita na dica dele. Quem fala outro idioma naquele lado (o espanhol no
 * lado do inglês) recebia uma transcrição forçada e uma tradução inventada, lida em voz alta sem aviso ("Perdón,
 * ¿alguien quiere más pan?" virou "Sorry, I want to go to the bathroom.", CONV-03). O reconhecimento confere o idioma
 * do áudio no fim do turno (`SttFinal.idiomaConferido`), e esta regra decide se a fala é bloqueada.
 *
 * A DETECÇÃO É FRACA EM TRECHO CURTO (12/20 pt com 1,5 s; `idiomaDoWhisper.ts`): só bloqueia com fala de pelo menos
 * 2 s e confiança de pelo menos 0,8. Abaixo disso a fala segue normal — um falso bloqueio custa um "repetir?", e a
 * pessoa não deve receber isso por um "Ok".
 */
import { baseLang } from '@core/texto/idioma';

/** A confiança mínima do idioma medido para bloquear (calibrada no conjunto de teste, 3.3). */
export const CONFIANCA_DO_FORA_DO_PAR = 0.8;
/** A fala mínima (ms) para conferir o idioma. */
export const FALA_MINIMA_DO_FORA_DO_PAR_MS = 2000;

/**
 * O idioma ouvido (ISO-639-1) quando a fala está FORA do idioma do lado, ou `null` quando ela segue normal (o mesmo
 * idioma, a fala curta, a confiança baixa, ou nada conferido).
 */
export function idiomaForaDoPar(o: {
  /** O idioma do lado (a dica). */
  esperado: string;
  conferido: { idioma: string; confianca: number } | undefined;
  audioMs: number;
  limiar?: number;
}): string | null {
  const esperado = baseLang(o.esperado || '');
  const ouvido = baseLang(o.conferido?.idioma || '');
  if (!esperado || !ouvido || ouvido === esperado) return null;
  if (o.audioMs < FALA_MINIMA_DO_FORA_DO_PAR_MS) return null;
  if ((o.conferido?.confianca ?? 0) < (o.limiar ?? CONFIANCA_DO_FORA_DO_PAR)) return null;
  return ouvido;
}
