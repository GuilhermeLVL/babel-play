/**
 * O PLAYER DA SESSÃO — a máquina de reprodução da tela de Análise: busca (`seekTo`/`playFrom`),
 * sincronia da legenda, motor de áudio real OU narração TTS, forma de onda decodificada, reset ao
 * trocar de gravação e a desaceleração automática em trechos complexos.
 *
 * Saiu de `views/Analysis.tsx` sem mudar comportamento. Os oito hooks abaixo eram um bloco
 * CONTÍGUO no componente e continuam na MESMA ordem — é o que mantém a lista de hooks da tela
 * idêntica à de antes. O JSX que estes controles alimentam foi para
 * `components/views/analise/PlayerInterativo.tsx`.
 */
import { sentenceHasComplexWord } from '@core';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import React from 'react';

import { getVoicePref,pickVoice } from '../tts';
import type { FalaDaAnalise } from './tiposDaAnalise';

/** mm:ss (ou hh:mm:ss) a partir de segundos — o relógio do player e dos trechos. */
export function formatSeconds(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/** Tudo que o player precisa da tela — por parâmetro, sem contexto novo. */
export interface DepsDoPlayerDaSessao {
  parsedSentences: FalaDaAnalise[];
  /** Há áudio gravado de verdade? Sem ele o player narra por TTS. */
  hasRealAudio: boolean;
  /** URL de BLOB do áudio autenticado (não a rota da API: `<audio src>` não manda cabeçalho). */
  audioSrc: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Índice ativo espelhado em ref, para a narração TTS retomar sem re-disparar o efeito. */
  activeSentenceIndexRef: RefObject<number>;
  activeSentenceIndex: number;
  currentTime: number;
  isPlaying: boolean;
  playbackSpeed: number;
  loopMode: boolean;
  autoSlowEnabled: boolean;
  /** Idioma de FALLBACK da narração (só quando a fala não traz o seu). */
  ttsLang: string;
  /** Muda para forçar o reinício da narração TTS quando o usuário busca. */
  seekNonce: number;
  /** Id da gravação: trocar de mídia zera o player. */
  recordingId: string;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setActiveSentenceIndex: Dispatch<SetStateAction<number>>;
  setSeekNonce: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setPlaybackSpeed: Dispatch<SetStateAction<number>>;
  setAudioDuration: Dispatch<SetStateAction<number>>;
  setPeaks: Dispatch<SetStateAction<number[]>>;
  setShadowingSentenceIndex: Dispatch<SetStateAction<number | null>>;
  setShadowingStep: Dispatch<SetStateAction<'idle' | 'recording' | 'processing' | 'result'>>;
  setShadowingScore: (v: null) => void;
}

export function usePlayerDaSessao(deps: DepsDoPlayerDaSessao) {
  const {
    parsedSentences,
    hasRealAudio,
    audioSrc,
    audioRef,
    activeSentenceIndexRef,
    activeSentenceIndex,
    currentTime,
    isPlaying,
    playbackSpeed,
    loopMode,
    autoSlowEnabled,
    ttsLang,
    seekNonce,
    recordingId,
    setCurrentTime,
    setActiveSentenceIndex,
    setSeekNonce,
    setIsPlaying,
    setPlaybackSpeed,
    setAudioDuration,
    setPeaks,
    setShadowingSentenceIndex,
    setShadowingStep,
    setShadowingScore,
  } = deps;

  // Mantém um ref do índice ativo para a narração TTS retomar do ponto certo sem re-disparar o efeito.
  React.useEffect(() => {
    activeSentenceIndexRef.current = activeSentenceIndex;
  }, [activeSentenceIndex, activeSentenceIndexRef]);

  // Helpers de reprodução (usados pelos controles/hotspots).
  const seekTo = React.useCallback(
    (t: number) => {
      setCurrentTime(t);
      if (hasRealAudio && audioRef.current) {
        try {
          audioRef.current.currentTime = t;
        } catch {
          /* metadata ainda não carregou */
        }
      } else {
        // TTS: posiciona a frase de partida e força reinício da narração se estiver tocando.
        let idx = 0;
        for (let i = 0; i < parsedSentences.length; i++) if (parsedSentences[i].startTime <= t) idx = i;
        activeSentenceIndexRef.current = idx;
        setActiveSentenceIndex(idx);
        setSeekNonce((n) => n + 1);
      }
    },
    [hasRealAudio, parsedSentences, audioRef, activeSentenceIndexRef, setCurrentTime, setActiveSentenceIndex, setSeekNonce],
  );

  const playFrom = React.useCallback(
    (t: number) => {
      seekTo(t);
      setIsPlaying(true);
    },
    [seekTo, setIsPlaying],
  );

  // Sync activeSentenceIndex with currentTime
  React.useEffect(() => {
    if (parsedSentences.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < parsedSentences.length; i++) {
      if (parsedSentences[i].startTime <= currentTime) {
        activeIdx = i;
      }
    }
    setActiveSentenceIndex(activeIdx);
  }, [currentTime, parsedSentences, setActiveSentenceIndex]);

  // Motor de reprodução REAL (substitui o setInterval falso):
  //  • Com áudio gravado → controla o elemento <audio> (play/pause/velocidade). O tempo/waveform
  //    vem do evento `timeupdate` (ver JSX do <audio>). Loop de frase tratado no timeupdate.
  //  • Sem áudio → narração via SpeechSynthesis lendo o transcrito, com highlight sincronizado
  //    pelos eventos `onstart`/`onboundary` (nada é inventado; o usuário OUVE de fato).
  React.useEffect(() => {
    if (hasRealAudio) {
      const a = audioRef.current;
      if (!a) return;
      a.playbackRate = playbackSpeed;
      if (isPlaying) a.play().catch(() => setIsPlaying(false));
      else a.pause();
      return;
    }

    if (!isPlaying) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      return;
    }
    if (!('speechSynthesis' in window) || parsedSentences.length === 0) return;

    let cancelled = false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const startIdx = Math.max(0, activeSentenceIndexRef.current);

    const speakFrom = (i: number) => {
      if (cancelled) return;
      if (i >= parsedSentences.length) {
        setIsPlaying(false);
        return;
      }
      const s = parsedSentences[i];
      const nextStart = i < parsedSentences.length - 1 ? parsedSentences[i + 1].startTime : s.startTime + 6;
      const text = s.original || s.translation || '';
      if (!text) {
        speakFrom(i + 1);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      // Idioma POR FALA: uma sessão pode misturar mic (seu idioma) e sistema (o estudado).
      const lang = s.lang || ttsLang;
      // Utterance manual (precisa de onstart/onboundary/onend para a barra de progresso), então a
      // voz preferida do usuário para ESTE idioma tem de ser resolvida aqui — o `speak()` não passa.
      const voice = pickVoice(lang, getVoicePref(lang));
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = lang;
      }
      u.rate = playbackSpeed;
      u.onstart = () => {
        if (!cancelled) {
          setActiveSentenceIndex(i);
          setCurrentTime(s.startTime);
        }
      };
      u.onboundary = (ev: SpeechSynthesisEvent) => {
        if (cancelled) return;
        const frac = Math.min(1, (ev.charIndex || 0) / Math.max(1, text.length));
        setCurrentTime(s.startTime + (nextStart - s.startTime) * frac);
      };
      u.onend = () => {
        if (!cancelled) speakFrom(loopMode ? i : i + 1);
      };
      synth.speak(u);
    };
    speakFrom(startIdx);

    return () => {
      cancelled = true;
      synth.cancel();
    };
    // seekNonce força reinício quando o usuário busca durante a narração TTS.
  }, [
    isPlaying,
    hasRealAudio,
    playbackSpeed,
    loopMode,
    parsedSentences,
    ttsLang,
    seekNonce,
    audioRef,
    activeSentenceIndexRef,
    setIsPlaying,
    setActiveSentenceIndex,
    setCurrentTime,
  ]);

  // Reset player when switching media
  React.useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSentenceIndex(-1);
    setShadowingSentenceIndex(null);
    setShadowingStep('idle');
    setShadowingScore(null);
    setAudioDuration(0);
    setPeaks([]);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    /* Só `recordingId` é reativo aqui: os demais são setters de `useState`, estáveis por
       construção — estão na lista para satisfazer o `exhaustive-deps` sem mudar quando o efeito
       dispara (trocar de gravação, e só). */
  }, [
    recordingId,
    setIsPlaying,
    setCurrentTime,
    setActiveSentenceIndex,
    setShadowingSentenceIndex,
    setShadowingStep,
    setShadowingScore,
    setAudioDuration,
    setPeaks,
  ]);

  // Waveform REAL: decodifica o áudio gravado e reduz para 44 picos (0..1). Sem áudio → vazio
  // (o render mostra barras neutras — não inventamos um "espectro"). Substitui o array hardcoded.
  React.useEffect(() => {
    // Espera o blob autenticado: `fetch` cru nesta URL dá 401 no modo público.
    if (!hasRealAudio || !audioSrc) {
      setPeaks([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(audioSrc);
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        const data = decoded.getChannelData(0);
        const N = 44;
        const block = Math.floor(data.length / N) || 1;
        const out: number[] = [];
        let max = 0.0001;
        for (let i = 0; i < N; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
          const rms = sum / block;
          out.push(rms);
          if (rms > max) max = rms;
        }
        ctx.close();
        if (alive) setPeaks(out.map((v) => Math.max(0.08, Math.min(1, v / max))));
      } catch {
        if (alive) setPeaks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasRealAudio, audioSrc, setPeaks]);

  // Auto-slow down on complex sentences
  React.useEffect(() => {
    if (!autoSlowEnabled || activeSentenceIndex === -1 || activeSentenceIndex >= parsedSentences.length) {
      return;
    }
    // BL-01: heurística REAL (palavra longa/polissilábica) no lugar de 4 palavras hardcoded.
    const text = parsedSentences[activeSentenceIndex].original;
    setPlaybackSpeed(sentenceHasComplexWord(text) ? 0.8 : 1.0);
  }, [activeSentenceIndex, autoSlowEnabled, parsedSentences, setPlaybackSpeed]);

  return { seekTo, playFrom };
}
