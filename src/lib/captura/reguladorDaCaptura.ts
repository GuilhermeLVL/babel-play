/**
 * O REGULADOR NA CAPTURA — a cola FINA entre `regular()` (núcleo puro, `core/harness/
 * reguladorDeDesempenho.ts`) e o pipeline de fala (harness adaptativo §4; integração de 2026-09-28).
 *
 * O núcleo decide; aqui só se (1) juntam os sinais do navegador que o núcleo não lê — visibilidade,
 * bateria (`navigator.getBattery`, só Chromium, lida uma vez e acompanhada), pressão de CPU
 * (`PressureObserver('cpu')`, Chromium desktop) — e (2) traduzem as AÇÕES em estado e efeitos:
 *
 *   `cortar-parciais`           → `parciaisCortados` (o pipeline para de decodificar parciais);
 *   `modelo-menor`              → o próximo da escada small → base → tiny (inglês: → Moonshine);
 *   `subir`                     → desfaz o último passo (parciais de volta / o modelo de antes);
 *   `proibir-modelo`            → grava o veto do modelo que estourou a GPU neste aparelho;
 *   `oferecer-nativo-ou-nuvem`  → o aviso (é oferta, não troca silenciosa);
 *   `pausar`/`retomar`          → SÓ os parciais do MICROFONE. A captura do sistema/aba nunca pausa:
 *     com ela ligada a aba do app fica escondida atrás do vídeo o tempo todo, e isso é "só ouvir"
 *     (`modoSoOuvir`); não há outro modo "só ouvir" no app, então o conservador é não pausar nada
 *     além do parcial do mic;
 *   `trocar-backend`            → não emitido (o microbenchmark ainda não alimenta a config).
 *
 * O estado mora num objeto criado UMA vez pela tela (um `useRef`); o pipeline, que é refeito a cada
 * render, só chama `aoFinal` com os efeitos do render corrente.
 */
import {
  type AcaoDoRegulador,
  type ConfigDoRegulador,
  type EstadoDoRegulador,
  estadoInicialDoRegulador,
  type PressaoDeCpu,
  regular,
} from '@core/harness/reguladorDeDesempenho';

import { MOONSHINE_MODELS, WHISPER_MODELS } from '../../gateway/sttRouter';

/** Um degrau abaixo do modelo; `null` = já é o menor. `soIngles`: o Moonshine (só inglês) serve. */
function umAbaixo(modelo: string, soIngles: boolean): string | null {
  switch (modelo) {
    case WHISPER_MODELS.small:
      return WHISPER_MODELS.base;
    case WHISPER_MODELS.base:
      return soIngles ? MOONSHINE_MODELS.base : WHISPER_MODELS.tiny;
    case MOONSHINE_MODELS.base:
      return MOONSHINE_MODELS.tiny;
    default:
      return null;
  }
}

/** Os modelos MENORES que `modelo`, em ordem de descida (o mesmo que a sonda usa para os vetados). */
export function escadaDeModelos(modelo: string, soIngles: boolean): string[] {
  const escada: string[] = [];
  for (let m = umAbaixo(modelo, soIngles); m; m = umAbaixo(m, soIngles)) escada.push(m);
  return escada;
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
  trocarModelo(modelo: string): void;
  proibirModelo(modelo: string, motivo: 'oom' | 'device-lost'): void;
  oferecerNativoOuNuvem(): void;
}

export interface ReguladorDaCaptura {
  /** Sessão nova (ou o worker trocou de modelo sozinho). Sem `soIngles`, fica o da última rota. */
  reiniciar(o: { modelo: string; soIngles?: boolean }): void;
  /** Uma falha de memória/GPU do modelo; vira `proibir-modelo` no próximo trecho medido. */
  registrarFalha(erro: 'oom' | 'device-lost', modelo: string): void;
  aoFinal(m: MedidaDoTrecho, efeitos: EfeitosDoRegulador): AcaoDoRegulador[];
  modeloEmUso(): string;
  readonly parciaisCortados: boolean;
  readonly parciaisDoMicPausados: boolean;
}

export function criarReguladorDaCaptura(
  opts: { sinais?: SinaisDoAmbiente; config?: Partial<ConfigDoRegulador> } = {},
): ReguladorDaCaptura {
  let sinais = opts.sinais;
  let estado: EstadoDoRegulador = estadoInicialDoRegulador();
  let original = '';
  let escada: string[] = [];
  let degrau = 0; // quantos modelos abaixo do original
  let falha: { erro: 'oom' | 'device-lost'; modelo: string } | null = null;
  let parciaisCortados = false;
  let parciaisDoMicPausados = false;
  let soInglesDaRota = false;

  const modeloEmUso = () => (degrau === 0 ? original : escada[degrau - 1]);

  return {
    reiniciar({ modelo, soIngles }) {
      estado = estadoInicialDoRegulador();
      original = modelo;
      if (soIngles !== undefined) soInglesDaRota = soIngles;
      escada = escadaDeModelos(modelo, soInglesDaRota);
      degrau = 0;
      parciaisCortados = false;
      parciaisDoMicPausados = false;
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
          agoraMs: sinais.agoraMs(),
        },
        { ...opts.config, modelosMenores: escada.length },
      );
      estado = saida.estado;
      for (const acao of saida.acoes) {
        switch (acao) {
          case 'cortar-parciais':
            parciaisCortados = true;
            break;
          case 'modelo-menor':
            if (degrau < escada.length) {
              degrau += 1;
              efeitos.trocarModelo(modeloEmUso());
            }
            break;
          case 'oferecer-nativo-ou-nuvem':
            efeitos.oferecerNativoOuNuvem();
            break;
          case 'subir':
            if (saida.desfaz === 'cortar-parciais') parciaisCortados = false;
            else if (saida.desfaz === 'modelo-menor' && degrau > 0) {
              degrau -= 1;
              efeitos.trocarModelo(modeloEmUso());
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
            break; // não emitido: `outroBackendMaisRapido` fica falso até o microbenchmark alimentar
        }
      }
      falha = null;
      return saida.acoes;
    },
  };
}
