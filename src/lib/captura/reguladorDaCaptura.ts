/**
 * O REGULADOR NA CAPTURA — a cola FINA entre `regular()` (núcleo puro, `core/harness/
 * reguladorDeDesempenho.ts`) e o pipeline de fala (harness adaptativo §4; integração de 2026-09-28).
 *
 * O núcleo decide; aqui só se (1) juntam os sinais do navegador que o núcleo não lê — visibilidade,
 * bateria (`navigator.getBattery`, só Chromium, lida uma vez e acompanhada), pressão de CPU
 * (`PressureObserver('cpu')`, Chromium desktop) — e (2) traduzem as AÇÕES em estado e efeitos:
 *
 *   `cortar-parciais`           → `parciaisCortados` (o pipeline para de decodificar parciais);
 *   `modelo-menor`              → o próximo da escada small → base → tiny (inglês: → Moonshine). O
 *     português só desce ao tiny NA GPU e em hybrid: o tiny q8 errou 41,6% contra 29,2% na bancada pt
 *     (a razão por que nenhuma rota o escolhe) — no WASM a escada para no base, e o que resta é cortar
 *     parciais e oferecer nativo/nuvem. Degrau já baixado vence (sem download no meio da sessão);
 *   `subir`                     → desfaz o último passo (parciais de volta / o modelo de antes);
 *   `proibir-modelo`            → grava o veto do modelo que estourou a GPU neste aparelho;
 *   `oferecer-nativo-ou-nuvem`  → o aviso (é oferta, não troca silenciosa);
 *   `pausar`/`retomar`          → SÓ os parciais do MICROFONE. A captura do sistema/aba nunca pausa:
 *     com ela ligada a aba do app fica escondida atrás do vídeo o tempo todo, e isso é "só ouvir"
 *     (`modoSoOuvir`); não há outro modo "só ouvir" no app, então o conservador é não pausar nada
 *     além do parcial do mic;
 *   `trocar-backend`            → o OUTRO backend (WebGPU↔WASM), quando o microbenchmark guardado o
 *     mediu mais rápido (`outroBackend` em `sttRouter.ts`, na rota) e o dtype dele já está no aparelho.
 *
 * O estado mora num objeto criado UMA vez pela tela (um `useRef`); o pipeline, que é refeito a cada
 * render, só chama `aoFinal`/`aoParcial` com os efeitos do render corrente.
 *
 * SINAIS RÁPIDOS ("Grátis sem travar", 2026-09-29): cada medida leva também o BLOQUEIO do main thread
 * (`vigiaDoMainThread.ts`), e o parcial entra como amostra de latência (`aoParcial`) — ele chega bem
 * mais vezes que o final, e o regulador reage antes de a aba congelar.
 */
import {
  type AcaoDoRegulador,
  CONFIG_PADRAO_DO_REGULADOR,
  type ConfigDoRegulador,
  type EstadoDoRegulador,
  estadoInicialDoRegulador,
  type PressaoDeCpu,
  regular,
  type SaidaDoRegulador,
} from '@core/harness/reguladorDeDesempenho';

import { type DtypeDaRota, MOONSHINE_MODELS, type OutroBackend, WHISPER_MODELS } from '../../gateway/sttRouter';
import { type VigiaDoMainThread, vigiaDoMainThread } from './vigiaDoMainThread';

type Backend = 'wasm' | 'webgpu';

/** Dtype/backend que um degrau PRECISA; ausente = fica o que está carregado (só troca o modelo). */
export interface OpcoesDoDegrau {
  dtype?: DtypeDaRota;
  device?: Backend;
}

/** Um degrau da escada de modelos. */
export interface DegrauDoModelo {
  modelo: string;
  opcoes?: OpcoesDoDegrau;
}

interface OpcoesDaEscada {
  /** O backend EM QUE a escada vai rodar é a GPU (só aí o português desce ao tiny, em hybrid). */
  gpu?: boolean;
  /** O dtype hybrid da GPU (`hybrid-fp16` com shader-f16). */
  dtypeNaGpu?: DtypeDaRota;
}

