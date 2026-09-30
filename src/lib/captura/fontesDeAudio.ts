/**
 * AS FONTES DE ÁUDIO da captura ao vivo: som do sistema/aba, microfone (Whisper ou Web Speech),
 * o medidor de nível do waveform e o interruptor do microfone.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar comportamento: a fábrica roda a cada render, como as
 * closures que substituiu, e o estado da tela entra por PARÂMETRO explícito.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { getActiveProfile } from '../../gateway/activeProfile';
import { type ErroDaWebSpeech, WebSpeechStt } from '../../gateway/adapters/webSpeech';
import type { SttSession } from '../../gateway/capabilities';
import {
  type AudioCapture,
  type EspeculacaoDoFinal,
  MAX_SPEECH_MS_LOCAL,
  MAX_SPEECH_MS_NUVEM,
  type OpcoesDeCaptura,
  startMicCapture,
  startServerLoopbackCapture,
  startSystemAudioCapture,
  startSystemLoopbackCapture,
} from '../../gateway/capture/systemAudio';
import { filterLoopbackDevices, listDevices } from '../audioDevices';
import {
  consentiuReconhecimentoDoNavegador,
  escolhaDoMicGuardada,
  rapidoDoMicPermitido,
} from '../consentimentoDeNuvem';
import { t } from '../i18n';
import { isTtsActive } from '../tts';
import { abrirContextoDoClique, descartarContextoDoClique, tomarContextoDoClique } from './contextoDoClique';
import { type EscolhaDoMic, resolverMotorDoMic } from './motorDoMicrofone';
import { criarProgressoDosPacotesNativos } from './pacotesNativos';
import type { OpcoesDaPreparacao } from './pipelineDeFala';
import { segmentosDaWebSpeech } from './segmentosDaWebSpeech';
import { clog, type HandlersDaFonte, type SpeechSegment } from './tiposDaFala';
import type { OpcoesDeTraducao } from './traducaoDaFala';
import {
  type ControleDaWebSpeechDoSistema,
  type DecisaoDoMotorDoSistema,
  iniciarWebSpeechDoSistema,
  type MotorDoSistema,
} from './webSpeechDoSistema';

/** Tudo que as fontes precisam da tela — por parâmetro, sem contexto novo nem store global. */
export interface DepsDasFontesDeAudio {
  /* --- o pipeline que consome o áudio --- */
  sysHandlers: HandlersDaFonte;
  micHandlers: HandlersDaFonte;
  prepareModels: (opcoes?: OpcoesDaPreparacao) => Promise<void>;
  /**
   * O áudio da aba/sistema vai à Web Speech NO APARELHO? (`webSpeechDoSistema.ts`). Sem ele, o
   * caminho de sempre, como antes.
   */
  decidirMotorDoSistema?: () => Promise<DecisaoDoMotorDoSistema>;
  /** Quem transcreve o áudio da aba agora (o selo "Motor de IA ativo"); `null` = captura encerrada. */
  aoMudarMotorDoSistema?: (motor: MotorDoSistema | null) => void;
  /* --- escolhas de rota/dispositivo (espelhadas em ref: lidas ao ABRIR a captura) --- */
  systemSourceRef: RefObject<'display' | 'loopback' | 'server'>;
  loopbackDeviceIdRef: RefObject<string>;
  inputDeviceIdRef: RefObject<string>;
  /* --- sessões de captura em curso --- */
  systemCaptureRef: RefObject<AudioCapture | null>;
  micCaptureRef: RefObject<AudioCapture | null>;
  webSpeechRef: RefObject<SttSession | null>;
  webSpeechPartialIdRef: RefObject<string | null>;
  meterRef: RefObject<{ stop: () => void } | null>;
  isRecordingRef: RefObject<boolean>;
  micStartedAtRef: RefObject<number>;
  timerRef: RefObject<number>;
  /* --- idiomas --- */
  sourceLang: string;
  sourceLangRef: RefObject<string>;
  targetLangRef: RefObject<string>;
  /* --- fontes ligadas e motor do microfone (valores do render) --- */
  micEnabled: boolean;
  systemEnabled: boolean;
  micEngine: 'browser' | 'whisper';
  webSpeechSupported: boolean;
  /* --- relógio, waveform e tradução --- */
  pushLevel: (v: number) => void;
  nowRel: () => number;
  anchorSessionClock: (startedAtMs: number, source: 'system' | 'mic' | 'mic-fallback') => void;
  translateSegment: (segId: string, text: string, srcCode?: string, tgtCode?: string, opts?: OpcoesDeTraducao) => void;
  /* --- estado da tela --- */
  marcarMicrofone: (ligado: boolean) => void;
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  setFeedbackMsg: (msg: string) => void;
  setIsFocusMode: Dispatch<SetStateAction<boolean>>;
  setGuiaDeAudio: Dispatch<SetStateAction<string | null>>;
  setModelPrep: Dispatch<SetStateAction<ModelPrepState | null>>;
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  setMicAbrindo: Dispatch<SetStateAction<boolean>>;
  /* --- rota do STT --- */
  /** O decode final vai para a nuvem AGORA? Decide o teto de fala contínua (ver `OpcoesDeCaptura`). */
  finalNaNuvem?: () => boolean;
  /* --- privacidade do motor do microfone (padrão: as preferências, a proteção e o perfil ativo) --- */
  /** Consentimento PRÓPRIO do reconhecimento do navegador (o "Rápido"). */
  consentiuNavegador?: () => boolean;
  /** O "Rápido" existe para este perfil (protegido só com o responsável autorizando)? */
  rapidoPermitido?: () => boolean;
  /** A resposta guardada de "Rápido ou Privado?" (`null` = nunca respondeu). */
  escolhaDoMic?: () => EscolhaDoMic | null;
  /**
   * Mostra "Rápido ou Privado?" e devolve a resposta (a tela a guarda); sem ele, não pergunta.
   * `pacoteDoNavegador`: o "Privado" será o reconhecimento do próprio navegador (a instalar).
   */
  perguntarEscolhaDoMic?: (contexto: { pacoteDoNavegador: boolean }) => Promise<EscolhaDoMic | null>;
  perfilId?: () => string;
  /* --- o início de verdade (relato do dono no celular, 2026-09-28) --- */
  /**
   * A fonte ABRIU de verdade: o `getUserMedia` respondeu e o VAD subiu, a Web Speech abriu o áudio
   * (`onaudiostart`), ou o compartilhamento da aba veio. É daqui que a tela liga o relógio e o
   * "Ouvindo…" — antes eles ligavam no clique, com o microfone ainda fechado.
   */
  aoAbrirFonte?: (fonte: 'mic' | 'system') => void;
  /**
   * O microfone não abriu (permissão, serviço de voz, microfone ocupado…). A tela mostra a ajuda
   * daquele aparelho (`ajudaDoMicrofone.ts`); `motorRapido`: quem falhou foi o "Rápido" (a Web Speech
   * na nuvem), e o Privado é uma saída. Sem ele, o toast de antes.
   */
  aoFalharMicrofone?: (erro: unknown, o: { motorRapido: boolean }) => void;
  /**
   * Não abrir o SEGUNDO `getUserMedia` do medidor com a Web Speech: no Android, o reconhecedor do
   * sistema e um stream paralelo do microfone disputam o dispositivo. O indicador segue o som que a
   * própria Web Speech anuncia (`onSom`).
   */
  semMedidorParalelo?: boolean;
  /**
   * O tradutor da SUA fala no "Rápido" (`pipelineDeFala.prepararTradutorDaFala`): começa a carregar
   * quando o microfone abre, e não no primeiro final (relato do dono no celular, 2026-09-29).
   */
  prepararTradutorDaFala?: () => void;
}

