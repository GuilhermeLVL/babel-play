/**
 * OS IDIOMAS DA CONVERSA VIRTUAL, MEDIDOS FALA A FALA — a regra, pura.
 *
 * Numa chamada ou num jogo, "Eles" podem ser várias pessoas falando idiomas diferentes (um lobby, uma
 * reunião): o idioma de cada fala é MEDIDO pelo áudio (o Whisper) em vez de fixo, e é ele que diz de que
 * idioma traduzir para o meu. O que eu respondo vai para o idioma de quem falou por último — "a pessoa
 * com quem estou falando agora".
 *
 * AS PISTAS de "Eles", da mais forte à mais fraca:
 *   1. motor e detector de texto concordam;
 *   2. o motor mediu um idioma que já está na conversa (o meu, o combinado, ou um já ouvido);
 *   3. o detector de texto aponta um idioma que já está na conversa — o Whisper troca idiomas vizinhos em
 *      fala curta (português por galego, espanhol por catalão), o texto transcrito não;
 *   4. um idioma NOVO, só com evidência forte: fala longa e o motor confiante, ou fala longa e só o texto;
 *   5. sem evidência: o do último que falou (ou o combinado). É palpite.
 * "Você" é sempre o meu idioma; só o destino muda (o último idioma que ouvi de "Eles"), e se eu já estou
 * falando o idioma do destino, não há o que traduzir.
 */
import { baseLang } from '@core/texto/idioma';

import type { PistasDoIdioma } from './interpreteAutomatico';

export type FonteDaVirtual = 'eles' | 'voce';

export interface EstadoDaVirtual {
  /** O último idioma (ISO-639-1) que "Eles" falaram e que não é o meu: para onde vai a minha resposta. */
  ultimoDeles: string | null;
  /** Os idiomas já ouvidos de "Eles", do mais antigo ao mais novo (sem repetir). */
  ouvidos: readonly string[];
}

export const ESTADO_DA_VIRTUAL: EstadoDaVirtual = Object.freeze({ ultimoDeles: null, ouvidos: [] });

export interface DecisaoDaVirtual {
  /** ISO-639-1: o idioma da fala e o da tradução. */
  de: string;
  para: string;
  /** `de` e `para` são o mesmo idioma: nada a traduzir. */
  semTraducao: boolean;
  /** Não houve evidência: o idioma veio do último que falou. */
  palpite: boolean;
  estado: EstadoDaVirtual;
}

/** Fala curta não sustenta, sozinha, um idioma novo. */
const MS_DO_IDIOMA_NOVO = 2000;
const CONFIANCA_DO_IDIOMA_NOVO = 0.7;
/** Acima disto o motor é crível no que mede, mesmo sem o texto concordar. */
const MS_DE_FALA_LONGA = 3000;
/** Quantos idiomas o estado guarda (um lobby não tem dez). */
const MAX_OUVIDOS = 6;

export function decidirNaVirtual(
  fonte: FonteDaVirtual,
  pistas: PistasDoIdioma,
  idiomas: { meu: string; outro: string },
  estado: EstadoDaVirtual,
): DecisaoDaVirtual {
  const meu = baseLang(idiomas.meu);
  const outro = baseLang(idiomas.outro);
  const motor = baseLang(pistas.idiomaDoMotor || '');
  const texto = baseLang(pistas.idiomaDoTexto || '');
  const destinoDeVoce = estado.ultimoDeles ?? outro;

  if (fonte === 'voce') {
    /* Eu falo o meu idioma. Só se o áudio e o texto concordam que já falo o do destino, não traduz. */
    const jaFaloODoDestino = !!motor && motor === texto && motor === destinoDeVoce && motor !== meu;
    const de = jaFaloODoDestino ? destinoDeVoce : meu;
    return { de, para: destinoDeVoce, semTraducao: de === destinoDeVoce, palpite: false, estado };
  }

  const conhecidos = new Set([meu, outro, ...estado.ouvidos].filter(Boolean));
  const naConversa = (l: string) => !!l && conhecidos.has(l);
  const longa = pistas.audioMs >= MS_DE_FALA_LONGA;
  const confiavel = (pistas.confianca ?? 0) >= CONFIANCA_DO_IDIOMA_NOVO;

  let de = '';
  if (motor && motor === texto) de = motor;
  else if (naConversa(motor)) de = motor;
  else if (naConversa(texto)) de = texto;
  else if (motor && pistas.audioMs >= MS_DO_IDIOMA_NOVO && (confiavel || (longa && !texto))) de = motor;
  else if (!motor && texto && longa) de = texto;

  const palpite = !de;
  if (!de) de = estado.ultimoDeles ?? outro;

  if (de === meu) return { de, para: meu, semTraducao: true, palpite, estado };

  /* Um idioma que não é o meu: é com ele que eu vou responder. Sem evidência, o estado não muda. */
  const proximo: EstadoDaVirtual = palpite
    ? estado
    : {
        ultimoDeles: de,
        ouvidos: [...estado.ouvidos.filter((l) => l !== de), de].slice(-MAX_OUVIDOS),
      };
  return { de, para: meu, semTraducao: false, palpite, estado: proximo };
}
