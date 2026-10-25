import type { FalaDoAssistente } from '../../core/assistente/telaDoAssistente';
import type { SpeechSegment } from '../captura/tiposDaFala';

/** Quantas falas da sessão o assistente ao vivo acompanha (mais que as 24 da janela flutuante: a página se relê). */
export const FALAS_DO_ASSISTENTE = 60;

/**
 * AS FALAS QUE O ASSISTENTE AO VIVO ACOMPANHA (Fase C3), a partir das falas da sessão: as últimas com texto, com o LADO
 * de quem falou e o idioma.
 *
 * - Na captura: o som do computador (`system`) é "eles"; o microfone é "você".
 * - No Intérprete, as duas pessoas falam no mesmo microfone: é a METADE que diz. A da pessoa (`meu`, ou `outro` com os
 *   lados trocados — `direcaoDoLado`) é "você", e é só nela que a correção gentil (opt-in) cai. A fala sem idioma
 *   declarado leva o do lado: sem ele, a fala da pessoa no idioma dela contaria como estrangeira e iria à nuvem.
 */
export function falasDoAssistente(
  falas: ReadonlyArray<Pick<SpeechSegment, 'id' | 'originalText' | 'source' | 'isPartial' | 'lado' | 'lang'>>,
  o: { trocados: boolean; idiomaDaPessoa: string; idiomaDoOutro: string; limite?: number },
): FalaDoAssistente[] {
  const limite = o.limite ?? FALAS_DO_ASSISTENTE;
  const ultimas: Array<(typeof falas)[number]> = [];
  for (let i = falas.length - 1; i >= 0 && ultimas.length < limite; i--) {
    const s = falas[i];
    if (s.originalText && s.originalText.trim()) ultimas.unshift(s);
  }
  return ultimas.map((s): FalaDoAssistente => {
    const daPessoa = s.lado ? (s.lado === 'meu') !== o.trocados : s.source !== 'system';
    const doLado = s.lado ? (daPessoa ? o.idiomaDaPessoa : o.idiomaDoOutro) : '';
    return {
      id: s.id,
      original: s.originalText,
      lado: daPessoa ? 'voce' : 'eles',
      lang: s.lang || doLado || undefined,
      parcial: !!s.isPartial,
    };
  });
}
