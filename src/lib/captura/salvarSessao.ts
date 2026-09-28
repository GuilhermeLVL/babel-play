/**
 * O CICLO DA SESSÃO da captura ao vivo: começar, retomar, parar e SALVAR (falas, áudio e
 * vocabulário) — a persistência inteira que ficava no meio de `views/LiveCapture.tsx`.
 *
 * Saiu de lá sem mudar comportamento: a fábrica roda a cada render, como as closures que
 * substituiu (ela lê `timer`, `speechSegments` e o par de idiomas do render corrente), e tudo
 * que vem da tela entra por PARÂMETRO explícito — nada de contexto novo nem store global.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ModelPrepState } from '../../components/ModelPrepPanel';
import type { NewUtterancePayload } from '../../data/api';
import type { SttSession } from '../../gateway/capabilities';
import { capMetrics } from '../../gateway/capture/captureMetrics';
import type { AudioCapture } from '../../gateway/capture/systemAudio';
import { iniciarTelemetriaDeCaptura, pararTelemetriaDeCaptura } from '../../gateway/capture/telemetriaDeCaptura';
import type { ContextoDoStt } from '../../gateway/promptDeStt';
import { Recording } from '../../types';
import { DominantLangTracker } from '../convoLang';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { comPrazo } from '../dispositivo/sonda';
import { burstFromElement } from '../effects';
import { dataHora } from '../i18n';
import { misturarAudios } from '../misturarAudios';
import { OrdemDasTraducoes } from '../ordemDaTraducao';
import { PerfilAdaptativoDeIdioma } from '../perfilDeIdioma';
import { abrirSessaoDeCaptura, fecharSessaoDeCaptura } from '../sessaoDeCaptura';
import { play } from '../soundFx';
import { SpeakerClusterer } from '../speakerCluster';
import { preloadSpeakerId } from '../speakerId';
import { aguardarFinaisEmVoo, prazoDaMistura } from './finaisEmVoo';
import { criarProgressoDosPacotesNativos } from './pacotesNativos';
import type { RascunhoDaCaptura } from './rascunhoDaCaptura';
import {
  type CaptureScenario,
  clog,
  type GatewayDaCaptura,
  type SpeakerProfile,
  type SpeechSegment,
} from './tiposDaFala';
import { salvarCaptura } from './trabalhoDeSalvar';
import { idiomaDaFala, parDaSessao } from './vocabularioDaSessao';

/** Estado honesto da identificação de voz, exibido no painel Falantes. */
export type EstadoDaIdentificacaoDeVoz = 'off' | 'loading' | 'ready' | 'unavailable';

