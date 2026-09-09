/**
 * AS FONTES DE ÁUDIO da captura ao vivo: som do sistema/aba, microfone (Whisper ou Web Speech),
 * o medidor de nível do waveform e o interruptor do microfone.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar comportamento: a fábrica roda a cada render, como as
 * closures que substituiu, e o estado da tela entra por PARÂMETRO explícito.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { WebSpeechStt } from '../../gateway/adapters/webSpeech';
import type { SttSession } from '../../gateway/capabilities';
import {
type AudioCapture,
  startMicCapture, startServerLoopbackCapture,
  startSystemAudioCapture, startSystemLoopbackCapture, } from '../../gateway/capture/systemAudio';
import { filterLoopbackDevices,listDevices } from '../audioDevices';
import { isTtsActive } from '../tts';
import {
  clog, formatTime,   type HandlersDaFonte, type SpeechSegment,
wordsFromText,
} from './tiposDaFala';
import type { OpcoesDeTraducao } from './traducaoDaFala';

/** Tudo que as fontes precisam da tela — por parâmetro, sem contexto novo nem store global. */
export interface DepsDasFontesDeAudio {
  /* --- o pipeline que consome o áudio --- */
  sysHandlers: HandlersDaFonte;
  micHandlers: HandlersDaFonte;
  prepareModels: () => Promise<void>;
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
}

