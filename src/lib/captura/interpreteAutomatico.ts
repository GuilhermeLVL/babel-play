/**
 * O MODO AUTOMÁTICO DO INTÉRPRETE (E7 da Fase E; pedido do dono, 30/09) — a regra, pura.
 *
 * No modo por toque, o LADO tocado diz o idioma. No automático ninguém toca: o microfone fica aberto,
 * o idioma de cada fala é MEDIDO PELO ÁUDIO (o Whisper, na nuvem ou no aparelho; a Web Speech não
 * sabe detectar idioma) e é ele que diz de que metade a fala veio e para qual idioma traduzir.
 *
 * AS PISTAS, da mais forte à mais fraca:
 *   1. o idioma que o MOTOR mediu no áudio é um dos dois da conversa;
 *   2. o motor apontou outro, mas o detector de TEXTO diz que é um dos dois — o Whisper troca idiomas
 *      vizinhos em fala curta (português por galego, espanhol por catalão), e o texto transcrito não;
 *   3. um TERCEIRO idioma, só com evidência forte: motor e texto concordam, ou a fala é longa e o motor
 *      está confiante. É "a outra pessoa" falando outra língua: vai para o idioma do dono do aparelho,
 *      e a resposta do dono vai para essa língua, até a outra pessoa voltar ao idioma combinado;
 *   4. sem evidência: a conversa alterna — fala agora quem não falou por último (o dono primeiro).
 *
 * O ESTADO (quem falou por último, o terceiro idioma em uso) é de quem chama: o controle do
 * intérprete o guarda por conversa. Aqui entra um e sai o próximo.
 */
import { baseLang } from '@core/texto/idioma';

import { toBcp47 } from '../languages';
import type { IdiomasDoInterprete } from './interprete';
import type { LadoDoInterprete } from './tiposDaFala';

/** O que se sabe do idioma de uma fala, depois do final. */
export interface PistasDoIdioma {
  /** ISO-639-1 medido pelo motor NO ÁUDIO (`''` = o motor não informou). */
  idiomaDoMotor: string;
  /** 0..1 quando o motor a informa (o Whisper local). */
  confianca?: number;
  /** ISO-639-1 do detector de TEXTO sobre a transcrição (`''` = não soube). */
  idiomaDoTexto: string;
  /** A duração da fala: fala curta é evidência fraca. */
  audioMs: number;
}

export interface EstadoDoAutomatico {
  /** Quem falou por último; `null` antes da primeira fala. */
  ultimoLado: LadoDoInterprete | null;
  /** O terceiro idioma que a outra pessoa está usando (ISO-639-1), ou `null` (o combinado). */
  estrangeiro: string | null;
}

export const ESTADO_DO_AUTOMATICO: EstadoDoAutomatico = Object.freeze({ ultimoLado: null, estrangeiro: null });

export interface DecisaoDoLado {
  /** De que metade a fala veio. */
  lado: LadoDoInterprete;
  /** ISO-639-1: o idioma da fala e o da tradução. */
  de: string;
  para: string;
  /** O BCP-47 em que a tradução é LIDA (a voz de quem ouve). */
  fala: string;
  /** A fala é de um idioma fora dos dois da conversa. */
  terceiro: boolean;
  /** Não houve evidência do idioma: o lado veio da alternância. */
  palpite: boolean;
  /** O estado para a próxima fala. */
  estado: EstadoDoAutomatico;
}

/** Fala mais curta que isto não sustenta, sozinha, um terceiro idioma. */
const MS_DO_TERCEIRO_SEM_TEXTO = 2500;
const CONFIANCA_DO_TERCEIRO_SEM_TEXTO = 0.8;
/** Com motor e texto de acordo, basta a fala não ser um estalo. */
const MS_DO_TERCEIRO_COM_TEXTO = 1200;

const bcp47 = (idioma: string): string => {
  const l = (idioma || '').trim().replace('_', '-');
  return l.includes('-') ? l : toBcp47(l) || l;
};

export function decidirLadoDaFala(
  pistas: PistasDoIdioma,
  idiomas: IdiomasDoInterprete,
  estado: EstadoDoAutomatico,
): DecisaoDoLado {
  const meu = baseLang(idiomas.meu);
  const outro = baseLang(idiomas.outro);
  const motor = baseLang(pistas.idiomaDoMotor || '');
  const texto = baseLang(pistas.idiomaDoTexto || '');
  const doPar = (l: string) => !!l && (l === meu || l === outro);

  const doMeuLado = (palpite: boolean): DecisaoDoLado => {
    /* A minha resposta vai para a língua que a outra pessoa está falando AGORA. */
    const para = estado.estrangeiro ?? outro;
    return {
      lado: 'meu',
      de: meu,
      para,
      fala: estado.estrangeiro ? bcp47(estado.estrangeiro) : bcp47(idiomas.outro),
      terceiro: false,
      palpite,
      estado: { ...estado, ultimoLado: 'meu' },
    };
  };
  const doOutroLado = (de: string, terceiro: boolean, palpite: boolean): DecisaoDoLado => ({
    lado: 'outro',
    de,
    para: meu,
    fala: bcp47(idiomas.meu),
    terceiro,
    palpite,
    /* O idioma combinado de volta apaga o terceiro; um terceiro novo o troca. */
    estado: { ultimoLado: 'outro', estrangeiro: terceiro ? de : null },
  });
  const pelo = (l: string) => (l === meu ? doMeuLado(false) : doOutroLado(outro, false, false));

  if (doPar(motor)) return pelo(motor);
  if (doPar(texto)) return pelo(texto);

  const terceiroForte =
    !!motor &&
    ((texto === motor && pistas.audioMs >= MS_DO_TERCEIRO_COM_TEXTO) ||
      (!texto &&
        pistas.audioMs >= MS_DO_TERCEIRO_SEM_TEXTO &&
        (pistas.confianca ?? 0) >= CONFIANCA_DO_TERCEIRO_SEM_TEXTO));
  if (terceiroForte) return doOutroLado(motor, true, false);

  /* Sem evidência: alterna. O dono do aparelho começa. */
  return estado.ultimoLado === 'meu' ? doOutroLado(estado.estrangeiro ?? outro, false, true) : doMeuLado(true);
}