/** Um degrau abaixo do modelo; `null` = já é o menor. `soIngles`: o Moonshine (só inglês) serve. */
function umAbaixo(modelo: string, soIngles: boolean, o: OpcoesDaEscada): DegrauDoModelo | null {
  switch (modelo) {
    case WHISPER_MODELS.small:
      return { modelo: WHISPER_MODELS.base };
    case WHISPER_MODELS.base:
      if (soIngles) return { modelo: MOONSHINE_MODELS.base };
      // Nunca o tiny q8; o tiny híbrido só na GPU (na CPU ele não acompanha melhor que o base q8).
      return o.gpu
        ? { modelo: WHISPER_MODELS.tiny, opcoes: { dtype: o.dtypeNaGpu ?? 'hybrid', device: 'webgpu' } }
        : null;
    case MOONSHINE_MODELS.base:
      return { modelo: MOONSHINE_MODELS.tiny };
    default:
      return null;
  }
}

/** Os degraus MENORES que `modelo`, em ordem de descida. */
export function degrausAbaixo(modelo: string, soIngles: boolean, o: OpcoesDaEscada = {}): DegrauDoModelo[] {
  const escada: DegrauDoModelo[] = [];
  for (let d = umAbaixo(modelo, soIngles, o); d; d = umAbaixo(d.modelo, soIngles, o)) escada.push(d);
  return escada;
}

/** Os modelos MENORES que `modelo`, em ordem de descida (o mesmo que a sonda usa para os vetados). */
export function escadaDeModelos(modelo: string, soIngles: boolean, o: OpcoesDaEscada = {}): string[] {
  return degrausAbaixo(modelo, soIngles, o).map((d) => d.modelo);
}

export interface SinaisDoAmbiente {
  visivel(): boolean;
  bateria(): { nivel: number; carregando: boolean } | undefined;
  pressao(): PressaoDeCpu | undefined;
  agoraMs(): number;
}

type BateriaDoNavegador = { level: number; charging: boolean };
type ObservadorDePressao = new (f: (registros: Array<{ state: string }>) => void) => {
  observe(fonte: 'cpu'): Promise<void> | void;
};

let bateriaLida: BateriaDoNavegador | null = null;
let pressaoLida: PressaoDeCpu | undefined;
let sinaisIniciados = false;

/**
 * Os sinais do navegador, pedidos UMA vez por página (preguiçoso: só quando a captura regula). A
 * bateria do Chromium é um objeto vivo — lido uma vez, acompanha sozinho. Nunca lança.
 */
export function sinaisDoNavegador(escopo: unknown = globalThis): SinaisDoAmbiente {
  const g = escopo as {
    document?: { visibilityState?: string };
    navigator?: { getBattery?: () => Promise<BateriaDoNavegador> };
    PressureObserver?: ObservadorDePressao;
    performance?: { now(): number };
  };
  if (!sinaisIniciados) {
    sinaisIniciados = true;
    try {
      void g.navigator
        ?.getBattery?.()
        .then((b) => (bateriaLida = b))
        .catch(() => {
          /* sem bateria: o gatilho some */
        });
    } catch {
      /* idem */
    }
    try {
      if (typeof g.PressureObserver === 'function') {
        const obs = new g.PressureObserver((registros) => {
          const ultimo = registros[registros.length - 1]?.state;
          if (ultimo === 'nominal' || ultimo === 'fair' || ultimo === 'serious' || ultimo === 'critical')
            pressaoLida = ultimo;
        });
        void Promise.resolve(obs.observe('cpu')).catch(() => {
          /* permissão/política recusou: sem sinal de pressão */
        });
      }
    } catch {
      /* idem */
    }
  }
  return {
    visivel: () => g.document?.visibilityState !== 'hidden',
    bateria: () => (bateriaLida ? { nivel: bateriaLida.level, carregando: bateriaLida.charging } : undefined),
    pressao: () => pressaoLida,
    agoraMs: () => g.performance?.now() ?? Date.now(),
  };
}

