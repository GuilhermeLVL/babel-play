/**
 * ELENCO (M5): quem fala e com que emoção, por frase. Tipos do núcleo puro (sem DOM, rede nem IA).
 * A heurística (`marcador.ts`) e a futura função de IA do servidor produzem o MESMO formato (`FraseMarcada`).
 */
import type { EmocaoDoAvatar } from '../estados';

export type TipoDeFalante = 'narrador' | 'personagem' | 'desconhecido';

export interface Falante {
  tipo: TipoDeFalante;
  /** Só em `personagem`, e SEMPRE um nome da lista de personagens da ficha (nunca inventado). */
  nome?: string;
}

export interface FraseMarcada {
  /** Posição na lista devolvida (0..n-1). Quando uma frase passa de 600 caracteres e é partida, cada pedaço tem o seu. */
  indice: number;
  texto: string;
  falante: Falante;
  emocao: EmocaoDoAvatar;
  /** 0..1. Abaixo de `CONFIANCA_MINIMA` quem consome trata como `neutro`/voz do narrador. */
  confianca: number;
}

/** Frase de entrada: texto puro ou objeto com `texto` (o `FraseDoTexto` do leitor serve). */
export type FraseDeEntrada = string | { texto: string };

export interface OpcoesDoMarcador {
  /** 'pt' | 'en' | 'es' (ou 'pt-BR'...). Outro idioma: só as pistas estruturais (aspas, travessão, nomes). */
  idioma?: string;
  /** Os nomes da ficha do livro. Só estes podem ser falante. */
  personagens: readonly string[];
  /** Teto de tempo da marcação (ms). Passou, o resto sai como narrador/neutro com confiança 0. Padrão 1500. */
  orcamentoMs?: number;
}

/** Abaixo disto a emoção e a voz da personagem não são aplicadas (a frase fala como narração/neutro). */
export const CONFIANCA_MINIMA = 0.5;

/** Versão do marcador: entra na chave do cache (mudou a heurística ou o prompt, as marcações antigas deixam de valer). */
export const VERSAO_DO_MARCADOR = 1;

export interface ChaveDoElenco {
  livroId: string;
  capituloId: string;
  versaoDoMarcador: number;
  /** Hash do texto do capítulo que foi marcado (outro texto, outra chave). O servidor usa SHA-256. */
  hashDoTexto: string;
}

export const chaveDoElencoComoTexto = (c: ChaveDoElenco): string =>
  [c.livroId, c.capituloId, String(c.versaoDoMarcador), c.hashDoTexto].join('\u0000');

/** FNV-1a de 32 bits em hexa: barato e síncrono, para a chave local. NÃO é criptográfico. */
export function hashDoTexto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + texto.length.toString(16);
}
