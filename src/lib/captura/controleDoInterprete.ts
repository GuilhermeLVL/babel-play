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
  idiomasDaConversa,
  type IdiomasDoInterprete,
} from './interprete';
import {
  decidirLadoDaFala,
  type DecisaoDoLado,
  ESTADO_DO_AUTOMATICO,
  type EstadoDoAutomatico,
  type PistasDoIdioma,
} from './interpreteAutomatico';
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
  /** MODO AUTOMÁTICO: "Ouvir a conversa". O microfone abre sem lado e reabre depois de cada tradução lida. */
  ouvir(): void;
  /** MODO AUTOMÁTICO: para de ouvir (o microfone fecha e não reabre). */
  parar(): void;
  /** O automático está ouvindo a conversa (o pipeline mede o idioma em vez de usar a dica do lado). */
  automatico(): boolean;
  /**
   * MODO AUTOMÁTICO: o final de uma fala chegou com o idioma medido — de que lado ela veio e para
   * qual idioma traduzir (`interpreteAutomatico.ts`). O controle guarda a resposta: é ela que diz em
   * que voz a tradução é lida e em que metade a fala aparece.
   */
  ladoDaFala(segId: string, pistas: PistasDoIdioma): DecisaoDoLado;
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
  /** Os dois idiomas da conversa em BCP-47 (`idiomasDaConversa` das fontes: o motor serve aos dois). */
  idiomasDaConversa(): string[];
  /**
   * O microfone falhou DEPOIS do toque (o reconhecedor recusou o idioma, o áudio não abriu): quem ouvia
   * volta a "parado", e a pessoa pode tocar de novo. A falha dentro do toque já faz isto sozinha.
   */
  microfoneFalhou(): void;
  estado(): EstadoDoControle;
}

/** O que a captura (`LiveCapture`) repassa ao intérprete aberto: a direção e os avisos do pipeline. */
export type PonteDoInterprete = Pick<
  ControleDoInterprete,
  'direcao' | 'aoFimDaFala' | 'aoTraduzirFinal' | 'idiomasDaConversa' | 'microfoneFalhou' | 'automatico' | 'ladoDaFala'
>;

const relogioPadrao = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const outroLado = (lado: LadoDoInterprete): LadoDoInterprete => (lado === 'meu' ? 'outro' : 'meu');

export function criarControleDoInterprete(o: OpcoesDoControle): ControleDoInterprete {
  const agora = o.agora ?? relogioPadrao;
  const registrarTempo = o.registrarTempo ?? ((ms: number, motor: string) => tempoAteAVoz.registrar(ms, motor));

  /** Por fala: quando ela terminou e de que lado veio (`null` no automático, até o idioma ser medido). */
  const fins = new Map<string, { em: number; lado: LadoDoInterprete | null }>();
  /** AUTOMÁTICO: o que o idioma medido decidiu, por fala, e o estado da conversa (quem falou por último). */
  const decisoes = new Map<string, DecisaoDoLado>();
  let conversa: EstadoDoAutomatico = ESTADO_DO_AUTOMATICO;
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
    /* No automático, o lado e a voz vêm do idioma medido (um terceiro idioma é lido na voz dele). */
    const decisao = decisoes.get(segId);
    decisoes.delete(segId);
    const lado = decisao?.lado ?? fim?.lado ?? maquina.estado().lado ?? 'meu';
    const lang = decisao?.fala ?? direcaoDoLado(outroLado(lado), o.idiomas(), maquina.estado().trocados).fala;
    const entrou =
      !!t?.traducao &&
      fila.enfileirar({ id: segId, texto: t.traducao, lang, lado, ...(fim ? { criadoEm: fim.em } : {}) });
    if (!entrou && !fila.ocupada()) depois(() => maquina.enviar({ tipo: 'fimDaVoz' }));
  };

  const executar = (e: EfeitoDoInterprete) => {
    switch (e.tipo) {
      case 'abrirMicrofone': {
        const lado = e.direcao?.lado ?? null;
        const falhou = (erro: unknown) => {
          if (desligado) return;
          o.aoFalharMicrofone?.(erro);
          const agoraEstado = maquina.estado();
          if (agoraEstado.fase !== 'ouvindo') return;
          /* No automático, sem microfone não há o que ouvir: desliga (reabrir sozinho seria um laço). */
          if (agoraEstado.automatico) maquina.enviar({ tipo: 'parar' });
          /* O mesmo lado de novo é o "terminei" da máquina: volta a parado e fecha o que abriu. */ else if (
            lado &&
            agoraEstado.lado === lado
          )
            maquina.enviar({ tipo: 'tocar', lado });
        };
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

  const destravar = () => {
    try {
      o.destravarVoz?.();
    } catch {
      /* sem destravar: a voz do aparelho é a reserva */
    }
  };

  return {
    tocar(lado) {
      if (desligado) return;
      destravar();
      maquina.enviar({ tipo: 'tocar', lado });
    },
    ouvir() {
      if (desligado) return;
      destravar();
      conversa = ESTADO_DO_AUTOMATICO;
      maquina.enviar({ tipo: 'ouvir' });
    },
    parar: () => void (desligado || maquina.enviar({ tipo: 'parar' })),
    automatico: () => maquina.estado().automatico,
    ladoDaFala(segId, pistas) {
      const m = maquina.estado();
      const idiomas = o.idiomas();
      /* Com os lados trocados, a metade de baixo fala o idioma do outro. */
      const decisao = decidirLadoDaFala(
        pistas,
        m.trocados ? { meu: idiomas.outro, outro: idiomas.meu } : idiomas,
        conversa,
      );
      conversa = decisao.estado;
      decisoes.set(segId, decisao);
      const fim = fins.get(segId);
      if (fim) fim.lado = decisao.lado;
      return decisao;
    },
    aoFimDaFala(fim) {
      if (desligado || fim.source !== 'mic') return;
      const lado = fim.lado ?? maquina.estado().lado;
      /* Sem lado só no automático: o idioma medido o dirá (`ladoDaFala`), antes de a tradução chegar. */
      if (!lado && !maquina.estado().automatico) return;
      if (!fins.has(fim.segId)) fins.set(fim.segId, { em: agora(), lado: lado ?? null });
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
      decisoes.clear();
      traducoes.clear();
      falando = null;
    },
    direcao: () => maquina.direcao(),
    idiomasDaConversa: () => idiomasDaConversa(o.idiomas()),
    microfoneFalhou() {
      if (desligado) return;
      const agoraEstado = maquina.estado();
      if (agoraEstado.fase !== 'ouvindo') return;
      /* No automático, a escuta desliga (reabrir sozinho bateria na mesma falha, em laço). */
      if (agoraEstado.automatico) maquina.enviar({ tipo: 'parar' });
      /* O mesmo lado de novo é o "terminei" da máquina: volta a parado e fecha o que abriu. */ else if (
        agoraEstado.lado
      )
        maquina.enviar({ tipo: 'tocar', lado: agoraEstado.lado });
    },
    estado,
  };
}
