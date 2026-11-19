/**
 * DEPOIS DA PRIMEIRA PINTURA GRANDE (carga-rapida-no-celular, 2.2).
 *
 * No celular com 4G lento, tudo o que o boot pede disputa a mesma banda que a primeira tela: a auditoria de
 * 17/11/2026 mediu o LCP do `/app` em 7,4 s com o iChat, as ofertas, as partículas e a voz descendo junto com
 * o Início. O que não desenha o Início espera aqui: o primeiro `largest-contentful-paint` E a tela de verdade
 * montada (`avisarTelaPronta`: com o esqueleto do HTML, o LCP chega antes do React), com teto de 6 s para o
 * navegador sem a métrica (Safari) e para as telas que não avisam; depois, um intervalo ocioso (teto de 2 s).
 *
 * `quandoPassarOLcp(cb)` roda `cb` uma vez nesse momento; `useDepoisDoLcp()` é o mesmo como estado do React.
 */
import { useEffect, useState } from 'react';

type ComOcioso = typeof globalThis & {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
};

/** Teto da espera pelo LCP e pela tela (ms): sem a métrica, ou numa tela que não avisa. */
export const TETO_DO_LCP_MS = 6000;
/** Teto do ocioso depois do LCP (ms). */
const TETO_DO_OCIOSO_MS = 2000;

let passou = false;
let fila: Array<() => void> = [];
let armado = false;
let lcpVisto = false;
let telaPronta = false;
let seguir: (() => void) | null = null;

/** A primeira tela de verdade montou (o Início chama). */
export function avisarTelaPronta(): void {
  telaPronta = true;
  if (lcpVisto) seguir?.();
}

function liberar(): void {
  if (passou) return;
  passou = true;
  const pendentes = fila;
  fila = [];
  for (const f of pendentes) {
    try {
      f();
    } catch {
      /* um adiado que falha não impede os outros */
    }
  }
}

function armar(): void {
  if (armado) return;
  armado = true;
  if (typeof window === 'undefined') {
    liberar();
    return;
  }
  const g = globalThis as ComOcioso;
  let ocioso = false;
  const aoOcioso = () => {
    if (ocioso) return;
    ocioso = true;
    if (typeof g.requestIdleCallback === 'function') g.requestIdleCallback(liberar, { timeout: TETO_DO_OCIOSO_MS });
    else window.setTimeout(liberar, 200);
  };
  window.setTimeout(aoOcioso, TETO_DO_LCP_MS);
  try {
    seguir = aoOcioso;
    const obs = new PerformanceObserver(() => {
      obs.disconnect();
      lcpVisto = true;
      if (telaPronta) aoOcioso();
    });
    obs.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* sem PerformanceObserver ou sem o tipo: fica o teto */
  }
}

/** Roda `cb` uma vez, depois do LCP e de um ocioso (na hora, se isso já passou). */
export function quandoPassarOLcp(cb: () => void): void {
  if (passou) {
    cb();
    return;
  }
  fila.push(cb);
  armar();
}

/** `true` depois do LCP e de um ocioso. */
export function useDepoisDoLcp(): boolean {
  const [ja, setJa] = useState(passou);
  useEffect(() => {
    if (ja) return;
    let vivo = true;
    quandoPassarOLcp(() => {
      if (vivo) setJa(true);
    });
    return () => {
      vivo = false;
    };
  }, [ja]);
  return ja;
}

/** Só para os testes. */
export function zerarDepoisDoLcpParaTeste(): void {
  passou = false;
  fila = [];
  armado = false;
  lcpVisto = false;
  telaPronta = false;
  seguir = null;
}