/**
 * Quanto a Web Speech tem para abrir o áudio depois do `start()` (ela pode pedir a permissão nesse
 * intervalo). Passado, é a falha 'sem-audio': a tela não fica em "Abrindo…" para sempre.
 */
export const PRAZO_DO_AUDIO_DA_WEB_SPEECH_MS = 20_000;

/** O aviso "o mic foi para o modelo local por falta de consentimento" sai UMA vez por página. */
let avisouMicSemNuvem = false;

export function criarFontesDeAudio(deps: DepsDasFontesDeAudio) {
  const {
    sysHandlers,
    micHandlers,
    prepareModels,
    systemSourceRef,
    loopbackDeviceIdRef,
    inputDeviceIdRef,
    systemCaptureRef,
    micCaptureRef,
    webSpeechRef,
    webSpeechPartialIdRef,
    meterRef,
    isRecordingRef,
    micStartedAtRef,
    timerRef,
    sourceLang,
    sourceLangRef,
    targetLangRef,
    micEnabled,
    systemEnabled,
    micEngine,
    webSpeechSupported,
    pushLevel,
    nowRel,
    anchorSessionClock,
    translateSegment,
    marcarMicrofone,
    setSpeechSegments,
    setFeedbackMsg,
    setIsFocusMode,
    setGuiaDeAudio,
    setModelPrep,
    setIsRecording,
    setMicAbrindo,
    finalNaNuvem,
  } = deps;
  const consentiu = deps.consentiuNavegador ?? consentiuReconhecimentoDoNavegador;
  const rapidoPermitido = deps.rapidoPermitido ?? rapidoDoMicPermitido;
  const escolhaDoMic = deps.escolhaDoMic ?? (() => escolhaDoMicGuardada());
  const perfilId = deps.perfilId ?? (() => getActiveProfile().id);

  /* O teto do corte forçado acompanha o motor FINAL: 12 s na nuvem (cobrança mínima de 10 s por
     pedido; frase inteira transcreve melhor), 6 s no Whisper local. Função, não número: a rota só é
     conhecida depois que a captura abriu (ver `prepareModels`). */
  const opcoesDeCaptura: OpcoesDeCaptura = {
    maxSpeechMs: () => (finalNaNuvem?.() ? MAX_SPEECH_MS_NUVEM : MAX_SPEECH_MS_LOCAL),
  };

  // Inicia a captura do áudio do sistema/aba: pede a fonte (gesto do usuário) e prepara o modelo.
  /* QUEM TRANSCREVE A ABA (degrau T2, `webSpeechDoSistema.ts`). A decisão corre EM PARALELO ao seletor
     de compartilhamento (que precisa da ativação do clique, então não espera nada): resolvida para o
     caminho de sempre, a preparação do Whisper começa na hora, como antes. Para a Web Speech no
     aparelho, a captura abre, a Web Speech tenta a MESMA trilha, e só então o que falta é preparado
     (o tradutor; o Whisper só se o microfone o usar). O VAD segue ouvindo: ele é o fiscal do teste
     em execução (fala detectada sem resultado → Whisper), e a gravação da sessão é dele.
     Enquanto a decisão não chega, o que o VAD entrega fica guardado e vai ao pipeline se ele for o
     motor; se for a Web Speech, é descartado (ela começa a ouvir dali em diante). */
  const handleStartSystemCapture = async () => {
    // O estado de gravação (isRecording/timer) já foi ligado por handleStartRecording (captura dupla).
    const source = systemSourceRef.current;
    const decidir = deps.decidirMotorDoSistema;
    let rota: 'decidindo' | 'navegador' | 'pipeline' = decidir ? 'decidindo' : 'pipeline';
    const pendentes: Array<() => void> = [];
    const encaminhar = (f: () => void) => {
      if (rota === 'pipeline') f();
      else if (rota === 'decidindo') pendentes.push(f);
    };
    let navegador: ControleDaWebSpeechDoSistema | null = null;
    let prepNavegador: Promise<void> = Promise.resolve();
    const idDoParcialDoSistema: { current: string | null } = { current: null };

    clog('sistema: preparar modelos locais + fonte:', source);
    const decisao: Promise<DecisaoDoMotorDoSistema | null> = decidir
      ? decidir()
          .catch(() => null)
          .then((d) => {
            clog('sistema: motor', d?.motor ?? 'pipeline', `(${d?.motivo ?? 'sem decisão'})`);
            if (d?.motor !== 'web-speech-local') void prepareModels();
            return d;
          })
      : (void prepareModels(), Promise.resolve(null));

    const usarPipeline = () => {
      rota = 'pipeline';
      for (const f of pendentes.splice(0)) f();
    };

    /* A Web Speech não serviu no meio da sessão: o Whisper entra sem a pessoa fazer nada. O balão
       parcial que ela deixou aberto sai (nunca receberia o final). */
    const cairParaOPipeline = (motivo: string) => {
      clog('sistema: Web Speech no aparelho não serviu (', motivo, '), seguindo no Whisper');
      navegador = null;
      rota = 'pipeline';
      const pid = idDoParcialDoSistema.current;
      idDoParcialDoSistema.current = null;
      if (pid) setSpeechSegments((prev) => prev.filter((seg) => seg.id !== pid));
      deps.aoMudarMotorDoSistema?.('pipeline');
      void prepNavegador.finally(() => void prepareModels());
    };

    const tentarNavegador = (trilha: MediaStreamTrack | undefined): boolean => {
      if (!trilha) return false;
      const { aoParcial, aoFinal } = segmentosDaWebSpeech({
        source: 'system',
        speakerId: 'system',
        idiomaDasPalavras: targetLangRef.current,
        de: () => targetLangRef.current.split('-')[0], // você OUVE o idioma-alvo
        para: () => sourceLangRef.current.split('-')[0],
        falada: false,
        idDoParcialRef: idDoParcialDoSistema,
        timerRef,
        nowRel,
        setSpeechSegments,
        translateSegment,
      });
      navegador = iniciarWebSpeechDoSistema({
        trilha,
        lang: targetLangRef.current,
        aoParcial,
        aoFinal,
        aoCair: cairParaOPipeline,
      });
      return navegador !== null;
    };

    try {
      const cb = {
        onUtterance: (pcm: Float32Array, sr: number, seq: number, esp?: EspeculacaoDoFinal) => {
          if (rota === 'navegador') return navegador?.falaTerminou();
          encaminhar(() => sysHandlers.onUtterance(pcm, sr, seq, esp));
        },
        onSpeechStart: (seq: number) => {
          clog('VAD: início de fala (sistema, seq', seq, ')');
          if (rota === 'navegador') return navegador?.falaComecou();
          encaminhar(() => sysHandlers.onSpeechStart(seq));
        },
        // Parcial velho não tem valor: só vai ao pipeline quando ele já é o motor.
        onPartialAudio: (pcm: Float32Array, sr: number, seq: number) => {
          if (rota === 'pipeline') sysHandlers.onPartialAudio(pcm, sr, seq);
        },
        // Perguntado ANTES de a captura copiar o áudio: fora do pipeline o parcial nem se monta.
        querParcial: () => rota === 'pipeline' && (sysHandlers.querParcial?.() ?? true),
        intervaloDosParciais: sysHandlers.intervaloDosParciais,
        primeiroParcialComMs: sysHandlers.primeiroParcialComMs,
        onFinalEspeculativo: (pcm: Float32Array, sr: number, seq: number) =>
          rota === 'pipeline' ? sysHandlers.onFinalEspeculativo(pcm, sr, seq) : null,
        onMisfire: (seq: number) => {
          if (rota !== 'navegador') encaminhar(() => sysHandlers.onMisfire(seq));
        },
        onLevel: pushLevel,
        onStatus: (msg: string) => {
          clog('sistema:', msg);
          setFeedbackMsg(msg);
          setTimeout(() => setFeedbackMsg(''), 4000);
        },
        onError: (err: Error) => {
          clog('sistema ERRO assíncrono:', err.message);
          setFeedbackMsg('Erro na captura do sistema: ' + err.message);
          setTimeout(() => setFeedbackMsg(''), 6000);
        },
      };
      const captura: AudioCapture =
        source === 'server'
          ? await startServerLoopbackCapture(cb, opcoesDeCaptura)
          : source === 'loopback'
            ? await (async () => {
                /* Sem dispositivo escolhido E sem nenhum candidato (Stereo Mix / VB-Cable) o getUserMedia
                 abriria o MICROFONE padrão, e a pessoa acharia que o "loopback" estava ligado enquanto
                 ouvia o próprio ambiente. Medido no teste do dono (2026-08-26): sem legenda nenhuma.
                 Melhor recusar com o caminho certo do que capturar a fonte errada em silêncio. */
                if (!loopbackDeviceIdRef.current) {
                  const { inputs } = await listDevices();
                  if (!filterLoopbackDevices(inputs).detected) {
                    throw new Error(
                      'Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) existe neste computador, sem ele, esta rota captaria o microfone. Use "Compartilhar aba/tela" (marque "compartilhar áudio") ou instale o VB-Audio Cable.',
                    );
                  }
                }
                return startSystemLoopbackCapture(loopbackDeviceIdRef.current || undefined, cb, opcoesDeCaptura);
              })()
            : await startSystemAudioCapture(cb, opcoesDeCaptura);
      /* A captura com a Web Speech junto: parar/pausar/mudar a captura faz o mesmo com o reconhecedor. */
      systemCaptureRef.current = {
        ...captura,
        setMuted: (m) => {
          captura.setMuted(m);
          navegador?.pausar(m);
        },
        setPaused: (p) => {
          captura.setPaused(p);
          navegador?.pausar(p);
        },
        stop: () => {
          navegador?.parar();
          navegador = null;
          deps.aoMudarMotorDoSistema?.(null);
          return captura.stop();
        },
      };
      clog('captura do sistema ATIVA ✓');
      const d = await decisao;
      if (d?.motor === 'web-speech-local' && tentarNavegador(captura.trilhaDeAudio)) {
        rota = 'navegador';
        pendentes.length = 0;
        clog('sistema: áudio da aba no reconhecedor do navegador, NO APARELHO ✓ (Whisper não carrega)');
        deps.aoMudarMotorDoSistema?.('web-speech-local');
        prepNavegador = prepareModels({ sistemaNoNavegador: true });
      } else {
        if (d?.motor === 'web-speech-local') {
          clog('sistema: a Web Speech não abriu com a trilha, seguindo no Whisper');
          void prepareModels();
        }
        usarPipeline();
        deps.aoMudarMotorDoSistema?.('pipeline');
      }
      if (systemCaptureRef.current) anchorSessionClock(systemCaptureRef.current.startedAtMs, 'system');
      deps.aoAbrirFonte?.('system');
      setFeedbackMsg(
        micEnabled
          ? 'Captura DUPLA ativa: microfone (você) + sistema/aba (outros). A transcrição do sistema aparece e refina em tempo real.'
          : 'Capturando áudio do sistema/aba. A transcrição aparece e refina em tempo real.',
      );
      setTimeout(() => setFeedbackMsg(''), 5000);
    } catch (err) {
      clog('getDisplayMedia FALHOU:', (err as Error).message);
      const code = (err as Error & { code?: string }).code;
      if (code === 'JANELA_SEM_AUDIO' || code === 'SEM_AUDIO_COMPARTILHADO' || code === 'AUDIO_DA_TELA_INDISPONIVEL') {
        // Sem áudio na superfície escolhida, ou o Windows recusou o áudio da janela/tela: em vez de
        // um toast que some, um guia com o caminho de volta (o picker só reabre com um novo gesto;
        // no caso do Windows, o guia oferece trocar para a aba ou para o loopback).
        setIsFocusMode(false);
        setGuiaDeAudio(code);
      } else {
        setFeedbackMsg((err as Error).message);
        setTimeout(() => setFeedbackMsg(''), 7000);
      }
      // mantém o painel se estava em erro de modelo; só limpa se não havia erro
      setModelPrep((s) => (s?.error ? s : null));
      // Se o sistema era a ÚNICA fonte, encerra a gravação (se o mic também estiver ligado, ele continua).
      if (!micEnabled) {
        setIsRecording(false);
        isRecordingRef.current = false;
      } else if (micStartedAtRef.current) {
        // Sistema falhou, mas o mic segue: o áudio salvo passa a ser o do mic → ancora nele.
        anchorSessionClock(micStartedAtRef.current, 'mic-fallback');
      }
    }
  };

  // Inicia a captura do MICROFONE (sua voz) — mesmo pipeline VAD+Whisper do sistema, no
  // dispositivo de entrada escolhido. Substitui a antiga Web Speech API (que não deixava
  // escolher o dispositivo nem funcionava offline).
  const handleStartMicCapture = async () => {
    clog('mic: preparar modelos locais + getUserMedia…');
    void prepareModels();
    /* O contexto criado NO CLIQUE (`contextoDoClique.ts`): o VAD e a sonda usam ele, e não um criado
       depois dos `await` (no iPhone, esse pode ficar 'suspended' e nenhum quadro chega). */
    const contexto = tomarContextoDoClique();
    try {
      micCaptureRef.current = await startMicCapture(
        inputDeviceIdRef.current || undefined,
        {
          onUtterance: micHandlers.onUtterance,
          onSpeechStart: (seq) => {
            clog('VAD: início de fala (mic, seq', seq, ')');
            micHandlers.onSpeechStart(seq);
          },
          onPartialAudio: micHandlers.onPartialAudio,
          querParcial: micHandlers.querParcial,
          intervaloDosParciais: micHandlers.intervaloDosParciais,
          primeiroParcialComMs: micHandlers.primeiroParcialComMs,
          onFinalEspeculativo: micHandlers.onFinalEspeculativo,
          onMisfire: (seq) => micHandlers.onMisfire(seq),
          onLevel: pushLevel,
          onStatus: (msg) => {
            clog('mic:', msg);
            setFeedbackMsg(msg);
            setTimeout(() => setFeedbackMsg(''), 4000);
          },
          onError: (err) => {
            clog('mic ERRO assíncrono:', err.message);
            setFeedbackMsg('Erro no microfone: ' + err.message);
            setTimeout(() => setFeedbackMsg(''), 6000);
          },
        },
        contexto ? { ...opcoesDeCaptura, audioContext: contexto } : opcoesDeCaptura,
      );
      clog('captura do microfone ATIVA ✓');
      deps.aoAbrirFonte?.('mic');
      micStartedAtRef.current = micCaptureRef.current?.startedAtMs ?? 0;
      anchorSessionClock(micStartedAtRef.current, 'mic'); // ancora só se o mic for a fonte do áudio salvo
      if (!systemEnabled) {
        setFeedbackMsg('Microfone ativo. Fale, a transcrição aparece e refina em tempo real.');
        setTimeout(() => setFeedbackMsg(''), 3500);
      }
    } catch (err) {
      clog('getUserMedia(mic) FALHOU:', (err as Error).message);
      // O contexto do clique não serviu a ninguém (a permissão falhou antes do VAD): fecha.
      if (contexto && contexto.state !== 'closed') void contexto.close().catch(() => {});
      if (deps.aoFalharMicrofone) deps.aoFalharMicrofone(err, { motorRapido: false });
      else {
        setFeedbackMsg((err as Error).message);
        setTimeout(() => setFeedbackMsg(''), 7000);
      }
      setModelPrep((s) => (s?.error ? s : null));
      if (!systemEnabled) {
        // mic era a única fonte → encerra a gravação
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  };

  // Medidor de nível LEVE (só p/ o waveform) — necessário no motor navegador, pois a Web Speech
  // não expõe o áudio. Abre um getUserMedia próprio e mede RMS. Best-effort.
  const startMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceIdRef.current ? { deviceId: { exact: inputDeviceIdRef.current } } : true,
      });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const iv = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        pushLevel(Math.min(1, Math.sqrt(s / buf.length) * 4));
      }, 50);
      meterRef.current = {
        stop: () => {
          clearInterval(iv);
          stream.getTracks().forEach((t) => t.stop());
          ctx.close().catch(() => {});
        },
      };
    } catch {
      /* medidor é opcional */
    }
  };

  // MICROFONE via Web Speech API (navegador) — motor PADRÃO: leve, sem baixar modelo, ótimo p/
  // português. Usa o adaptador WebSpeechStt do gateway. Não escolhe dispositivo (usa o padrão do
  // SO) — para isso, o usuário troca para o motor Whisper. Sem streaming de PCM: partials/finais.
  // `noAparelho`: reconhecimento LOCAL (`processLocally`); devolve false se o navegador não o tem —
  // quem chama cai no Whisper em vez de mandar o áudio ao Google (ver `motorDoMicrofone.ts`).
  const startWebSpeechMic = (noAparelho = false): boolean => {
    // A Web Speech abre o microfone sozinha: o contexto do clique não tem uso aqui.
    descartarContextoDoClique();
    const speakerId = 'user';
    const from = sourceLangRef.current.split('-')[0];
    const to = targetLangRef.current.split('-')[0];
    try {
      const { aoParcial, aoFinal } = segmentosDaWebSpeech({
        source: 'mic',
        speakerId,
        idiomaDasPalavras: sourceLang,
        de: () => from,
        para: () => to,
        falada: true,
        idDoParcialRef: webSpeechPartialIdRef,
        timerRef,
        nowRel,
        setSpeechSegments,
        translateSegment,
        ignorar: isTtsActive, // anti-eco: o mic ouviu o TTS do app pelos alto-falantes
      });
      /* O ÁUDIO ABRIU? Só o `onaudiostart` diz (o `start()` volta na hora, com a permissão ainda
         pendente). Até lá, a tela fica em "Abrindo o microfone…", nunca em "Ouvindo…" com ele fechado. */
      let abriu = false;
      /** Esta sessão já acabou (falhou ou foi encerrada): o que chegar depois não conta. */
      let acabou = false;
      let sessao: SttSession | null = null;
      const prazo: { id?: ReturnType<typeof setTimeout> } = {};
      let som: ReturnType<typeof setInterval> | null = null;
      const pararSom = () => {
        if (som) clearInterval(som);
        som = null;
      };
      const encerrar = () => {
        acabou = true;
        clearTimeout(prazo.id);
        pararSom();
        try {
          sessao?.stop();
        } catch {
          /* já parado */
        }
        if (sessao && webSpeechRef.current === sessao) {
          webSpeechRef.current = null;
          webSpeechPartialIdRef.current = null;
        }
        meterRef.current?.stop();
        meterRef.current = null;
      };
      /** A Web Speech não serve: encerra ESTA sessão e mostra a ajuda (com o "Trocar para Privado"). */
      const falhou = (erro: unknown) => {
        if (acabou) return;
        // `sessao` ainda nula = falhou DENTRO do `start()`: é notícia também.
        const ainda = sessao === null || webSpeechRef.current === sessao;
        encerrar();
        if (!ainda) return; // a pessoa já parou ou mutou: o erro tardio não é notícia
        clog('web-speech mic FALHOU:', String(erro), (erro as ErroDaWebSpeech)?.codigo ?? '');
        if (deps.aoFalharMicrofone) deps.aoFalharMicrofone(erro, { motorRapido: !noAparelho });
        else {
          setFeedbackMsg((erro as Error).message);
          setTimeout(() => setFeedbackMsg(''), 7000);
        }
        if (!systemEnabled) {
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      };
      sessao = new WebSpeechStt({ processLocally: noAparelho }).startLive(sourceLangRef.current, {
        onPartial: aoParcial,
        onFinal: ({ text }: { text: string }) => aoFinal(text),
        onError: (e: Error) => {
          clog('web-speech mic erro:', String(e));
          if ((e as ErroDaWebSpeech).fatal) return falhou(e);
          // Aviso (no-speech): a sessão segue; a dica aparece e some.
          setFeedbackMsg(e.message);
          setTimeout(() => setFeedbackMsg(''), 4000);
        },
        onAudioAberto: () => {
          if (abriu) return;
          abriu = true;
          clearTimeout(prazo.id);
          if (webSpeechRef.current !== sessao || !isRecordingRef.current) return;
          clog('microfone (Web Speech', noAparelho ? 'no aparelho' : 'na nuvem', ') ABRIU o áudio ✓');
          // Sem gravação a alinhar (a Web Speech não grava): o relógio zera quando o áudio abre.
          anchorSessionClock(Date.now(), 'mic');
          deps.aoAbrirFonte?.('mic');
          if (!deps.semMedidorParalelo) void startMeter(); // waveform real (a Web Speech não fornece nível)
          // O tradutor já, sem esperar a primeira legenda. Com o sistema, quem o prepara é `prepareModels`.
          if (!systemEnabled) deps.prepararTradutorDaFala?.();
          if (!systemEnabled) {
            setFeedbackMsg('Microfone (navegador) ativo, transcrição instantânea. Fale à vontade.');
            setTimeout(() => setFeedbackMsg(''), 3000);
          }
        },
        /* Sem o medidor paralelo, o indicador segue o som que a Web Speech anuncia: não é o nível
           medido, é "há som" (as ondas oscilam enquanto há som e param sem ele). */
        onSom: (ha: boolean) => {
          if (!deps.semMedidorParalelo) return;
          pararSom();
          if (ha) som = setInterval(() => pushLevel(0.25 + Math.random() * 0.35), 100);
        },
      });
      if (acabou) return true; // falhou no próprio `start()`: a ajuda já está na tela
      webSpeechRef.current = sessao;
      prazo.id = setTimeout(() => {
        if (!abriu)
          falhou(
            Object.assign(new Error('O reconhecimento de fala do navegador não conseguiu abrir o microfone.'), {
              codigo: 'sem-audio',
              fatal: true,
            }),
          );
      }, PRAZO_DO_AUDIO_DA_WEB_SPEECH_MS);
      clog('microfone (Web Speech', noAparelho ? 'no aparelho' : 'na nuvem', ') pedido, esperando o áudio abrir');
      return true;
    } catch (e) {
      // O local falhou (navegador sem `processLocally`): quem chama cai no Whisper, sem aviso de erro.
      if (noAparelho) {
        clog('Web Speech no aparelho indisponível:', (e as Error).message);
        return false;
      }
      setFeedbackMsg('Web Speech indisponível: ' + (e as Error).message + ', troque para o motor Whisper.');
      setTimeout(() => setFeedbackMsg(''), 5000);
      if (!systemEnabled) {
        setIsRecording(false);
        isRecordingRef.current = false;
      }
      return false;
    }
  };

  // Liga o microfone conforme o motor escolhido (navegador vs Whisper).
  // Devolve promessa para que quem liga o mic NO MEIO da sessão saiba quando a permissão
  // do navegador terminou — é esse intervalo que o botão mostra como "pedindo permissão…".
  /* O MOTOR PASSA PELA PRIVACIDADE (`motorDoMicrofone.ts`): Web Speech no aparelho quando o navegador
     reconhece o idioma localmente; a Web Speech na nuvem (áudio ao Google) só com o "Rápido"
     consentido e fora dos perfis Privado e protegido; senão o Whisper local. Na primeira vez sem o
     reconhecimento no aparelho, a tela pergunta "Rápido ou Privado?" (`perguntarEscolhaDoMic`) antes
     de o mic abrir. Sempre a partir de um clique (Iniciar, desmutar, retomar) — é o que permite pedir
     a instalação do pacote do idioma. */
  const startMic = async (): Promise<void> => {
    const decisao = await resolverMotorDoMic({
      preferido: micEngine,
      webSpeechSuportado: webSpeechSupported,
      consentiuNavegador: consentiu(),
      rapidoPermitido: rapidoPermitido(),
      escolha: escolhaDoMic(),
      perguntar: deps.perguntarEscolhaDoMic,
      perfilId: perfilId(),
      lang: sourceLangRef.current,
      /* Pacote de voz do navegador sendo instalado (o degrau seria o nosso Whisper): a linha dele
         na barra de preparo, como o Translator (`pacotesNativos.ts`). */
      aoInstalar: criarProgressoDosPacotesNativos({ setModelPrep, ativo: () => isRecordingRef.current, clog }).voz,
    });
    clog(
      'microfone: motor',
      decisao.motor,
      `(${decisao.motivo})`,
      decisao.instalarNoAparelho ? '| pacote local pedido' : '',
    );
    if (decisao.motor === 'web-speech-local' && startWebSpeechMic(true)) return;
    if (decisao.motor === 'web-speech-nuvem') {
      startWebSpeechMic(false);
      return;
    }
    /* O aviso só onde ele informa: no perfil Privado, e para quem fechou a pergunta sem escolher.
       Quem acabou de escolher "Privado" já sabe; o perfil protegido nunca viu o "Rápido". */
    const semEscolha = decisao.motivo === 'sem-consentimento' && escolhaDoMic() === null;
    if (micEngine === 'browser' && (semEscolha || decisao.motivo === 'perfil-privado') && !avisouMicSemNuvem) {
      avisouMicSemNuvem = true;
      setFeedbackMsg(
        decisao.motivo === 'perfil-privado'
          ? 'Perfil Privado: sua voz é transcrita no aparelho (a transcrição do navegador enviaria o áudio ao Google).'
          : t('Sua voz é transcrita neste aparelho. Para o modo Rápido, troque em Dispositivos e modelos de IA.'),
      );
      setTimeout(() => setFeedbackMsg(''), 8000);
    }
    await handleStartMicCapture();
  };

  /**
   * O INTERRUPTOR DO MICROFONE — a única fonte que a pessoa escolhe, e ela pode escolher
   * A QUALQUER MOMENTO, inclusive no meio da gravação.
   *
   * O QUE ISTO SUBSTITUI. A tela pedia, ANTES de gravar, quais fontes entravam: dois cartões
   * ("Som do computador" / "Meu microfone") mais um seletor de rota. Era uma decisão tomada no
   * pior momento possível — antes de a sessão existir — e irreversível depois: quem começasse a
   * assistir uma aula e quisesse repetir uma frase em voz alta tinha de parar, salvar e recomeçar.
   * Agora o som do computador entra sempre e o microfone é um MUDO/ATIVO, como em qualquer chamada.
   *
   * TRÊS CAMINHOS, porque o estado real da captura é diferente em cada um:
   *  1. Fora da sessão — só marca a preferência; nada é aberto (nenhuma permissão pedida à toa).
   *  2. Primeira vez ATIVO na sessão — abre a captura agora. É aqui, e só aqui, que o navegador
   *     pede permissão do microfone: quem nunca desmuta nunca vê o pedido.
   *  3. Já aberto — alterna o mudo da faixa. Nada de fechar e reabrir: ver `AudioCapture.setMuted`.
   */
  const alternarMicrofone = (ligado: boolean) => {
    marcarMicrofone(ligado);
    // O aviso do protótipo, gravando ou não: diz o que o botão acabou de mudar.
    setFeedbackMsg(
      ligado
        ? 'Microfone ativo: a sua voz entra e é separada das outras'
        : 'Microfone mudo: só o som do computador entra',
    );
    if (!isRecordingRef.current) return; // (1) fora da sessão: só a preferência

    if (!ligado) {
      micCaptureRef.current?.setMuted(true);
      /* O motor NAVEGADOR (Web Speech) não grava áudio nenhum — não há blob para preservar,
         então encerrar o reconhecedor É o mudo dele. Ao desmutar, começa outro. */
      if (webSpeechRef.current) {
        try {
          webSpeechRef.current.stop();
        } catch {
          /* já parado */
        }
        webSpeechRef.current = null;
        webSpeechPartialIdRef.current = null;
      }
      clog('microfone MUDO no meio da sessão');
      return;
    }

    if (micCaptureRef.current) {
      // (3) já aberto: só desmuta
      micCaptureRef.current.setMuted(false);
      clog('microfone ATIVO de novo (faixa reabilitada)');
      return;
    }

    clog('microfone ATIVO no meio da sessão: abrindo a captura agora'); // (2) primeira vez
    abrirContextoDoClique(); // dentro do gesto, antes de qualquer `await` (ver `contextoDoClique.ts`)
    setMicAbrindo(true);
    void startMic().finally(() => setMicAbrindo(false));
  };

  return { handleStartSystemCapture, startMic, alternarMicrofone };
}
