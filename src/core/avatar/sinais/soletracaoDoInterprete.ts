/**
 * QUANDO O AVATAR-INTÉRPRETE SOLETRA (regras puras, sem React nem DOM).
 *
 * A soletração é um COMPLEMENTO visual da fala traduzida: nunca atrasa nem bloqueia a legenda nem a voz. Só soletra
 * NOMES PRÓPRIOS (o dicionário de sinais está vazio: não há como saber que palavra tem sinal, então nada além de nomes
 * é soletrado), com teto de tempo por fala, e PULA tudo quando a fila de voz está atrasada.
 *
 * SOLETRAÇÃO do alfabeto manual, não tradução para Libras/ASL; poses de demonstração NÃO revisadas por pessoas surdas.
 */
import { normalizarTexto } from './normalizar';
import type { Lingua } from './tipos';

export type EscolhaDeAlfabeto = 'auto' | 'libras' | 'asl';
export const ESCOLHAS_DE_ALFABETO: readonly EscolhaDeAlfabeto[] = ['auto', 'libras', 'asl'];

export type RitmoDaSoletracao = 'lenta' | 'normal' | 'rapida';
export const RITMOS_DA_SOLETRACAO: readonly RitmoDaSoletracao[] = ['lenta', 'normal', 'rapida'];
export const VELOCIDADE_DO_RITMO: Readonly<Record<RitmoDaSoletracao, number>> = { lenta: 0.7, normal: 1, rapida: 1.4 };

/** Tempo máximo de soletração por fala (já com a velocidade). O que não cabe fica "não soletrado". */
export const TETO_DA_FALA_MS = 8_000;
/** Quantas falas podem esperar na fila de voz para a soletração ainda valer a pena. Acima disso, ela é pulada. */
export const FILA_MAXIMA_PARA_SOLETRAR = 1;

/**
 * O alfabeto: a escolha manual vence; no automático vem do idioma da OUTRA pessoa (português = Libras, inglês = ASL).
 * Outro idioma: `null` (sem alfabeto conhecido, a soletração não acontece e a tela diz por quê).
 */
export function alfabetoDaConversa(
  escolha: EscolhaDeAlfabeto,
  idiomaDaOutra: string | null | undefined,
): Lingua | null {
  if (escolha !== 'auto') return escolha;
  const base = (idiomaDaOutra ?? '').toLowerCase().split(/[-_]/u)[0];
  if (base === 'pt') return 'libras';
  if (base === 'en') return 'asl';
  return null;
}

/** Os nomes próprios soletráveis do texto: ao menos 2 letras (palavras de 1 letra não gastam o teto). */
export function nomesProprios(texto: string, alfabeto: Lingua): string[] {
  return normalizarTexto(texto, alfabeto)
    .palavras.filter((p) => p.nomeProprio && p.letras >= 2)
    .map((p) => p.texto);
}

export interface EntradaDaDecisao {
  /** A opção "Soletrar nomes e palavras sem sinal", já somada às flags e ao suporte do modelo. */
  ligada: boolean;
  /** A fala que a voz lê agora (a tradução). `null` = ninguém fala. */
  item: { id: string; texto: string; manual?: boolean | undefined } | null;
  /** Quantas falas esperam atrás desta na fila de voz. */
  naFila: number;
  alfabeto: Lingua | null;
  ritmo: RitmoDaSoletracao;
  espelhar: boolean;
}

export type MotivoDaPulada = 'fila' | 'sem_alfabeto';

export type DecisaoDeSoletracao =
  | { tipo: 'desligada' }
  /** Nada a soletrar agora (ninguém fala, é toque no texto, ou a fala não tem nome próprio). */
  | { tipo: 'nada' }
  | { tipo: 'pulada'; motivo: MotivoDaPulada }
  | {
      tipo: 'soletrar';
      id: string;
      texto: string;
      alfabeto: Lingua;
      nomes: string[];
      velocidade: number;
      tetoMs: number;
      espelhar: boolean;
    };

/** A decisão por fala. Pura: a mesma entrada dá sempre a mesma saída, e nada aqui espera por rede ou por tempo. */
export function decidirSoletracao(e: EntradaDaDecisao): DecisaoDeSoletracao {
  if (!e.ligada) return { tipo: 'desligada' };
  if (!e.item || e.item.manual) return { tipo: 'nada' };
  if (!e.alfabeto) return { tipo: 'pulada', motivo: 'sem_alfabeto' };
  const nomes = nomesProprios(e.item.texto, e.alfabeto);
  if (nomes.length === 0) return { tipo: 'nada' };
  if (e.naFila > FILA_MAXIMA_PARA_SOLETRAR) return { tipo: 'pulada', motivo: 'fila' };
  return {
    tipo: 'soletrar',
    id: e.item.id,
    texto: e.item.texto,
    alfabeto: e.alfabeto,
    nomes,
    velocidade: VELOCIDADE_DO_RITMO[e.ritmo],
    tetoMs: TETO_DA_FALA_MS,
    espelhar: e.espelhar,
  };
}

/**
 * O que o painel diz sobre a opção. Os dois avisos fixos aparecem SEMPRE que a soletração está ligada; o motivo é o
 * que explica a opção desabilitada.
 */
export type SuporteDoInterprete =
  | { estado: 'verificando' }
  | { estado: 'sim' }
  | { estado: 'nao'; motivo: MotivoDoPainel };

export type MotivoDoPainel =
  | 'sem_dedos'
  | 'sem_braco'
  | 'sem_ossos_reconheciveis'
  | 'sem_modelo'
  | 'sem_3d'
  | 'sem_interprete'
  | 'maos_minusculas';

/**
 * O modelo do intérprete tem dedos, mas as mãos são pequenas demais para a soletração ser legível (Milk): a opção fica
 * desabilitada com o motivo, em vez de mostrar mãos que ninguém consegue ler. Só troca o "sim"; os outros estados mandam.
 */
export function suporteComModelo(
  s: SuporteDoInterprete,
  modelo: { maosMinusculas?: boolean } | null,
): SuporteDoInterprete {
  return s.estado === 'sim' && modelo?.maosMinusculas === true ? { estado: 'nao', motivo: 'maos_minusculas' } : s;
}

export function soletracaoDisponivel(s: SuporteDoInterprete): boolean {
  return s.estado === 'sim';
}