/** O que o pipeline mede a cada final LOCAL (a nuvem mede a rede, não o aparelho). */
export interface MedidaDoTrecho {
  rtf: number;
  filaPendente: number;
  latenciaMs: number;
  /** A captura do sistema/aba está ligada: aba escondida é o uso normal, não pausa. */
  modoSoOuvir: boolean;
}

export interface EfeitosDoRegulador {
  /** Sem `opcoes`: só o modelo (dtype/backend ficam). Com: o degrau ou a troca de backend dizem quais. */
  trocarModelo(modelo: string, opcoes?: OpcoesDoDegrau): void;
  proibirModelo(modelo: string, motivo: 'oom' | 'device-lost'): void;
  oferecerNativoOuNuvem(): void;
}

/** A sessão que o regulador passa a vigiar (a rota do STT local, `pipelineDeFala.ts`). */
export interface InicioDoRegulador {
  modelo: string;
  /** Sem ele, fica o da última rota. */
  soIngles?: boolean;
  /** Onde o modelo roda. Ausente = WASM (o conservador: sem GPU, o português não desce ao tiny). */
  backend?: Backend;
  /** O dtype da rota (para voltar a ele ao subir, e o hybrid da GPU no tiny). */
  dtype?: DtypeDaRota;
  /** O backend que o benchmark mediu mais rápido (`outroBackend`); `null`/ausente = nenhum. */
  outro?: OutroBackend | null;
  /**
   * Este modelo/dtype JÁ está no aparelho? (Síncrono: o manifesto no localStorage.) Com ele, a escada
   * prefere os degraus baixados e a troca de backend só vale se o outro dtype estiver baixado.
   */
  emCache?: (modelo: string, dtype?: DtypeDaRota) => boolean;
}

export interface ReguladorDaCaptura {
  /** Sessão nova (ou o worker trocou de modelo sozinho). */
  reiniciar(o: InicioDoRegulador): void;
  /** Uma falha de memória/GPU do modelo; vira `proibir-modelo` no próximo trecho medido. */
  registrarFalha(erro: 'oom' | 'device-lost', modelo: string): void;
  aoFinal(m: MedidaDoTrecho, efeitos: EfeitosDoRegulador): AcaoDoRegulador[];
  /**
   * Um parcial LOCAL decodificou: `latenciaMs` = do pedido ao texto. Acima de 1,5 s é lento (o RTF do
   * parcial não diz nada: ele redecodifica o áudio que cresce). Leva os efeitos porque os sinais do
   * ambiente que vêm junto (travamento, pressão) podem descer um degrau que troca o modelo.
   */
  aoParcial(latenciaMs: number, efeitos: EfeitosDoRegulador): AcaoDoRegulador[];
  modeloEmUso(): string;
  readonly parciaisCortados: boolean;
  readonly parciaisDoMicPausados: boolean;
}

