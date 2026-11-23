/**
 * LOCALAGREEMENT-2 (change `parciais-incrementais`, D4; ufal/whisper_streaming, MIT): dadas as hipóteses SUCESSIVAS
 * do mesmo trecho de fala, o prefixo em que as duas últimas CONCORDAM fica CONFIRMADO e nunca mais regride; o resto
 * da hipótese atual é a cauda PROVISÓRIA. A cauda é mostrada de imediato (só muda o estilo na tela): diferente da
 * "fila da legenda" reprovada no ciclo 1, nada espera.
 *
 * PURO: sem React, sem rede, sem DOM. O estado é imutável (`avancar` devolve o próximo).
 *
 * - "Palavra" = chunk entre espaços; escrita sem espaço (chinês, japonês, tailandês...) conta um caractere por
 *   palavra, a mesma regra de `medidasDeParcial.ts`. A concordância compara a forma NORMALIZADA (minúscula, sem
 *   acento e sem pontuação, `tokenizar`): "Hello," concorda com "hello".
 * - O texto confirmado é o que estava na hipótese quando concordou (pontuação inclusa) e não muda mais. Se uma
 *   hipótese posterior discorda do confirmado, a posição manda: o confirmado fica e a cauda é o que a hipótese tem
 *   DEPOIS dele. Se a hipótese encolhe, o confirmado fica e a cauda some.
 * - A primeira hipótese não confirma nada (precisa de duas).
 * - `avancar` deve receber UMA hipótese por decode COMPLETO. O texto que cresce token a token DENTRO de um decode
 *   (`onUpdate`) concorda sempre com o decode anterior dele mesmo: use `visualizar` para pintá-lo, sem avançar.
 */
import { SEM_ESPACO, tokenizar } from './medidasDeParcial';

export interface Unidade {
  /** Separador que vinha antes dela no texto (' ' ou ''). */
  sep: string;
  txt: string;
  /** Forma normalizada (vazia = só pontuação). */
  chave: string;
}

export interface EstadoLocalAgreement {
  /** As chaves da hipótese anterior. */
  readonly anterior: readonly string[];
  /** O prefixo confirmado, como foi mostrado quando concordou. */
  readonly confirmadas: readonly Unidade[];
}

export interface VistaDoParcial {
  /** O prefixo confirmado (nunca regride). */
  confirmado: string;
  /** A cauda ainda não confirmada, sem o espaço de junção. */
  provisorio: string;
  /** O que pintar: `confirmado` + a cauda, com o espaço entre eles quando há. */
  texto: string;
}

export interface ResultadoDoLocalAgreement extends VistaDoParcial {
  estado: EstadoLocalAgreement;
}

export function novoLocalAgreement(): EstadoLocalAgreement {
  return { anterior: [], confirmadas: [] };
}

export function unidadesDe(texto: string): Unidade[] {
  const saida: Unidade[] = [];
  let sep = '';
  for (const m of String(texto ?? '').matchAll(/(\s+)|(\S+)/gu)) {
    if (m[1]) {
      sep = ' ';
      continue;
    }
    const chunk = m[2];
    const doChunk: Unidade[] = [];
    let atual: string | null = null;
    for (const ch of chunk) {
      if (SEM_ESPACO.test(ch)) {
        if (atual !== null) doChunk.push({ sep: '', txt: atual, chave: '' });
        atual = ch;
      } else atual = (atual ?? '') + ch;
    }
    if (atual !== null) doChunk.push({ sep: '', txt: atual, chave: '' });
    if (doChunk.length) doChunk[0].sep = sep;
    sep = '';
    for (const u of doChunk) u.chave = tokenizar(u.txt).join(' ');
    // Só pontuação ("—", "..."): cola na palavra anterior em vez de virar uma palavra.
    if (doChunk.length === 1 && !doChunk[0].chave && saida.length) {
      const ant = saida[saida.length - 1];
      ant.txt += doChunk[0].sep + doChunk[0].txt;
      continue;
    }
    saida.push(...doChunk);
  }
  return saida;
}

const juntar = (us: readonly Unidade[]): string => us.map((u) => u.sep + u.txt).join('');

function vista(confirmadas: readonly Unidade[], h: readonly Unidade[]): VistaDoParcial {
  const cauda = h.slice(confirmadas.length);
  const confirmado = juntar(confirmadas).trim();
  const provisorio = juntar(cauda).trim();
  const junta = cauda.length && confirmadas.length ? cauda[0].sep : '';
  return { confirmado, provisorio, texto: confirmado + junta + provisorio };
}

/** Pinta uma hipótese PARCIAL de um decode em curso (token a token) sem avançar a concordância. */
export function visualizar(estado: EstadoLocalAgreement, hipotese: string): VistaDoParcial {
  return vista(estado.confirmadas, unidadesDe(hipotese));
}

/** Entrega a hipótese de um decode COMPLETO e devolve o próximo estado e o que pintar. */
export function avancar(estado: EstadoLocalAgreement, hipotese: string): ResultadoDoLocalAgreement {
  const h = unidadesDe(hipotese);
  const chaves = h.map((u) => u.chave);
  let n = 0;
  while (n < estado.anterior.length && n < chaves.length && estado.anterior[n] === chaves[n]) n++;
  const confirmadas =
    n > estado.confirmadas.length
      ? [...estado.confirmadas, ...h.slice(estado.confirmadas.length, n)]
      : estado.confirmadas;
  return { estado: { anterior: chaves, confirmadas }, ...vista(confirmadas, h) };
}
