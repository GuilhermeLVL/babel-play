/**
 * SIMULAÇÃO DA TELA DO PARCIAL VIVO (laboratório, ciclo 3): dada a sequência de hipóteses que o worker devolveu para UMA fala
 * (gravada pela bancada com `babel.lab.gravarHipoteses=1`), reproduz os quadros que a tela mostraria sob uma POLÍTICA de exibição
 * (modo, máscara, intervalo do limitador, subamostragem da cadência), sem navegador e sem worker.
 *
 * Não reimplementa regra nenhuma: compõe as mesmas funções puras que o `pipelineDeFala.ts` usa (`localAgreement`,
 * `modoDeParciais`, `limitadorDeParcial`). Só a COLA (a ordem em que o pipeline chama cada uma) é espelhada aqui, e é a parte que a
 * validação contra a bancada real confere (`simular-exibicao.mjs --validar`).
 *
 * PURO: sem React, sem rede, sem DOM, sem relógio (o tempo vem nos eventos).
 *
 * Limites do modelo (declarados): (1) o tempo de cada hipótese é o gravado; subamostrar a cadência só descarta decodes, não refaz o
 * agendamento do worker (um decode que só existiria mais tarde não existe aqui); (2) o timer do limitador dispara exatamente no
 * vencimento (na tela real há o atraso do `setTimeout` e do quadro); (3) o FINAL não depende da política (ele escreve direto, cancela o
 * limitador e só a fila do worker o atrasaria, o que a simulação não modela: ficaria igual ou mais cedo com menos decodes).
 */
import { criarLimitadorDeParcial } from './limitadorDeParcial.ts';
import { avancar, novoLocalAgreement, visualizar } from './localAgreement.ts';
import { type ModoDeParciais, pintaTokens, vistaDoDecode, vistaDoToken } from './modoDeParciais.ts';

/** O que o pipeline registra por fala (`gravadorDeHipoteses`). `t` = `performance.now()` da página; `decode` = índice do decode da fala. */
export type EventoDeHipotese =
  /** Um token do `onUpdate` (a hipótese do decode EM CURSO). */
  | { tipo: 'token'; t: number; seq: number; decode: number; texto: string }
  /** Um decode COMPLETO terminou (`texto` vazio = nada reconhecido). `tIni` = quando foi pedido; `audioMs` = a janela decodificada. */
  | { tipo: 'decode'; t: number; seq: number; decode: number; tIni: number; audioMs: number; texto: string }
  /** A fala fechou (o final foi pedido): nada do parcial é mais pintado e o limitador é descartado. */
  | { tipo: 'fechada'; t: number; seq: number }
  /** O texto FINAL da fala chegou (escreve direto na tela). */
  | { tipo: 'final'; t: number; seq: number; texto: string };

export interface PoliticaDeExibicao {
  modo: ModoDeParciais;
  /** Máscara dos modos `acrescenta-*` (nos outros não tem efeito). */
  mascara: number;
  /** Intervalo do limitador de atualização da tela; 0 = sem limitador. */
  intervaloMs: number;
  /** Mantém 1 a cada `subamostra` decodes (1 = todos): cadência `subamostra` vezes mais lenta. */
  subamostra: number;
}

export interface QuadroSimulado {
  t: number;
  texto: string;
}

export interface ExibicaoSimulada {
  quadros: QuadroSimulado[];
  /** Quando o texto final entrou na tela (`null` se a fala não tem final). Independe da política. */
  finalEm: number | null;
  textoFinal: string | null;
}

/** Decide o que cada evento pinta. `eventos` = os de UMA fala (mesmo `seq`), em ordem de tempo. */
export function simularExibicao(eventos: readonly EventoDeHipotese[], politica: PoliticaDeExibicao): ExibicaoSimulada {
  const { modo, mascara, intervaloMs } = politica;
  const sub = Math.max(1, Math.floor(politica.subamostra) || 1);
  const ordenados = [...eventos].sort((a, b) => a.t - b.t);
  const quadros: QuadroSimulado[] = [];
  const limitador = criarLimitadorDeParcial<string>(intervaloMs);
  let agreement = novoLocalAgreement();
  let exibido = '';
  let liberaEm: number | null = null;
  let fechada = false;
  let finalEm: number | null = null;
  let textoFinal: string | null = null;

  const pintar = (t: number, texto: string): void => {
    quadros.push({ t, texto });
  };
  const oferecer = (t: number, texto: string): void => {
    const r = limitador.oferecer(texto, t);
    if (r.tipo === 'aplicar') pintar(t, r.valor);
    else if (r.tipo === 'agendar') liberaEm = t + r.aguardarMs;
  };
  /** Dispara o timer do limitador se venceu até `ate` (inclusive). */
  const soltarAte = (ate: number): void => {
    if (liberaEm !== null && liberaEm <= ate) {
      const em = liberaEm;
      liberaEm = null;
      const ultimo = limitador.liberar(em);
      if (ultimo !== null && !fechada) pintar(em, ultimo);
    }
  };

  for (const e of ordenados) {
    soltarAte(e.t);
    if (e.tipo === 'final') {
      limitador.cancelar();
      liberaEm = null;
      fechada = true;
      finalEm = e.t;
      textoFinal = e.texto;
      pintar(e.t, e.texto);
      continue;
    }
    if (e.tipo === 'fechada') {
      limitador.cancelar();
      liberaEm = null;
      fechada = true;
      continue;
    }
    if (fechada || e.decode % sub !== 0) continue;
    if (e.tipo === 'token') {
      if (!pintaTokens(modo) || !e.texto) continue;
      const v = vistaDoToken(modo, visualizar(agreement, e.texto), exibido, mascara);
      if (!v.texto) continue; // `acrescenta-token`: a máscara ainda cobre tudo
      exibido = v.texto;
      oferecer(e.t, v.texto);
      continue;
    }
    // decode completo
    const limpo = e.texto;
    if (!limpo) continue;
    const la = avancar(agreement, limpo);
    agreement = la.estado;
    const vista = vistaDoDecode(modo, la, exibido, mascara);
    exibido = vista.texto;
    if (!vista.texto) continue; // `sem-cauda` antes de qualquer confirmação
    oferecer(e.t, vista.texto);
  }
  // Um timer que vence depois do último evento (a fala não fechou nos dados): ainda dispara.
  if (liberaEm !== null && !fechada) soltarAte(liberaEm);
  return { quadros, finalEm, textoFinal };
}