/** Tudo que o ciclo da sessão precisa da tela — por parâmetro, sem contexto novo. */
export interface DepsDeSalvarSessao {
  gateway: GatewayDaCaptura;
  /* --- props da tela --- */
  onSave: (recording: Recording, shouldRedirect?: boolean) => void;
  recordings?: Recording[];
  /* --- valores do render (a sessão em curso) --- */
  speechSegments: SpeechSegment[];
  timer: number;
  sourceLang: string;
  targetLang: string;
  micEnabled: boolean;
  systemEnabled: boolean;
  micEngine: 'browser' | 'whisper';
  captureScenario: CaptureScenario;
  speakerAutoId: boolean;
  resumeId: string | null;
  customSessionTitle: string;
  customSessionImage: string;
  /* --- fontes de áudio (ligadas por handleStartRecording, encerradas por handleStopRecording) --- */
  startMic: () => Promise<void>;
  handleStartSystemCapture: () => Promise<void>;
  systemCaptureRef: RefObject<AudioCapture | null>;
  micCaptureRef: RefObject<AudioCapture | null>;
  webSpeechRef: RefObject<SttSession | null>;
  webSpeechPartialIdRef: RefObject<string | null>;
  meterRef: RefObject<{ stop: () => void } | null>;
  recordedAudioRef: RefObject<Blob | null>;
  /* --- relógio e estado do pipeline --- */
  isRecordingRef: RefObject<boolean>;
  sessionStartMsRef: RefObject<number>;
  shouldAnchorClockRef: RefObject<boolean>;
  micStartedAtRef: RefObject<number>;
  partialIdRef: RefObject<string | null>;
  seqToSegmentRef: RefObject<Map<number, string>>;
  lastPartialTextRef: RefObject<Map<number, string>>;
  ordemMtRef: RefObject<OrdemDasTraducoes>;
  /** Contexto do STT de nuvem (última final por fonte). Zerado no START: sessão nova, conversa nova. */
  contextoDoSttRef?: RefObject<ContextoDoStt>;
  /* --- memória de vozes e de idioma (zerada só em sessão NOVA) --- */
  clustererRef: RefObject<SpeakerClusterer>;
  dominantLangRef: RefObject<DominantLangTracker>;
  perfilIdiomaRef: RefObject<PerfilAdaptativoDeIdioma>;
  altTargetNotifiedRef: RefObject<boolean>;
  lastVoiceIdRef: RefObject<string | null>;
  provisionalUttsRef: RefObject<Map<number, string[]>>;
  speakerProfilesRef: RefObject<SpeakerProfile[]>;
  /* --- estado da tela --- */
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  setTimer: Dispatch<SetStateAction<number>>;
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  setIdiomaObservado: Dispatch<SetStateAction<string>>;
  setSpeakerIdStatus: Dispatch<SetStateAction<EstadoDaIdentificacaoDeVoz>>;
  setModelPrep: Dispatch<SetStateAction<ModelPrepState | null>>;
  setResumeId: Dispatch<SetStateAction<string | null>>;
  setShowSaveModal: Dispatch<SetStateAction<boolean>>;
  setCustomSessionTitle: Dispatch<SetStateAction<string>>;
  setCustomSessionImage: Dispatch<SetStateAction<string>>;
  setImgQuery: Dispatch<SetStateAction<string>>;
  setFeedbackMsg: (msg: string) => void;
  /**
   * "Salvar e ficar aqui" (protótipo): as falas continuam na tela com "Abrir a sessão salva" e
   * quantas palavras foram para o caderno (`null` enquanto o vocabulário é fichado).
   */
  setSessaoSalva: (s: { id: string; palavras: number | null } | null) => void;
  /**
   * A PAUSA do Encerrar (protótipo, C8): "Parar" pausa as fontes e abre o diálogo; "Continuar
   * gravando" retoma as MESMAS fontes. `pausaInicioRef` guarda quando a pausa começou, para o
   * relógio das legendas pular o trecho que o gravador não gravou.
   */
  setPausado: (p: boolean) => void;
  pausaInicioRef: RefObject<number>;
  /* --- fim da captura sem prender ninguém (relato do dono, 2026-09-28) --- */
  /** As falas MAIS RECENTES (o ref da tela): o salvamento espera as que estão em voo. */
  lerFalas?: () => SpeechSegment[];
  /** A chave de idempotência DESTA captura: nasce no início, vale para toda tentativa de salvar. */
  origemLocalIdRef?: RefObject<string>;
  /** A gravação mudou depois de salva (o áudio subiu): o App atualiza a lista. */
  aoAtualizarGravacao?: (recording: Recording) => void;
  /** O teto sem conta já foi atingido: começar uma captura nova só leva a um salvamento recusado. */
  tetoAtingido?: boolean;
  aoTetoAtingido?: () => void;
}

