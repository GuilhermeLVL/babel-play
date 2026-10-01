/**
 * O CONTROLE DO MODO INTÉRPRETE (E3 da Fase E) — a cola entre a máquina de estados (`interprete.ts`),
 * a fila de fala (`lib/voz/filaDeFala.ts`) e o microfone da captura. A tela
 * (`captura/interprete/ModoInterprete.tsx`) só desenha o `estado()` e chama os métodos; a captura
 * (`LiveCapture`) repassa a ele o fim de cada fala e a tradução de cada final.
 *
 * FORA DO JS INICIAL: só a tela do intérprete o importa, e ela chega por `import()`.
 *
 * O QUE ELE RESOLVE, que a máquina pura não sabe:
 *   - O TOQUE destrava a voz da nuvem (no iPhone, o áudio precisa de um gesto — `destravarVoz`);
 *   - A ORDEM: a tradução pode chegar ANTES do fim da fala (o cache responde na hora). Ela fica
 *     guardada e é entregue à máquina logo depois do `fimDaFala`;
 *   - O IDIOMA DA VOZ é o de QUEM OUVE (o outro lado), em BCP-47 — a tradução de `pt` para `en`
 *     é lida com uma voz `en-US`;
 *   - O FIM DA VOZ é a fila vazia (nada falando nem esperando);
 *   - O TEMPO ATÉ A VOZ (`tts_inicio`, meta do E6) vai a `registrarTempo`, com o nome do motor que
 *     leu — a voz da nuvem pode recuar para a do aparelho no meio da conversa;
 *   - O MICROFONE QUE NÃO ABRE (permissão, ocupado) devolve a conversa a "parado".
 */
import { type SpeakOptions, type TtsEngine } from '../tts';
import { criarFilaDeFala, type ItemDeFala } from '../voz/filaDeFala';
import { tempoAteAVoz } from '../voz/tempoAteAVoz';
import {
  criarInterprete,
  direcaoDoLado,
  type EfeitoDoInterprete,
  type EstadoDoInterprete,
  type IdiomasDoInterprete,
} from './interprete';
import type { DirecaoDaFala, FimDaFala, LadoDoInterprete } from './tiposDaFala';
import type { TraducaoFinal } from './traducaoDaFala';

export interface EstadoDoControle extends EstadoDoInterprete {
  /** A tradução sendo lida agora (a metade de quem OUVE mostra "Repetir" e "Parar voz"). */
  falando: ItemDeFala | null;
}

export interface OpcoesDoControle {
  idiomas: () => IdiomasDoInterprete;
  /** O microfone da captura (`abrirMicrofoneNoLado`/`fecharMicrofoneDoLado` de `fontesDeAudio.ts`). */
  microfone: { abrir: () => Promise<void> | void; fechar: () => void };
  /** O motor da voz, lido a cada fala (a do aparelho, ou a da nuvem no Premium). */
  motor: () => TtsEngine;
  /** O nome de quem leu a última fala, para a métrica (`voz-da-nuvem`/`voz-do-aparelho`). */
  nomeDoMotor: () => string;
  /** Chamado DENTRO do toque (iPhone: `destravarVozDaNuvem`). */
  destravarVoz?: () => void;
  /** A métrica `tts_inicio`. Padrão: `tempoAteAVoz.registrar`. */
  registrarTempo?: (ms: number, motor: string) => void;
  /** O relógio (ms) — o mesmo da fila, para o `criadoEm`. */
  agora?: () => number;
  opcoesDeFala?: Pick<SpeakOptions, 'rate' | 'pitch' | 'voiceName'>;
  aoMudar?: (estado: EstadoDoControle) => void;
  aoFalharMicrofone?: (erro: unknown) => void;
}

export interface ControleDoInterprete {
  tocar(lado: LadoDoInterprete): void;
  /** O microfone ouviu o fim de uma fala (`aoFimDaFala` do pipeline e das fontes). */
  aoFimDaFala(fim: FimDaFala): void;
  /** A tradução de um final chegou (`aoTraduzirFinal` da tradução da fala). */
  aoTraduzirFinal(final: TraducaoFinal): void;
  repetir(): void;
  pararVoz(): void;
  trocarLados(): void;
  /** Para tudo e desliga: nada mais é lido. */
  sair(): void;
  /** A direção do microfone agora (`direcaoDoMicrofone` do pipeline e das fontes). */
  direcao(): DirecaoDaFala | null;
  /**
   * O microfone falhou DEPOIS de abrir (o reconhecedor do navegador recusou o idioma, o serviço caiu):
   * quem avisa é a captura (`aoFalharMicrofone` das fontes). Avisa a tela e, se o lado ainda ouvia,
   * devolve a conversa a "parado" — a pessoa toca de novo, ou no outro lado.
   */
  microfoneFalhou(erro: unknown): void;
  estado(): EstadoDoControle;
}

/** O que a captura (`LiveCapture`) repassa ao intérprete aberto: a direção e os avisos do pipeline. */
export type PonteDoInterprete = Pick<
  ControleDoInterprete,
  'direcao' | 'aoFimDaFala' | 'aoTraduzirFinal' | 'microfoneFalhou'
>;

const relogioPadrao = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const outroLado = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

