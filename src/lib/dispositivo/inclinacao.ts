/**
 * A INCLINAÇÃO DO APARELHO — o que no computador segue o ponteiro, no celular segue o giroscópio.
 *
 * Luz que acompanha o cursor, cartão que se inclina, brilho que desliza: nada disso existe num
 * aparelho sem mouse. Em vez de perder o efeito, o celular o recebe pelo sensor de movimento. Quem
 * assina `assinarInclinacao` recebe sempre o mesmo par `{ x, y }` entre -1 e 1, venha ele do sensor
 * (celular) ou do ponteiro (computador), e não precisa saber de onde veio.
 *
 * Três cuidados, medidos no protótipo de polimento (07/10/2026):
 *
 *   - O JEITO DE SEGURAR É O ZERO. Ninguém segura o celular reto. A primeira leitura vira o ponto
 *     neutro, e ele acompanha a postura aos poucos: só o MOVIMENTO conta, não a posição.
 *   - NO IPHONE O SENSOR PEDE LICENÇA, e só dentro de um toque (`pedirLicencaDoSensor`).
 *   - QUEM PEDIU MENOS MOVIMENTO não recebe nada: a assinatura só entrega com o movimento rico.
 */
import { movimentoRico } from '../movimento/animar';

export interface Inclinacao {
  /** -1 (esquerda para baixo) a 1 (direita para baixo). */
  x: number;
  /** -1 (topo para trás) a 1 (topo para a frente). */
  y: number;
}

export interface EstadoDaInclinacao {
  betaNeutro: number | null;
  gamaNeutro: number | null;
}

/** Graus de inclinação que levam o valor de 0 a 1. Com 22° o efeito responde sem exigir contorção. */
const GRAUS_PARA_O_MAXIMO = 22;
/** Quanto o ponto neutro anda em direção à postura atual a cada leitura (o sensor lê ~60 vezes/s). */
const DERIVA_DO_NEUTRO = 0.004;

export const novoEstadoDaInclinacao = (): EstadoDaInclinacao => ({ betaNeutro: null, gamaNeutro: null });

const limitar = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Uma leitura do sensor (`beta`: frente/trás, `gama`: esquerda/direita, em graus) vira a inclinação
 * relativa ao jeito de segurar. Muda `estado` (o ponto neutro) e devolve o par entre -1 e 1.
 */
export function passoDaInclinacao(estado: EstadoDaInclinacao, beta: number, gama: number): Inclinacao {
  if (estado.betaNeutro === null || estado.gamaNeutro === null) {
    estado.betaNeutro = beta;
    estado.gamaNeutro = gama;
  }
  estado.betaNeutro += (beta - estado.betaNeutro) * DERIVA_DO_NEUTRO;
  estado.gamaNeutro += (gama - estado.gamaNeutro) * DERIVA_DO_NEUTRO;
  return {
    x: limitar((gama - estado.gamaNeutro) / GRAUS_PARA_O_MAXIMO),
    y: limitar((beta - estado.betaNeutro) / GRAUS_PARA_O_MAXIMO),
  };
}

/** A posição do ponteiro na janela vira o mesmo par: o centro é 0, as bordas são -1 e 1. */
export function inclinacaoDoPonteiro(clientX: number, clientY: number, largura: number, altura: number): Inclinacao {
  if (largura <= 0 || altura <= 0) return { x: 0, y: 0 };
  return { x: limitar((clientX / largura - 0.5) * 2), y: limitar((clientY / altura - 0.5) * 2) };
}

type EventoComLicenca = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * No iPhone (Safari 13+) o sensor só entrega depois de `requestPermission`, e ele só pode ser
 * chamado dentro de um toque. Chame no primeiro toque da pessoa; nos outros aparelhos não faz nada.
 */
export async function pedirLicencaDoSensor(): Promise<boolean> {
  const Orientacao = (globalThis as { DeviceOrientationEvent?: EventoComLicenca }).DeviceOrientationEvent;
  if (!Orientacao?.requestPermission) return true;
  try {
    return (await Orientacao.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

const assinantes = new Set<(i: Inclinacao) => void>();
let desligar: (() => void) | null = null;

function ligar(): () => void {
  const estado = novoEstadoDaInclinacao();
  let temSensor = false;
  const entregar = (i: Inclinacao) => {
    if (!movimentoRico()) return;
    for (const f of assinantes) f(i);
  };
  const doSensor = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    temSensor = true;
    entregar(passoDaInclinacao(estado, e.beta, e.gamma));
  };
  /* Com sensor entregando, o ponteiro cala: num celular o "ponteiro" é o dedo, e ele brigaria com o giro. */
  const doPonteiro = (e: PointerEvent) => {
    if (temSensor || e.pointerType === 'touch') return;
    entregar(inclinacaoDoPonteiro(e.clientX, e.clientY, window.innerWidth, window.innerHeight));
  };
  const umToque = () => void pedirLicencaDoSensor();
  window.addEventListener('deviceorientation', doSensor);
  window.addEventListener('pointermove', doPonteiro, { passive: true });
  window.addEventListener('pointerdown', umToque, { once: true, passive: true });
  return () => {
    window.removeEventListener('deviceorientation', doSensor);
    window.removeEventListener('pointermove', doPonteiro);
    window.removeEventListener('pointerdown', umToque);
  };
}

/**
 * Recebe a inclinação enquanto durar a assinatura. O sensor e o ponteiro só são ouvidos enquanto
 * houver alguém assinando. Devolve como cancelar.
 */
export function assinarInclinacao(aoInclinar: (i: Inclinacao) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  assinantes.add(aoInclinar);
  if (!desligar) desligar = ligar();
  return () => {
    assinantes.delete(aoInclinar);
    if (assinantes.size === 0 && desligar) {
      desligar();
      desligar = null;
    }
  };
}
