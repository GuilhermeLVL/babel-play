/**
 * O CICLO DA SESSÃO da captura ao vivo: começar, retomar, parar e SALVAR (falas, áudio e
 * vocabulário) — a persistência inteira que ficava no meio de `views/LiveCapture.tsx`.
 *
 * Saiu de lá sem mudar comportamento: a fábrica roda a cada render, como as closures que
 * substituiu (ela lê `timer`, `speechSegments` e o par de idiomas do render corrente), e tudo
 * que vem da tela entra por PARÂMETRO explícito — nada de contexto novo nem store global.
 */
import { makeCloze, resumoDosPulados } from '@core';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ModelPrepState } from '../../components/ModelPrepPanel';
import {
  bulkAddCards,
  createSession,
  type NewUtterancePayload,
  patchSessionMeta,
  replaceSessionUtterances,
  updateSession,
  uploadSessionAudio,
} from '../../data/api';
import type { SttSession } from '../../gateway/capabilities';
import { capMetrics } from '../../gateway/capture/captureMetrics';
import type { AudioCapture } from '../../gateway/capture/systemAudio';
import { iniciarTelemetriaDeCaptura, pararTelemetriaDeCaptura } from '../../gateway/capture/telemetriaDeCaptura';
import type { ContextoDoStt } from '../../gateway/promptDeStt';
import { Recording } from '../../types';
import { DominantLangTracker } from '../convoLang';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { burstFromElement } from '../effects';
import { dataHora } from '../i18n';
import { baseLang } from '../languages';
import { misturarAudios } from '../misturarAudios';
import { OrdemDasTraducoes } from '../ordemDaTraducao';
import { PerfilAdaptativoDeIdioma } from '../perfilDeIdioma';
import { abrirSessaoDeCaptura, fecharSessaoDeCaptura } from '../sessaoDeCaptura';
import { play } from '../soundFx';
import { SpeakerClusterer } from '../speakerCluster';
import { preloadSpeakerId } from '../speakerId';
import { explicarParada, traduzirVersos } from '../versosDoVocabulario';
import {
  type CaptureScenario,
  clog,
  formatTime,
  type GatewayDaCaptura,
  type SpeakerProfile,
  type SpeechSegment,
} from './tiposDaFala';
import { idiomaDaFala, palavrasDasFalas, parDaSessao } from './vocabularioDaSessao';

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
    void gateway.mt.prepararNativo(
      [
        [s, t],
        [t, s],
      ],
      (p) => clog('tradutor nativo: pacote de idioma', Math.round(p * 100) + '%'),
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
    if (!(resumeId && speechSegments.length > 0)) setSpeechSegments([]);
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
      } catch {}
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
   * ENCERRA as fontes de verdade: fecha o reconhecedor e os gravadores e guarda o áudio da sessão
   * (misturado, com as duas fontes). Roda no Salvar/Descartar do Encerrar, ou no Parar sem falas.
   */
  const encerrarFontes = async () => {
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
      } catch {}
      webSpeechRef.current = null;
      webSpeechPartialIdRef.current = null;
    }
    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }
    let sysBlob: Blob | null = null;
    let micBlob: Blob | null = null;
    let sysInicioMs = 0;
    if (systemCaptureRef.current) {
      sysInicioMs = systemCaptureRef.current.startedAtMs ?? 0;
      try {
        sysBlob = await systemCaptureRef.current.stop();
      } catch {}
      systemCaptureRef.current = null;
    }
    if (micCaptureRef.current) {
      try {
        micBlob = await micCaptureRef.current.stop();
      } catch {}
      micCaptureRef.current = null;
    }
    // Player do Analysis: com as DUAS fontes, mistura (a sua voz também fica na sessão — antes o
    // mic era descartado e a pessoa não conseguia se reescutar nos exercícios); senão, a que houver.
    recordedAudioRef.current = sysBlob ?? micBlob;
    if (sysBlob && micBlob) {
      try {
        const offsetMic = sysInicioMs > 0 && micStartedAtRef.current > 0 ? micStartedAtRef.current - sysInicioMs : 0;
        recordedAudioRef.current = await misturarAudios(sysBlob, micBlob, offsetMic);
        clog('áudio da sessão: sistema + microfone misturados (offset', Math.round(offsetMic), 'ms)');
      } catch (e) {
        clog('mixagem falhou, mantendo só o áudio do sistema:', String(e));
      }
    }
    seqToSegmentRef.current.clear();
    lastPartialTextRef.current.clear();
    clog('métricas da sessão:', capMetrics.summary());
    pararTelemetriaDeCaptura(); // o último lote, antes que um START novo zere o acumulador
    fecharSessaoDeCaptura();
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
  const handleStopRecording = async () => {
    if (speechSegments.length > 0 && isRecordingRef.current && fontesAbertas()) {
      pausarFontes();
      abrirEncerrar();
      return;
    }
    await encerrarFontes();
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

  // Persistência REAL das saídas do modal. Sessão NOVA → createSession; sessão RETOMADA
  // (resumeId) → substitui as falas + atualiza título/duração + capa, MANTENDO o mesmo id
  // (nunca duplica na Biblioteca). Depois sobe o áudio e gera os cards de vocabulário.
  const handleFinalizeSave = async (shouldRedirect: boolean) => {
    const segs = speechSegments;
    const title = customSessionTitle.trim() || `Captura ao vivo, ${dataHora(new Date())}`;
    const cover = customSessionImage.trim();
    setShowSaveModal(false);
    // Vindo do Encerrar com a gravação pausada: agora sim as fontes fecham e o áudio é guardado.
    if (fontesAbertas()) await encerrarFontes();
    setFeedbackMsg('Salvando sessão…');
    try {
      const nameOf = (id: string) => speakerProfilesRef.current.find((p) => p.id === id)?.name ?? id;
      // Idiomas POR FALA (não por sessão): as duas fontes são INVERSAS — o áudio do SISTEMA
      // vem no idioma-ALVO e é traduzido para o seu; o MIC é o contrário (ver `langs()` em
      // makeCaptureHandlers). Gravar `sourceLang` fixo aqui fazia a Análise/Leitura narrarem o
      // texto estrangeiro com a voz do idioma errado.
      const utterances: NewUtterancePayload[] = segs.map((s, i) => {
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

      let recording: Recording | null = null;
      if (resumeId) {
        // Retomada: substitui TODAS as falas (append duplicaria as antigas já reidratadas),
        // renomeia/ajusta duração e grava a capa — tudo no MESMO id.
        recording = await replaceSessionUtterances(resumeId, utterances);
        const upd = await updateSession(resumeId, { title, durationMs: timer * 1000 });
        if (upd) recording = upd;
        if (cover) {
          const r = await patchSessionMeta(resumeId, { imageUrl: cover });
          if (r) recording = r;
        }
        if (!recording) {
          // Fallback honesto se o backend não devolveu a linha: reusa o que já existia.
          const existing = (recordings ?? []).find((r) => r.id === resumeId);
          recording = {
            id: resumeId,
            title,
            date: existing?.date ?? 'Agora',
            durationStr: formatTime(timer),
            wordCount: existing?.wordCount ?? 0,
            type: existing?.type ?? 'audio',
            tags: existing?.tags ?? [],
            status: 'Processado',
            imageUrl: cover || existing?.imageUrl,
          };
        }
        if (recordedAudioRef.current) {
          const url = await uploadSessionAudio(resumeId, recordedAudioRef.current);
          if (url) recording.audioUrl = url;
        }
      } else {
        /* O par da SESSÃO é o do CONTEÚDO (o idioma dominante das falas), não o do seletor: é o que
           a Biblioteca mostra e filtra, e o que Jogar usa para a sessão (ver vocabularioDaSessao). */
        const parGravado = parDaSessao(utterances, { sourceLang, targetLang });
        recording = await createSession({
          title,
          kind: 'live',
          sourceLang: parGravado.sourceLang,
          targetLang: parGravado.targetLang,
          status: 'done',
          durationMs: timer * 1000,
          utterances,
        });
        if (cover) {
          const r = await patchSessionMeta(recording.id, { imageUrl: cover });
          if (r) recording = r;
        }
        if (recordedAudioRef.current) {
          const url = await uploadSessionAudio(recording.id, recordedAudioRef.current);
          if (url) recording.audioUrl = url;
        }
      }

      // Vocabulário das palavras REAIS extraídas das falas (verso via MT, cloze da frase real).
      // O idioma da PALAVRA é o da fala de onde ela veio (sistema = alvo; mic = fonte) — é o que
      // Estudo/Métricas leem depois para falar/traduzir no idioma certo. Traduzir sempre de
      // `sourceLang`→`targetLang` invertia a direção nas palavras vindas do áudio do sistema.
      /* A SESSÃO JÁ ESTÁ SALVA AQUI. Libera a tela ANTES de enriquecer o vocabulário.
         Antes, `onSave()` só rodava depois de traduzir palavra por palavra, e a pessoa ficava
         presa em "Salvando sessão…" sem conseguir iniciar outra captura nem navegar. O que
         importa, a gravação e as falas, já está no servidor neste ponto; o verso dos cartões
         é enriquecimento, e enriquecimento não segura ninguém. */
      onSave(recording, shouldRedirect);
      recordedAudioRef.current = null;
      setResumeId(null);
      // Ficando na tela, as falas continuam à vista (protótipo); indo para a análise, a tela zera.
      if (shouldRedirect) {
        setSpeechSegments([]);
        setTimer(0);
      } else setSessaoSalva({ id: recording.id, palavras: null });
      setCustomSessionImage('');
      setFeedbackMsg(`“${title}” salva na Biblioteca`);

      /* As palavras únicas, cada uma com o idioma DA FALA de onde veio (o detectado; o do seletor só
         quando nada foi medido) e re-extraídas nesse idioma. Ver `vocabularioDaSessao.ts`: era aqui
         que a fala em português virava cartão em inglês. */
      const pendentes = palavrasDasFalas(segs, { sourceLang, targetLang });

      /* Os versos que faltam vão em LOTE, com desistência rápida e concorrência limitada
         (`lib/versosDoVocabulario`). O laço serial anterior fazia uma chamada de rede por
         palavra, e com o tradutor fora do ar, cada uma ainda pagava a tentativa antes de
         estourar. Quanto pior o tradutor, mais longa a espera. */
      const semVerso = pendentes.filter((p) => !p.back);
      const traducao = await traduzirVersos(
        semVerso.map((p) => ({ word: p.word, src: baseLang(p.srcLang), tgt: baseLang(p.tgtLang) })),
        (texto, de, para) => gateway.mt.translate(texto, de, para),
      );

      const cards = pendentes.map((p) => {
        const cloze = makeCloze(p.sentence, p.word);
        return {
          word: p.word,
          back: p.back || traducao.versos.get(p.word.toLowerCase()) || '',
          sentence: p.sentence,
          srcLang: p.srcLang,
          tgtLang: p.tgtLang,
          clozePrompt: cloze?.prompt,
          clozeAnswer: cloze?.answer,
          sessionId: recording.id,
        };
      });
      /* O NÚMERO QUE A TELA MOSTRA É O QUE O SERVIDOR GRAVOU, não o que tentamos gravar.
         `cards` é a lista TENTADA; desde que a régua de qualidade entrou, boa parte dela é
         recusada (repetida, sem tradução, ruído). A tela continuava anunciando o total tentado,
         dizia "30 cards" quando entraram 12. Inflar em silêncio foi como o baralho chegou a 1.506
         cartões com 194 repetições; anunciar o que não entrou é a mesma mentira com outro nome. */
      const entrada = cards.length ? await bulkAddCards(cards) : { cards: [], skipped: [] };

      const salvos = entrada.cards.length;
      if (!shouldRedirect) setSessaoSalva({ id: recording.id, palavras: salvos });
      const pulados = resumoDosPulados(entrada.skipped);
      // A parada da tradução entra na mensagem: "sem verso" por falta de tradutor é um fato
      // sobre o resultado, e omiti-lo faria a contagem parecer um limite do texto capturado.
      const parada = explicarParada(traducao);
      setFeedbackMsg(
        salvos || entrada.skipped.length
          ? `Sessão salva · ${salvos} palavra(s) fichada(s)` +
              (pulados ? ` · ${entrada.skipped.length} pulada(s): ${pulados}` : '') +
              (parada ? ` · ${parada}` : '')
          : 'Sessão salva.',
      );
      // Mais tempo quando há motivo para ler: a linha ficou maior que "salvo com N cards".
      setTimeout(() => setFeedbackMsg(''), pulados ? 7000 : 4000);
    } catch (e) {
      setShowSaveModal(true); // reabre para o usuário tentar de novo, sem perder o transcript
      setFeedbackMsg('Falha ao salvar a sessão: ' + (e as Error).message);
      setTimeout(() => setFeedbackMsg(''), 4000);
    }
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