export function criarReguladorDaCaptura(
  opts: {
    sinais?: SinaisDoAmbiente;
    /**
     * Uma config fixa, ou uma função lida a CADA medida: a tela passa `configDoReguladorPara(perfil)`
     * do perfil corrente, e o perfil muda quando o `requestAdapter()` responde (o celular sem adaptador
     * só se revela leve aí) — o regulador, criado uma vez, não pode congelar o palpite da montagem.
     */
    config?: Partial<ConfigDoRegulador> | (() => Partial<ConfigDoRegulador>);
    vigia?: VigiaDoMainThread;
  } = {},
): ReguladorDaCaptura {
  let sinais = opts.sinais;
  let vigia = opts.vigia;
  let estado: EstadoDoRegulador = estadoInicialDoRegulador();
  let original: DegrauDoModelo = { modelo: '' };
  let escada: DegrauDoModelo[] = [];
  let degrau = 0; // quantos modelos abaixo do original
  let falha: { erro: 'oom' | 'device-lost'; modelo: string } | null = null;
  let parciaisCortados = false;
  let parciaisDoMicPausados = false;
  let soInglesDaRota = false;
  /** A troca de backend disponível nesta sessão, e se está aplicada. */
  let troca: OutroBackend | null = null;
  let trocado = false;

  const emUso = (): DegrauDoModelo => (degrau === 0 ? original : escada[degrau - 1]);
  const modeloEmUso = () => emUso().modelo;
  /** Dtype/backend em vigor: o da troca, se aplicada; senão o da rota. */
  const opcoesDoBackend = (): OpcoesDoDegrau | undefined =>
    trocado && troca ? { dtype: troca.dtype, device: troca.device } : original.opcoes;
  /**
   * De um degrau a outro: dtype/backend só vão quando o destino os exige ou quando se sai de um degrau
   * que os mudou (o tiny híbrido). As `opcoes` do ORIGINAL são as da rota, já carregadas.
   */
  const irPara = (de: DegrauDoModelo, para: DegrauDoModelo, efeitos: EfeitosDoRegulador) => {
    if (para.opcoes || (de !== original && de.opcoes))
      efeitos.trocarModelo(para.modelo, para.opcoes ?? opcoesDoBackend());
    else efeitos.trocarModelo(para.modelo);
  };
  /** A config desta medida: a da tela (fixa ou lida agora) com a escada DESTA sessão. */
  const configDaMedida = (): Partial<ConfigDoRegulador> => ({
    ...(typeof opts.config === 'function' ? opts.config() : opts.config),
    modelosMenores: escada.length,
    outroBackendMaisRapido: !!troca,
  });
  /**
   * O bloqueio do main thread na janela da config; `undefined` onde o navegador não mede. Depois de um
   * degrau, só o de DEPOIS dele: o bloqueio de antes é justamente o que o degrau veio curar, e contá-lo
   * derrubaria o degrau seguinte de graça (a mesma razão por que o núcleo zera a janela de latência).
   */
  const bloqueioDoMain = (agora: number, config: Partial<ConfigDoRegulador>): number | undefined => {
    vigia ??= vigiaDoMainThread();
    if (!vigia.suportado) return undefined;
    const janela = config.janelaDeBloqueioMs ?? CONFIG_PADRAO_DO_REGULADOR.janelaDeBloqueioMs;
    const desdeODegrau = estado.ultimaDescidaMs === null ? janela : Math.max(0, agora - estado.ultimaDescidaMs);
    return vigia.bloqueioRecenteMs(Math.min(janela, desdeODegrau));
  };
  /** Traduz as ações do núcleo em estado e efeitos — o mesmo para o final e para o parcial. */
  const aplicar = (saida: SaidaDoRegulador, efeitos: EfeitosDoRegulador): AcaoDoRegulador[] => {
    estado = saida.estado;
    for (const acao of saida.acoes) {
      switch (acao) {
        case 'cortar-parciais':
          parciaisCortados = true;
          break;
        case 'modelo-menor':
          if (degrau < escada.length) {
            const de = emUso();
            degrau += 1;
            irPara(de, emUso(), efeitos);
          }
          break;
        case 'oferecer-nativo-ou-nuvem':
          efeitos.oferecerNativoOuNuvem();
          break;
        case 'subir':
          if (saida.desfaz === 'cortar-parciais') parciaisCortados = false;
          else if (saida.desfaz === 'modelo-menor' && degrau > 0) {
            const de = emUso();
            degrau -= 1;
            irPara(de, emUso(), efeitos);
          } else if (saida.desfaz === 'trocar-backend' && trocado && troca) {
            trocado = false;
            // Volta ao backend da rota (explícito: no `auto` o worker não recriaria).
            efeitos.trocarModelo(
              modeloEmUso(),
              original.opcoes ?? { device: troca.device === 'webgpu' ? 'wasm' : 'webgpu' },
            );
          }
          break;
        case 'pausar':
          parciaisDoMicPausados = true;
          break;
        case 'retomar':
          parciaisDoMicPausados = false;
          break;
        case 'proibir-modelo':
          if (falha) efeitos.proibirModelo(falha.modelo, falha.erro);
          break;
        case 'trocar-backend':
          if (troca && !trocado) {
            trocado = true;
            efeitos.trocarModelo(modeloEmUso(), { dtype: troca.dtype, device: troca.device });
          }
          break;
      }
    }
    return saida.acoes;
  };

  return {
    reiniciar({ modelo, soIngles, backend = 'wasm', dtype, outro, emCache }) {
      estado = estadoInicialDoRegulador();
      original = { modelo, ...(dtype ? { opcoes: { dtype, device: backend } } : {}) };
      if (soIngles !== undefined) soInglesDaRota = soIngles;
      /* A troca de backend só vale com o dtype dela JÁ no aparelho: sair do q8 para o hybrid-fp16 no
         meio da sessão seria baixar 168 MB justo quando o aparelho não está acompanhando. */
      troca = outro && (!emCache || emCache(modelo, outro.dtype)) ? outro : null;
      trocado = false;
      // O tiny do português só na GPU — a do backend FINAL, depois de uma eventual troca.
      const naGpu = (troca?.device ?? backend) === 'webgpu';
      const dtypeNaGpu =
        troca?.device === 'webgpu' ? troca.dtype : dtype === 'hybrid-fp16' || dtype === 'hybrid' ? dtype : 'hybrid';
      const todos = degrausAbaixo(modelo, soInglesDaRota, { gpu: naGpu, dtypeNaGpu });
      /* SEM DOWNLOAD NO MEIO DA SESSÃO QUANDO DÁ: havendo degraus já baixados, a escada é só deles.
         Nenhum baixado, fica inteira — baixar um modelo menor ainda é melhor que não acompanhar. */
      const baixados = emCache ? todos.filter((d) => emCache(d.modelo, d.opcoes?.dtype ?? dtype)) : [];
      escada = baixados.length > 0 ? baixados : todos;
      degrau = 0;
      parciaisCortados = false;
      parciaisDoMicPausados = false;
      // O vigia nasce com a sessão: no primeiro final, a janela já tem o que a tela sofreu até ali.
      vigia ??= vigiaDoMainThread();
    },
    registrarFalha(erro, modelo) {
      falha = { erro, modelo };
    },
    modeloEmUso,
    get parciaisCortados() {
      return parciaisCortados;
    },
    get parciaisDoMicPausados() {
      return parciaisDoMicPausados;
    },
    aoFinal(m, efeitos) {
      sinais ??= sinaisDoNavegador();
      const agora = sinais.agoraMs();
      const config = configDaMedida();
      const saida = regular(
        estado,
        {
          rtf: m.rtf,
          filaPendente: m.filaPendente,
          latenciaMs: m.latenciaMs,
          erro: falha?.erro,
          pressao: sinais.pressao(),
          bateria: sinais.bateria(),
          visivel: sinais.visivel(),
          modoSoOuvir: m.modoSoOuvir,
          agoraMs: agora,
          bloqueioDoMainMs: bloqueioDoMain(agora, config),
        },
        config,
      );
      const acoes = aplicar(saida, efeitos);
      falha = null;
      return acoes;
    },
    aoParcial(latenciaMs, efeitos) {
      sinais ??= sinaisDoNavegador();
      const agora = sinais.agoraMs();
      const config = configDaMedida();
      /* `rtf`, `filaPendente` e `modoSoOuvir` não valem no parcial (o núcleo não os lê nele); a falha
         registrada fica para o final, que é quem a consome. */
      const saida = regular(
        estado,
        {
          origem: 'parcial',
          rtf: 0,
          filaPendente: 0,
          latenciaMs,
          pressao: sinais.pressao(),
          bateria: sinais.bateria(),
          visivel: sinais.visivel(),
          modoSoOuvir: false,
          agoraMs: agora,
          bloqueioDoMainMs: bloqueioDoMain(agora, config),
        },
        config,
      );
      return aplicar(saida, efeitos);
    },
  };
}