export function criarFontesDeAudio(deps: DepsDasFontesDeAudio) {
  const {
    sysHandlers, micHandlers, prepareModels,
    systemSourceRef, loopbackDeviceIdRef, inputDeviceIdRef,
    systemCaptureRef, micCaptureRef, webSpeechRef, webSpeechPartialIdRef, meterRef,
    isRecordingRef, micStartedAtRef, timerRef,
    sourceLang, sourceLangRef, targetLangRef,
    micEnabled, systemEnabled, micEngine, webSpeechSupported,
    pushLevel, nowRel, anchorSessionClock, translateSegment,
    marcarMicrofone, setSpeechSegments, setFeedbackMsg, setIsFocusMode, setGuiaDeAudio,
    setModelPrep, setIsRecording, setMicAbrindo,
  } = deps;

  // Inicia a captura do áudio do sistema/aba: pede a fonte (gesto do usuário) e prepara o modelo.
  const handleStartSystemCapture = async () => {
    // O estado de gravação (isRecording/timer) já foi ligado por handleStartRecording (captura dupla).
    const source = systemSourceRef.current;
    clog('sistema: preparar modelos locais + fonte:', source);
    void prepareModels();
    try {
      const cb = {
        onUtterance: sysHandlers.onUtterance,
        onSpeechStart: (seq: number) => { clog('VAD: início de fala (sistema, seq', seq, ')'); sysHandlers.onSpeechStart(seq); },
        onPartialAudio: sysHandlers.onPartialAudio,
        onMisfire: (seq: number) => sysHandlers.onMisfire(seq),
        onLevel: pushLevel,
        onStatus: (msg: string) => { clog('sistema:', msg); setFeedbackMsg(msg); setTimeout(() => setFeedbackMsg(''), 4000); },
        onError: (err: Error) => { clog('sistema ERRO assíncrono:', err.message); setFeedbackMsg('Erro na captura do sistema: ' + err.message); setTimeout(() => setFeedbackMsg(''), 6000); },
      };
      systemCaptureRef.current = source === 'server'
        ? await startServerLoopbackCapture(cb)
        : source === 'loopback'
          ? await (async () => {
              /* Sem dispositivo escolhido E sem nenhum candidato (Stereo Mix / VB-Cable) o getUserMedia
                 abriria o MICROFONE padrão, e a pessoa acharia que o "loopback" estava ligado enquanto
                 ouvia o próprio ambiente. Medido no teste do dono (2026-08-26): sem legenda nenhuma.
                 Melhor recusar com o caminho certo do que capturar a fonte errada em silêncio. */
              if (!loopbackDeviceIdRef.current) {
                const { inputs } = await listDevices();
                if (!filterLoopbackDevices(inputs).detected) {
                  throw new Error('Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) existe neste computador, sem ele, esta rota captaria o microfone. Use "Compartilhar aba/tela" (marque "compartilhar áudio") ou instale o VB-Audio Cable.');
                }
              }
              return startSystemLoopbackCapture(loopbackDeviceIdRef.current || undefined, cb);
            })()
          : await startSystemAudioCapture(cb);
      clog('captura do sistema ATIVA ✓');
      if (systemCaptureRef.current) anchorSessionClock(systemCaptureRef.current.startedAtMs, 'system');
      setFeedbackMsg(micEnabled
        ? 'Captura DUPLA ativa: microfone (você) + sistema/aba (outros). A transcrição do sistema aparece e refina em tempo real.'
        : 'Capturando áudio do sistema/aba. A transcrição aparece e refina em tempo real (Whisper local).');
      setTimeout(() => setFeedbackMsg(''), 5000);
    } catch (err) {
      clog('getDisplayMedia FALHOU:', (err as Error).message);
      const code = (err as Error & { code?: string }).code;
      if (code === 'JANELA_SEM_AUDIO' || code === 'SEM_AUDIO_COMPARTILHADO') {
        // Sem áudio na superfície escolhida: em vez de um toast que some, um guia com o botão
        // de tentar de novo (o picker só reabre com um novo gesto do usuário).
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
    try {
      micCaptureRef.current = await startMicCapture(inputDeviceIdRef.current || undefined, {
        onUtterance: micHandlers.onUtterance,
        onSpeechStart: (seq) => { clog('VAD: início de fala (mic, seq', seq, ')'); micHandlers.onSpeechStart(seq); },
        onPartialAudio: micHandlers.onPartialAudio,
        onMisfire: (seq) => micHandlers.onMisfire(seq),
        onLevel: pushLevel,
        onStatus: (msg) => { clog('mic:', msg); setFeedbackMsg(msg); setTimeout(() => setFeedbackMsg(''), 4000); },
        onError: (err) => { clog('mic ERRO assíncrono:', err.message); setFeedbackMsg('Erro no microfone: ' + err.message); setTimeout(() => setFeedbackMsg(''), 6000); },
      });
      clog('captura do microfone ATIVA ✓');
      micStartedAtRef.current = micCaptureRef.current?.startedAtMs ?? 0;
      anchorSessionClock(micStartedAtRef.current, 'mic'); // ancora só se o mic for a fonte do áudio salvo
      if (!systemEnabled) {
        setFeedbackMsg('Microfone ativo (Whisper local). Fale, a transcrição aparece e refina em tempo real.');
        setTimeout(() => setFeedbackMsg(''), 3500);
      }
    } catch (err) {
      clog('getUserMedia(mic) FALHOU:', (err as Error).message);
      setFeedbackMsg((err as Error).message);
      setTimeout(() => setFeedbackMsg(''), 7000);
      setModelPrep((s) => (s?.error ? s : null));
      if (!systemEnabled) { // mic era a única fonte → encerra a gravação
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
      meterRef.current = { stop: () => { clearInterval(iv); stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); } };
    } catch { /* medidor é opcional */ }
  };

  // MICROFONE via Web Speech API (navegador) — motor PADRÃO: leve, sem baixar modelo, ótimo p/
  // português. Usa o adaptador WebSpeechStt do gateway. Não escolhe dispositivo (usa o padrão do
  // SO) — para isso, o usuário troca para o motor Whisper. Sem streaming de PCM: partials/finais.
  const startWebSpeechMic = () => {
    const speakerId = 'user';
    const from = sourceLangRef.current.split('-')[0];
    const to = targetLangRef.current.split('-')[0];
    try {
      webSpeechRef.current = new WebSpeechStt().startLive(sourceLangRef.current, {
        onPartial: (text: string) => {
          if (isTtsActive()) return; // anti-eco: o mic ouviu o TTS do app pelos alto-falantes
          const clean = text.trim();
          if (!clean) return;
          if (!webSpeechPartialIdRef.current) webSpeechPartialIdRef.current = Math.random().toString(36).slice(2, 11);
          const pid = webSpeechPartialIdRef.current;
          setSpeechSegments(prev => {
            const idx = prev.findIndex(s => s.id === pid);
            if (idx !== -1) { const u = [...prev]; u[idx] = { ...u[idx], originalText: clean }; return u; }
            return [...prev, { id: pid, speakerId, source: 'mic' as const, timestamp: formatTime(timerRef.current), originalText: clean, translatedText: '…', words: [], isPartial: true, tStartMs: nowRel() }];
          });
        },
        onFinal: ({ text }: { text: string }) => {
          if (isTtsActive()) { webSpeechPartialIdRef.current = null; return; } // anti-eco no final também
          const clean = text.trim();
          if (!clean) return;
          const uttId = webSpeechPartialIdRef.current ?? Math.random().toString(36).slice(2, 11);
          webSpeechPartialIdRef.current = null;
          setSpeechSegments(prev => {
            const existing = prev.find(s => s.id === uttId);
            const committed: SpeechSegment = {
              id: uttId, speakerId, source: 'mic', timestamp: formatTime(timerRef.current),
              originalText: clean, translatedText: '…', words: wordsFromText(clean, sourceLang), isPartial: false,
              tStartMs: existing?.tStartMs ?? nowRel(), tEndMs: nowRel(),
            };
            const idx = prev.findIndex(s => s.id === uttId);
            if (idx !== -1) { const u = [...prev]; u[idx] = committed; return u; }
            return [...prev, committed];
          });
          translateSegment(uttId, clean, from, to, { falada: true });
        },
        onError: (e: Error) => { clog('web-speech mic erro:', String(e)); },
      });
      clog('microfone (Web Speech) ATIVO ✓');
      void startMeter(); // waveform real (a Web Speech não fornece nível)
      if (!systemEnabled) {
        setFeedbackMsg('Microfone (navegador) ativo, transcrição instantânea. Fale à vontade.');
        setTimeout(() => setFeedbackMsg(''), 3000);
      }
    } catch (e) {
      setFeedbackMsg('Web Speech indisponível: ' + (e as Error).message + ', troque para o motor Whisper.');
      setTimeout(() => setFeedbackMsg(''), 5000);
      if (!systemEnabled) { setIsRecording(false); isRecordingRef.current = false; }
    }
  };

  // Liga o microfone conforme o motor escolhido (navegador vs Whisper).
  // Devolve promessa para que quem liga o mic NO MEIO da sessão saiba quando a permissão
  // do navegador terminou — é esse intervalo que o botão mostra como "pedindo permissão…".
  const startMic = async (): Promise<void> => {
    if (micEngine === 'browser' && webSpeechSupported) startWebSpeechMic();
    else await handleStartMicCapture();
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
    if (!isRecordingRef.current) return; // (1) fora da sessão: só a preferência

    if (!ligado) {
      micCaptureRef.current?.setMuted(true);
      /* O motor NAVEGADOR (Web Speech) não grava áudio nenhum — não há blob para preservar,
         então encerrar o reconhecedor É o mudo dele. Ao desmutar, começa outro. */
      if (webSpeechRef.current) {
        try { webSpeechRef.current.stop(); } catch { /* já parado */ }
        webSpeechRef.current = null;
        webSpeechPartialIdRef.current = null;
      }
      clog('microfone MUDO no meio da sessão');
      setFeedbackMsg('Microfone mudo, só o som do computador entra agora.');
      setTimeout(() => setFeedbackMsg(''), 2500);
      return;
    }

    if (micCaptureRef.current) {                       // (3) já aberto: só desmuta
      micCaptureRef.current.setMuted(false);
      clog('microfone ATIVO de novo (faixa reabilitada)');
      setFeedbackMsg('Microfone ativo, sua fala entra a partir de agora.');
      setTimeout(() => setFeedbackMsg(''), 2500);
      return;
    }

    clog('microfone ATIVO no meio da sessão: abrindo a captura agora');  // (2) primeira vez
    setMicAbrindo(true);
    void startMic().finally(() => setMicAbrindo(false));
  };

  return { handleStartSystemCapture, startMic, alternarMicrofone };
}