/** Uma chave de captura (8 a 64 caracteres, como pede o `origemLocalId` do servidor). */
function novaChaveDeCaptura(): string {
  try {
    return `captura-${crypto.randomUUID()}`;
  } catch {
    return `captura-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function criarSalvarSessao(deps: DepsDeSalvarSessao) {
  const {
    gateway,
    onSave,
    recordings,
    speechSegments,
    timer,
    sourceLang,
    targetLang,
    micEnabled,
    systemEnabled,
    micEngine,
    captureScenario,
    speakerAutoId,
    resumeId,
    customSessionTitle,
    customSessionImage,
    startMic,
    handleStartSystemCapture,
    systemCaptureRef,
    micCaptureRef,
    webSpeechRef,
    webSpeechPartialIdRef,
    meterRef,
    recordedAudioRef,
    isRecordingRef,
    sessionStartMsRef,
    shouldAnchorClockRef,
    micStartedAtRef,
    partialIdRef,
    seqToSegmentRef,
    lastPartialTextRef,
    ordemMtRef,
    contextoDoSttRef,
    clustererRef,
    dominantLangRef,
    perfilIdiomaRef,
    altTargetNotifiedRef,
    lastVoiceIdRef,
    provisionalUttsRef,
    speakerProfilesRef,
    setIsRecording,
    setTimer,
    setSpeechSegments,
    setIdiomaObservado,
    setSpeakerIdStatus,
    setModelPrep,
    setResumeId,
    setShowSaveModal,
    setCustomSessionTitle,
    setCustomSessionImage,
    setImgQuery,
    setFeedbackMsg,
    setSessaoSalva,
    setPausado,
    pausaInicioRef,
    lerFalas = () => speechSegments,
    origemLocalIdRef,
    aoAtualizarGravacao,
    tetoAtingido,
    aoTetoAtingido,
  } = deps;

  const handleStartRecording = () => {
    if (!micEnabled && !systemEnabled) {
      setFeedbackMsg('Selecione ao menos uma fonte: Microfone e/ou Sistema.');
      setTimeout(() => setFeedbackMsg(''), 4000);
      return;
    }
    // RETOMANDO: já há transcript reidratado → NÃO zere timer/segmentos; o relógio da
    // sessão recua `timer` segundos para que os novos enunciados continuem a linha do tempo.
    const resuming = !!(resumeId && speechSegments.length > 0);
    // Retorno sensorial no momento exato em que a gravação começa — som + rajada saindo do botão
    // que a pessoa acabou de apertar. Antes, começar a gravar era completamente silencioso.
    play('recordStart');
    burstFromElement(document.activeElement, 'record');
    clog('▶ START, microfone:', micEnabled, '| sistema:', systemEnabled, resuming ? '| RETOMANDO' : '');
    setIsRecording(true);
    setSessaoSalva(null);
    isRecordingRef.current = true;
    sessionStartMsRef.current = resuming ? Date.now() - timer * 1000 : Date.now();
    shouldAnchorClockRef.current = !resuming; // sessão nova → o relógio será re-ancorado ao recorder
    micStartedAtRef.current = 0;
    partialIdRef.current = null;
    seqToSegmentRef.current.clear();
    lastPartialTextRef.current.clear();
    ordemMtRef.current.limpar(); // os selos são por segmento; sessão nova começa do zero
    capMetrics.reset();
    iniciarTelemetriaDeCaptura(); // números de qualidade a cada 60 s (sem texto; ver o módulo)
    abrirSessaoDeCaptura(); // agrupa as chamadas de IA desta captura no Langfuse
    contextoDoSttRef?.current.limpar();
    // Identificação de voz: sessão nova = memória de vozes nova (retomada mantém os clusters
    // — as "Pessoas" já nomeadas continuam valendo). O modelo (6,7MB, cacheado) carrega em
    // background; o painel Falantes mostra o estado honesto.
    if (!resuming) {
      clustererRef.current.reset();
      dominantLangRef.current.reset();
      // Sessão nova não herda a conclusão da anterior: o conteúdo pode ser outro idioma.
      perfilIdiomaRef.current.reset();
      setIdiomaObservado('');
      altTargetNotifiedRef.current = false;
      lastVoiceIdRef.current = null;
      provisionalUttsRef.current.clear();
    }
    if (captureScenario === 'conversation' && speakerAutoId && systemEnabled) {
      setSpeakerIdStatus('loading');
      void preloadSpeakerId().then((ok) => {
        setSpeakerIdStatus(ok ? 'ready' : 'unavailable');
        clog(
          ok
            ? 'identificação de voz PRONTA ✓ (WeSpeaker q8, WASM)'
            : 'identificação de voz INDISPONÍVEL, segue com atribuição manual',
        );
      });
    } else {
      setSpeakerIdStatus('off');
    }
    // Aquece o MT local (opus-mt) para as DUAS direções (mic: fonte→alvo; sistema: alvo→fonte),
    // em background — assim já está pronto quando as traduções começarem (sem aquecer no meio).
    // APARELHO COM POUCA MEMÓRIA (Quest/celular): nada de aquecer DOIS tradutores (2 × ~113 MB) junto
    // com o Whisper — medido no Quest emulado, os três downloads disputavam a rede e a memória. Lá a
    // preparação carrega o STT e depois UM tradutor; o outro sentido carrega na primeira tradução.
    const s = sourceLang.split('-')[0],
      t = targetLang.split('-')[0];
    /* TRADUTOR NATIVO NO CLIQUE: este é o gesto do usuário que a Translator API exige para baixar o
       pacote de idioma. Vem ANTES do aquecimento: o `warmup`/`preload` do opus-mt esperam por esta
       preparação e não baixam os 113 MB quando o nativo do navegador já traduz o par. */
    /* O PROGRESSO DO PACOTE vai à MESMA barra de preparo do Whisper/opus-mt (`pacotesNativos.ts`);
       falhou, a linha some sem toast e o opus-mt segue. Parou a captura: o progresso tardio não
       reabre o painel. */
    const pacotes = criarProgressoDosPacotesNativos({
      setModelPrep,
      ativo: () => isRecordingRef.current,
      clog,
    });
    void gateway.mt.prepararNativo(
      [
        [s, t],
        [t, s],
      ],
      pacotes.tradutor.progresso,
      pacotes.tradutor.falhou,
    );
    if (!perfilDoDispositivo().poucaMemoria)
      gateway.mt.warmup([
        [s, t],
        [t, s],
      ]);
    if (!resuming) setTimer(0);
    if (micEnabled) void startMic();
    if (systemEnabled) void handleStartSystemCapture();
  };

  // Start "limpo" a partir dos botões: só descarta o transcript quando NÃO estamos
  // retomando uma sessão (retomar continua de onde parou).
  const handleStartOrResume = () => {
    const retomando = !!(resumeId && speechSegments.length > 0);
    /* O TETO ANTES DE GRAVAR: com o acervo sem conta cheio, a captura nova só terminaria num
       salvamento recusado. A tela mostra o aviso com as saídas; retomar uma sessão que já existe
       não cria nada e continua livre. */
    if (tetoAtingido && !resumeId) {
      aoTetoAtingido?.();
      return;
    }
    if (!retomando) setSpeechSegments([]);
    // Captura nova, chave nova; retomar ou "Continuar gravando" mantêm a mesma.
    if (origemLocalIdRef && (!retomando || !origemLocalIdRef.current)) origemLocalIdRef.current = novaChaveDeCaptura();
    handleStartRecording();
  };

  // Sai do modo "retomar": a partir daqui a próxima gravação é uma sessão NOVA.
  const handleExitResume = () => {
    setResumeId(null);
    setSpeechSegments([]);
    setTimer(0);
    setCustomSessionTitle('');
    setFeedbackMsg('Modo retomar encerrado, a próxima captura cria uma sessão nova.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  /** Alguma fonte ainda aberta (pausada ou não)? É o que decide entre retomar e recomeçar. */
  const fontesAbertas = () => !!(systemCaptureRef.current || micCaptureRef.current || webSpeechRef.current);

  /** Pausa as fontes SEM encerrá-las (ver `AudioCapture.setPaused`). */
  const pausarFontes = () => {
    systemCaptureRef.current?.setPaused(true);
    micCaptureRef.current?.setPaused(true);
    /* A Web Speech não grava áudio (não há blob a preservar): encerrar o reconhecedor É a pausa
       dela, como já é o mudo. Ao retomar, começa outro. */
    if (webSpeechRef.current) {
      try {
        webSpeechRef.current.stop();
      } catch {
        /* reconhecedor já parado */
      }
      webSpeechRef.current = null;
      webSpeechPartialIdRef.current = null;
    }
    partialIdRef.current = null;
    pausaInicioRef.current = Date.now();
    setPausado(true);
    clog('❚❚ PAUSA (Encerrar aberto, fontes vivas)');
  };

  /** Retoma as MESMAS fontes e adianta o relógio pela duração da pausa (o gravador não a gravou). */
  const retomarFontes = () => {
    const pausa = pausaInicioRef.current ? Date.now() - pausaInicioRef.current : 0;
    if (sessionStartMsRef.current) sessionStartMsRef.current += pausa;
    pausaInicioRef.current = 0;
    systemCaptureRef.current?.setPaused(false);
    micCaptureRef.current?.setPaused(false);
    // Microfone pelo motor navegador: o reconhecedor foi encerrado na pausa, começa outro.
    if (micEnabled && !micCaptureRef.current && !webSpeechRef.current) void startMic();
    setPausado(false);
    clog('▶ RETOMADA depois de', Math.round(pausa), 'ms de pausa');
  };

  /**
   * ENCERRA as fontes de verdade e devolve, EM SEGUNDO PLANO, o áudio da sessão (misturado, com as
   * duas fontes). Roda no Salvar/Descartar do Encerrar, ou no Parar sem falas.
   *
   * O QUE É IMEDIATO e o que não é (relato do dono, 2026-09-28: "encerrar trava"): a tela para na
   * hora (flags, reconhecedor, medidor e refs das fontes zerados antes de qualquer espera). O que
   * demora, o gravador entregar o último pedaço e a mistura das duas fontes, fica na promessa
   * devolvida, com PRAZO em cada passo; quem precisa do áudio espera por ela, quem não precisa
   * (descartar, o texto do salvamento) segue. Estourou o prazo da mistura: fica o áudio do sistema.
   */
  const encerrarFontes = (): Promise<Blob | null> => {
    play('recordStop');
    setPausado(false);
    pausaInicioRef.current = 0;
    setIsRecording(false);
    isRecordingRef.current = false;
    partialIdRef.current = null;
    setModelPrep(null);
    clog('■ STOP');
    if (webSpeechRef.current) {
      try {
        webSpeechRef.current.stop();
      } catch {
        /* reconhecedor já parado */
      }
      webSpeechRef.current = null;
      webSpeechPartialIdRef.current = null;
    }
    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }
    const sistema = systemCaptureRef.current;
    const microfone = micCaptureRef.current;
    systemCaptureRef.current = null;
    micCaptureRef.current = null;
    const sysInicioMs = sistema?.startedAtMs ?? 0;
    const micInicioMs = micStartedAtRef.current;
    const duracaoS = timer;
    seqToSegmentRef.current.clear();
    lastPartialTextRef.current.clear();
    clog('métricas da sessão:', capMetrics.summary());
    pararTelemetriaDeCaptura(); // o último lote, antes que um START novo zere o acumulador
    fecharSessaoDeCaptura();

    /* O gravador já tem prazo próprio (`pararGravador`, 5 s); este cinto cobre o resto do `stop()`
       (VAD, contexto de áudio): nada daqui pode pendurar o fim da captura. */
    const parar = (f: AudioCapture | null): Promise<Blob | null> => {
      if (!f) return Promise.resolve(null);
      let pedido: Promise<Blob | null>;
      try {
        pedido = f.stop(); // chamado AGORA: o gravador para neste instante, não num microtask depois
      } catch {
        return Promise.resolve(null);
      }
      return comPrazo(() => pedido, 8000);
    };
    return (async (): Promise<Blob | null> => {
      const [sysBlob, micBlob] = await Promise.all([parar(sistema), parar(microfone)]);
      // Player do Analysis: com as DUAS fontes, mistura (a sua voz também fica na sessão); senão, a que houver.
      let final = sysBlob ?? micBlob;
      if (sysBlob && micBlob) {
        const offsetMic = sysInicioMs > 0 && micInicioMs > 0 ? micInicioMs - sysInicioMs : 0;
        const misturado = await comPrazo(() => misturarAudios(sysBlob, micBlob, offsetMic), prazoDaMistura(duracaoS));
        if (misturado) {
          final = misturado;
          clog('áudio da sessão: sistema + microfone misturados (offset', Math.round(offsetMic), 'ms)');
        } else clog('mixagem falhou ou passou do prazo, mantendo só o áudio do sistema');
      }
      recordedAudioRef.current = final;
      return final;
    })();
  };

  const abrirEncerrar = () => {
    // Pré-preenche o modal: retomando → título/capa existentes; senão, título por data.
    if (resumeId) {
      const existing = (recordings ?? []).find((r) => r.id === resumeId);
      setCustomSessionTitle((prev) => prev.trim() || existing?.title || `Captura ao vivo, ${dataHora(new Date())}`);
      setCustomSessionImage(existing?.imageUrl ?? '');
      setImgQuery(existing?.title ?? '');
    } else {
      setCustomSessionTitle(`Captura ao vivo, ${dataHora(new Date())}`);
      setCustomSessionImage('');
      setImgQuery('');
    }
    setShowSaveModal(true);
  };

  /**
   * "PARAR" (protótipo, C8): com falas na tela, a gravação NÃO é encerrada — ela PAUSA e o
   * Encerrar abre por cima. Salvar ou descartar encerra de verdade; "Continuar gravando" retoma.
   * Sem fala nenhuma não há o que encerrar: as fontes fecham e a tela avisa.
   */
  const handleStopRecording = () => {
    if (speechSegments.length > 0 && isRecordingRef.current && fontesAbertas()) {
      pausarFontes();
      abrirEncerrar();
      return;
    }
    void encerrarFontes();
    if (speechSegments.length === 0) {
      setFeedbackMsg('Nenhuma fala capturada, nada para salvar.');
      setTimeout(() => setFeedbackMsg(''), 3000);
      return;
    }
    abrirEncerrar();
  };

  // "Continuar gravando": fecha o modal e volta a capturar SEM perder o transcript nem o áudio.
  const handleCancelStop = () => {
    setShowSaveModal(false);
    if (isRecordingRef.current && fontesAbertas()) {
      retomarFontes();
      setFeedbackMsg('Gravação retomada!');
      return;
    }
    // As fontes já tinham sido encerradas (ex.: o salvar falhou): recomeça a captura.
    setIsRecording(true);
    isRecordingRef.current = true;
    sessionStartMsRef.current = Date.now() - timer * 1000; // continua a linha do tempo
    if (micEnabled) void startMic();
    if (systemEnabled) void handleStartSystemCapture();
    setFeedbackMsg('Gravação retomada!');
    setTimeout(() => setFeedbackMsg(''), 1500);
  };

  /** As falas da tela no formato do servidor. Idiomas POR FALA, não por sessão: as duas fontes são
      INVERSAS (sistema no idioma-alvo, microfone no seu; ver `langs()` em makeCaptureHandlers). Gravar
      `sourceLang` fixo fazia a Análise/Leitura narrarem o texto estrangeiro com a voz errada. */
  const falasParaOServidor = (segs: ReadonlyArray<SpeechSegment>): NewUtterancePayload[] => {
    const nameOf = (id: string) => speakerProfilesRef.current.find((p) => p.id === id)?.name ?? id;
    return segs.map((s, i) => {
      const isSys = s.source === 'system'; // FONTE decide a direção (speakerId agora pode ser 'voice_N')
      return {
        idx: i,
        source: isSys ? 'system' : 'mic',
        speakerName: nameOf(s.speakerId),
        // Idioma REAL detectado (multi-idioma) vence; senão, o da config.
        sourceLang: idiomaDaFala(s, { sourceLang, targetLang }),
        engine: s.engine ?? (isSys ? 'whisper-local' : micEngine === 'browser' ? 'web-speech' : 'whisper-local'),
        sourceText: s.originalText,
        targetLang: isSys ? sourceLang : targetLang, // idioma de `translatedText`
        translatedText: s.translatedText,
        tStartMs: s.tStartMs,
        tEndMs: s.tEndMs,
      };
    });
  };

  /**
   * "SALVAR" do Encerrar, em SEGUNDO PLANO e sem prender a tela (relato do dono, 2026-09-28).
   *
   * Antes: fechava o diálogo, esperava o gravador parar e o áudio ser misturado (sem prazo), só
   * então dizia "Salvando sessão…"; uma recusa reabria o Encerrar, que falhava de novo, e a única
   * saída era descartar. Agora a tela para NA HORA, o aviso aparece NA HORA, e o resto é do
   * `trabalhoDeSalvar` (falas em voo, rascunho, falas em lotes, navegação, áudio com prazo,
   * vocabulário), que sobrevive a sair da tela. Recusa não reabre nada: vira o aviso "Esta captura
   * ainda não foi salva", com saídas de verdade. Sessão RETOMADA mantém o mesmo id.
   */
  const handleFinalizeSave = (shouldRedirect: boolean): Promise<void> => {
    const title = customSessionTitle.trim() || `Captura ao vivo, ${dataHora(new Date())}`;
    const cover = customSessionImage.trim();
    const retomada = resumeId;
    const durationMs = timer * 1000;
    let origemLocalId = origemLocalIdRef?.current || '';
    if (!origemLocalId) {
      origemLocalId = novaChaveDeCaptura();
      if (origemLocalIdRef) origemLocalIdRef.current = origemLocalId;
    }
    setShowSaveModal(false);
    // Vindo do Encerrar com a gravação pausada: as fontes fecham AGORA; o áudio chega depois.
    const audio = fontesAbertas() ? encerrarFontes() : Promise.resolve(recordedAudioRef.current);
    setFeedbackMsg('Salvando sessão…');

    return salvarCaptura({
      origemLocalId,
      titulo: title,
      preparar: async () => {
        const segs = await aguardarFinaisEmVoo(lerFalas);
        const utterances = falasParaOServidor(segs);
        /* O par da SESSÃO é o do CONTEÚDO (o idioma dominante das falas), não o do seletor: é o que
           a Biblioteca mostra e filtra, e o que Jogar usa para a sessão (ver vocabularioDaSessao). */
        const par = parDaSessao(utterances, { sourceLang, targetLang });
        const rascunho: RascunhoDaCaptura = {
          origemLocalId,
          resumeId: retomada,
          titulo: title,
          capa: cover,
          durationMs,
          sourceLang: par.sourceLang,
          targetLang: par.targetLang,
          parConfigurado: { sourceLang, targetLang },
          utterances,
          criadoEm: Date.now(),
        };
        return { rascunho, segmentos: segs };
      },
      audio,
      traduzir: (texto, de, para) => gateway.mt.translate(texto, de, para),
      /* AS FALAS JÁ ESTÃO SALVAS AQUI: a tela é liberada antes do áudio e do vocabulário, que são
         enriquecimento. Ficando na tela, as falas continuam à vista (protótipo); indo para a
         análise, a tela zera. */
      aoSalvar: (recording) => {
        onSave(recording, shouldRedirect);
        setResumeId(null);
        if (shouldRedirect) {
          setSpeechSegments([]);
          setTimer(0);
        } else setSessaoSalva({ id: recording.id, palavras: null });
        setCustomSessionImage('');
        setFeedbackMsg(`“${title}” salva na Biblioteca`);
      },
      aoAtualizar: aoAtualizarGravacao,
    }).then((r) => {
      if (r.ok) {
        recordedAudioRef.current = null;
        if (!shouldRedirect) setSessaoSalva({ id: r.recording.id, palavras: r.palavras });
        setFeedbackMsg(r.resumo);
        // Mais tempo quando há motivo para ler: a linha ficou maior que "salvo com N cards".
        setTimeout(() => setFeedbackMsg(''), r.resumo.includes('pulada') ? 7000 : 4000);
        return;
      }
      /* NÃO reabre o Encerrar (era o laço sem saída): o aviso da tela mostra o que o servidor disse
         e as saídas, e a captura está no rascunho. */
      setFeedbackMsg('');
    });
  };

  /* `handleStartRecording` fica DENTRO: a tela chama sempre `handleStartOrResume` (que decide se
     o transcript anterior sai) e `handleCancelStop` (continuar gravando). */
  return {
    handleStartOrResume,
    handleExitResume,
    handleStopRecording,
    handleCancelStop,
    handleFinalizeSave,
    encerrarFontes,
  };
}