export function criarControleDoInterprete(o: OpcoesDoControle): ControleDoInterprete {
  const agora = o.agora ?? relogioPadrao;
  const registrarTempo = o.registrarTempo ?? ((ms: number, motor: string) => tempoAteAVoz.registrar(ms, motor));

  /** Por fala: quando ela terminou e de que lado veio. */
  const fins = new Map<string, { em: number; lado: LadoDoInterprete }>();
  /** Traduções que chegaram antes do fim da fala (ou à espera de serem lidas). */
  const traducoes = new Map<string, TraducaoFinal>();
  let desligado = false;
  let falando: ItemDeFala | null = null;

  const estado = (): EstadoDoControle => ({ ...maquina.estado(), falando });
  const avisar = () => {
    if (!desligado) o.aoMudar?.(estado());
  };
  /** Um evento depois do que está em curso (a fila avisa DENTRO de um efeito da máquina). */
  const depois = (f: () => void) => queueMicrotask(() => !desligado && f());

  const fila = criarFilaDeFala({
    motor: o.motor,
    agora,
    ...(o.opcoesDeFala ? { opcoesDeFala: o.opcoesDeFala } : {}),
    aoIniciar: (_item, espera) => registrarTempo(espera, o.nomeDoMotor()),
    aoMudar: (f) => {
      falando = f.falando;
      if (!f.falando && f.espera.length === 0) maquina.enviar({ tipo: 'fimDaVoz' });
      avisar();
    },
  });

  const falar = (segId: string) => {
    const t = traducoes.get(segId);
    traducoes.delete(segId);
    const fim = fins.get(segId);
    const lado = fim?.lado ?? maquina.estado().lado ?? 'meu';
    const ouvinte = direcaoDoLado(outroLado(lado), o.idiomas(), maquina.estado().trocados);
    const entrou =
      !!t?.traducao &&
      fila.enfileirar({ id: segId, texto: t.traducao, lang: ouvinte.fala, lado, ...(fim ? { criadoEm: fim.em } : {}) });
    if (!entrou && !fila.ocupada()) depois(() => maquina.enviar({ tipo: 'fimDaVoz' }));
  };

  /** O microfone falhou: avisa a tela e, se ainda ouvia, "terminei" — volta a parado e fecha o que abriu. */
  const microfoneFalhou = (erro: unknown, lado?: LadoDoInterprete) => {
    if (desligado) return;
    o.aoFalharMicrofone?.(erro);
    const agoraEstado = maquina.estado();
    if (agoraEstado.fase === 'ouvindo' && agoraEstado.lado && (!lado || agoraEstado.lado === lado))
      maquina.enviar({ tipo: 'tocar', lado: agoraEstado.lado });
  };

  const executar = (e: EfeitoDoInterprete) => {
    switch (e.tipo) {
      case 'abrirMicrofone': {
        const lado = e.direcao.lado;
        const falhou = (erro: unknown) => microfoneFalhou(erro, lado);
        /* Na hora, DENTRO do toque: a Web Speech e o `getUserMedia` do iPhone pedem o gesto. */
        try {
          void Promise.resolve(o.microfone.abrir()).catch(falhou);
        } catch (erro) {
          depois(() => falhou(erro));
        }
        return;
      }
      case 'fecharMicrofone':
        o.microfone.fechar();
        return;
      case 'interromperVoz':
        fila.interromper();
        return;
      case 'falar':
        falar(e.segId);
        return;
      case 'repetirVoz':
        if (!fila.repetir()) depois(() => maquina.enviar({ tipo: 'fimDaVoz' }));
        return;
      case 'pararVoz':
        fila.parar();
        return;
    }
  };

  const maquina = criarInterprete({ idiomas: o.idiomas, executar, aoMudar: avisar });

  const aoTraduzirFinal = (final: TraducaoFinal) => {
    if (desligado || !final.falada) return;
    const pendente = maquina.estado().pendentes.includes(final.segId);
    if (final.resultado === 'traduzida' && final.traducao.trim()) {
      traducoes.set(final.segId, final);
      if (pendente) maquina.enviar({ tipo: 'traduziu', segId: final.segId });
      return;
    }
    traducoes.delete(final.segId);
    if (pendente) maquina.enviar({ tipo: 'semTraducao', segId: final.segId });
  };

  return {
    tocar(lado) {
      if (desligado) return;
      try {
        o.destravarVoz?.();
      } catch {
        /* sem destravar: a voz do aparelho é a reserva */
      }
      maquina.enviar({ tipo: 'tocar', lado });
    },
    aoFimDaFala(fim) {
      if (desligado || fim.source !== 'mic') return;
      const lado = fim.lado ?? maquina.estado().lado;
      if (!lado) return;
      if (!fins.has(fim.segId)) fins.set(fim.segId, { em: agora(), lado });
      maquina.enviar({ tipo: 'fimDaFala', segId: fim.segId });
      /* A tradução já tinha chegado (cache): entrega agora, na ordem que a máquina espera. */
      const chegou = traducoes.get(fim.segId);
      if (chegou) aoTraduzirFinal(chegou);
    },
    aoTraduzirFinal,
    repetir: () => void (desligado || maquina.enviar({ tipo: 'repetir' })),
    pararVoz: () => void (desligado || maquina.enviar({ tipo: 'pararVoz' })),
    trocarLados: () => void (desligado || maquina.enviar({ tipo: 'trocarLados' })),
    sair() {
      if (desligado) return;
      maquina.enviar({ tipo: 'sair' });
      desligado = true;
      fila.destruir();
      fins.clear();
      traducoes.clear();
      falando = null;
    },
    direcao: () => maquina.direcao(),
    microfoneFalhou: (erro) => microfoneFalhou(erro),
    estado,
  };
}
