/**
 * QUAIS VOZES VALE OFERECER — o macOS lista, junto com as vozes de verdade, vozes de EFEITO (Wobble, Bells, Zarvox…),
 * as Eloquence (Eddy, Grandma…) e vozes antigas e robóticas (Fred, Junior, Kathy, Ralph). A régua é a LISTA DE
 * PERMISSÃO de `melhorVoz.ts` (`nivelDaVoz`): só voz reconhecida como humana entra, e uma recusada nunca volta como
 * "último recurso" (voz de robô não é melhor que nenhuma: sem voz aceita, o app não fala e mostra o texto).
 */
import { ordenarPorQualidade, type VozDescrita } from './melhorVoz';

/** As vozes aceitas do idioma, da melhor para a pior. Vazia quando o idioma só tem vozes recusadas. */
export function vozesUteis<T extends VozDescrita>(vozes: readonly T[], idioma: string): T[] {
  return ordenarPorQualidade(vozes, idioma);
}

/**
 * Há, para o idioma, uma voz ACEITA pela lista de permissão de `melhorVoz.ts`? Com a voz natural no aparelho ligada
 * (flag `voz_kitten`), sem voz aceita a Kitten lê no lugar da voz do sistema (`vozKitten.ts`).
 */
export const haVozAceita = (vozes: readonly VozDescrita[], idioma: string): boolean =>
  vozesUteis(vozes, idioma).length > 0;
