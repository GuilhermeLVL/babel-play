/**
 * UM SETTER POR QUADRO ("Grátis sem travar", A1).
 *
 * O streaming do decode (um `update` a cada ~120 ms por fala) e o progresso dos modelos chegam em
 * rajada, e cada evento era um `setState` da tela da captura — que é grande: no aparelho fraco um
 * render dela custava mais que o intervalo entre dois eventos, e a thread principal parava de pintar
 * justo enquanto a legenda devia crescer. Ninguém vê mais de uma atualização por quadro; aqui as de um
 * mesmo quadro viram UMA chamada.
 *
 * A SEMÂNTICA NÃO MUDA: as ações do quadro são aplicadas NA ORDEM, cada uma sobre o resultado da
 * anterior, numa só função atualizadora — o mesmo estado que o React produziria recebendo-as uma a
 * uma. O que não pode esperar (o final de uma fala, o "pronto" de um modelo) vai por `agora`, que
 * aplica os pendentes ANTES dele e na mesma chamada: um parcial velho nunca cai por cima de um final.
 */
import type { Dispatch, SetStateAction } from 'react';

/** Sem `requestAnimationFrame` (teste em node, ambiente sem pintura): um quadro de 60 Hz. */
const QUADRO_MS = 16;
/**
 * Aba escondida não tem quadro (o `requestAnimationFrame` só volta quando ela aparece), e a captura
 * segue ouvindo com a aba escondida — o "só ouvir". Esta rede de segurança aplica mesmo assim; em
 * segundo plano o navegador a espaça para ~1 s, o que também serve.
 */
const REDE_DE_SEGURANCA_MS = 100;

/** Chama `fn` uma vez: no próximo quadro ou na rede de segurança, o que vier antes. */
function noProximoQuadro(fn: () => void): void {
  let feito = false;
  let quadro: number | null = null;
  const rodar = () => {
    if (feito) return;
    feito = true;
    if (quadro !== null) cancelAnimationFrame(quadro);
    clearTimeout(rede);
    fn();
  };
  const temQuadro = typeof requestAnimationFrame === 'function';
  const rede = setTimeout(rodar, temQuadro ? REDE_DE_SEGURANCA_MS : QUADRO_MS);
  if (temQuadro) quadro = requestAnimationFrame(rodar);
}

interface SetterNoQuadro<T> {
  /** Agenda para o próximo quadro, junto (e na ordem) com as outras do mesmo quadro. */
  (acao: SetStateAction<T>): void;
  /** Aplica AGORA os pendentes e mais esta, numa chamada só. Sem pendentes, repassa a ação como veio. */
  agora: (acao: SetStateAction<T>) => void;
}

/**
 * Um agendador POR SETTER, não por chamada: a fábrica do pipeline (`criarPipelineDeFala`) roda a cada
 * render, e o parcial agendado pelos handlers de um render precisa ir na mesma fila que o final
 * aplicado pelos do render seguinte. O `setState` do React é estável, então ele é a chave.
 */
const porSetter = new WeakMap<object, unknown>();

export function setterNoQuadro<T>(set: Dispatch<SetStateAction<T>>): SetterNoQuadro<T> {
  const existente = porSetter.get(set);
  if (existente) return existente as SetterNoQuadro<T>;

  let fila: SetStateAction<T>[] = [];
  let agendado = false;
  const emSequencia =
    (acoes: SetStateAction<T>[]) =>
    (anterior: T): T =>
      acoes.reduce<T>((s, a) => (typeof a === 'function' ? (a as (p: T) => T)(s) : a), anterior);
  const descarregar = () => {
    agendado = false;
    // `agora` pode ter levado a fila antes do quadro: aí não há o que aplicar.
    if (!fila.length) return;
    const acoes = fila;
    fila = [];
    set(emSequencia(acoes));
  };

  const agendar = ((acao: SetStateAction<T>) => {
    fila.push(acao);
    if (agendado) return;
    agendado = true;
    noProximoQuadro(descarregar);
  }) as SetterNoQuadro<T>;
  agendar.agora = (acao) => {
    if (!fila.length) {
      set(acao);
      return;
    }
    const acoes = [...fila, acao];
    fila = [];
    set(emSequencia(acoes));
  };
  porSetter.set(set, agendar);
  return agendar;
}
