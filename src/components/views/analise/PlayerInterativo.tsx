/**
 * O PLAYER INTERATIVO da sessão — a janela de reprodução com legenda sincronizada, a forma de
 * onda, a linha do tempo e o quadro de shadowing (repetir a frase e ser pontuado pelo que o
 * navegador de fato ouviu).
 *
 * Era o `renderInteractivePlayer` de `views/Analysis.tsx`, 680 linhas de JSX dentro do
 * componente-deus. Saiu inteiro, sem uma linha alterada: continua sendo montado num único ponto
 * da aba "Transcrição", e todo o estado que ele lê e escreve continua morando na tela — chega
 * aqui por props, explícito. A máquina de reprodução (seek, motor de áudio/TTS, waveform) está em
 * `lib/analise/playerDaSessao.ts`.
 */
import { scorePronunciation } from '@core';
import {
  Activity,
  Headphones,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Video,
  Volume2,
  Zap,
} from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { formatSeconds } from '../../../lib/analise/playerDaSessao';
import type { FalaDaAnalise } from '../../../lib/analise/tiposDaAnalise';
import { mediaErrorMessage, speechErrorMessage } from '../../../lib/mediaErrors';
import { speak as ttsSpeak } from '../../../lib/tts';
import { Recording } from '../../../types';
import { toast } from '../../Toast';

/** A pontuação que `scorePronunciation` devolve para o quadro de shadowing. */
export interface NotaDoShadowing {
  fluency: number;
  accuracy: number;
  speed: number;
  feedback: string;
  transcript?: string;
}

export interface PropsDoPlayerInterativo {
  recording: Recording;
  ageProfile: 'kids' | 'pro' | 'senior';
  parsedSentences: FalaDaAnalise[];
  totalDurationSeconds: number;
  /** Há áudio gravado de verdade? Sem ele o player narra por TTS. */
  hasRealAudio: boolean;
  /** URL de BLOB do áudio autenticado (a rota da API está atrás do `authMiddleware`). */
  audioSrc: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioDuration: number;
  setAudioDuration: Dispatch<SetStateAction<number>>;
  /** Picos REAIS do waveform (0..1). Vazio → barras neutras, não um espectro inventado. */
  peaks: number[];
  isPlaying: boolean;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  currentTime: number;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  playbackSpeed: number;
  setPlaybackSpeed: Dispatch<SetStateAction<number>>;
  autoSlowEnabled: boolean;
  setAutoSlowEnabled: Dispatch<SetStateAction<boolean>>;
  loopMode: boolean;
  setLoopMode: Dispatch<SetStateAction<boolean>>;
  activeSentenceIndex: number;
  seekTo: (t: number) => void;
  playFrom: (t: number) => void;
  shadowingSentenceIndex: number | null;
  setShadowingSentenceIndex: Dispatch<SetStateAction<number | null>>;
  shadowingStep: 'idle' | 'recording' | 'processing' | 'result';
  setShadowingStep: Dispatch<SetStateAction<'idle' | 'recording' | 'processing' | 'result'>>;
  shadowingScore: NotaDoShadowing | null;
  setShadowingScore: Dispatch<SetStateAction<NotaDoShadowing | null>>;
  shadowRecRef: RefObject<any>;
  shadowStartRef: RefObject<number>;
  /** Idioma REAL de uma frase (mistura mic/sistema numa mesma sessão é possível). */
  langOfSentence: (idx: number | null) => string;
  /** Pronúncia no idioma da frase de onde a palavra saiu. */
  playWordTTS: (wordStr: string) => void;
}

export default function PlayerInterativo(props: PropsDoPlayerInterativo) {
  const {
    recording,
    ageProfile,
    parsedSentences,
    totalDurationSeconds,
    hasRealAudio,
    audioSrc,
    audioRef,
    audioDuration,
    setAudioDuration,
    peaks,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    playbackSpeed,
    setPlaybackSpeed,
    autoSlowEnabled,
    setAutoSlowEnabled,
    loopMode,
    setLoopMode,
    activeSentenceIndex,
    seekTo,
    playFrom,
    shadowingSentenceIndex,
    setShadowingSentenceIndex,
    shadowingStep,
    setShadowingStep,
    shadowingScore,
    setShadowingScore,
    shadowRecRef,
    shadowStartRef,
    langOfSentence,
    playWordTTS,
  } = props;

    if (recording.type === 'document') return null;

    const activeSentence =
      activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length
        ? parsedSentences[activeSentenceIndex]
        : null;

    // WPM REAL da frase ativa: palavras / duração real (start da próxima − start desta). Sem timing
    // confiável (ex.: só 1 frase) → null, e a UI mostra "—" em vez de um número inventado.
    const activeWpm = (() => {
      if (!activeSentence) return null;
      const next =
        activeSentenceIndex < parsedSentences.length - 1
          ? parsedSentences[activeSentenceIndex + 1].startTime
          : totalDurationSeconds || activeSentence.startTime;
      const durSec = next - activeSentence.startTime;
      const words = (activeSentence.original || '').trim().split(/\s+/).filter(Boolean).length;
      if (durSec < 1 || words === 0) return null;
      return Math.round(words / (durSec / 60));
    })();

    return (
      <div className="border-b border-border-subtle bg-surface-hover/30 p-5 flex flex-col gap-5 shrink-0 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse"></span>
            <span className="font-display font-black text-sm md:text-base tracking-tight uppercase text-ink">
              {/* Chamava-se "Estúdio de Sombra (Shadowing)" e prometia um exercício que não
                  existe mais, e que, mesmo antes, não era isto: este painel é o PLAYER, com a
                  legenda acompanhando o áudio. O nome passa a ser o que ele faz. Repetir em voz
                  alta virou o Karaokê, no Jogar. */}
              {ageProfile === 'kids'
                ? 'Ouça e acompanhe a legenda'
                : ageProfile === 'senior'
                  ? 'Leitura acompanhando o áudio'
                  : 'Player com legenda sincronizada'}
            </span>
            <span className="badge-tag ok text-[10px] font-bold">
              {recording.type === 'video' ? 'Vídeo Sincronizado' : 'Áudio Interativo'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-Slow Mo Control */}
            <button
              onClick={() => setAutoSlowEnabled(!autoSlowEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold border transition-all ${
                autoSlowEnabled
                  ? 'bg-warn-soft border-warn/30 text-warn-ink'
                  : 'bg-surface hover:bg-surface-hover border-border-subtle text-ink-muted'
              }`}
              title="Diminui a velocidade automaticamente em trechos com vocabulário complexo"
            >
              <Zap className={`w-3.5 h-3.5 ${autoSlowEnabled ? 'text-warn animate-pulse' : ''}`} />
              <span>Smart Slow-Mo</span>
            </button>

            {/* Speed Multiplier selector */}
            <div className="flex items-center gap-1 bg-surface border border-border-subtle p-1 rounded-lg">
              {[0.75, 1, 1.25, 1.5].map((sp) => (
                <button
                  key={sp}
                  onClick={() => {
                    setPlaybackSpeed(sp);
                    setAutoSlowEnabled(false); // turn off auto-slow if manually overridden
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                    playbackSpeed === sp && !autoSlowEnabled
                      ? 'bg-ink text-ink-contrast'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Player Window */}
        <div className="relative aspect-video max-h-[380px] w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center border border-border-subtle group shadow-inner">
          {/* Áudio REAL gravado da sessão — fonte de verdade do tempo/seek quando presente. */}
          {hasRealAudio && (
            <audio
              ref={audioRef}
              src={audioSrc ?? undefined}
              preload="metadata"
              // O áudio da sessão não tinha `onError`: falha de carga deixava o player parado sem
              // explicação — que é o caminho do achado D1.
              onError={(e) => {
                /* MediaError code 4 também dispara com src VAZIO (blob ainda carregando) e com
                     blob revogado (StrictMode desmonta/remonta) — acusar "formato não suportado"
                     nesses casos era mentira vista em produção (31/08). Sem src, não há o que
                     reportar ao usuário. */
                const el = e.currentTarget;
                if (!el.currentSrc && !el.src) return;
                toast.error(mediaErrorMessage(el));
              }}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (isFinite(d) && d > 0) setAudioDuration(d);
              }}
              onTimeUpdate={(e) => {
                const a = e.currentTarget;
                setCurrentTime(a.currentTime);
                if (loopMode && activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length) {
                  const start = parsedSentences[activeSentenceIndex].startTime;
                  const nextStart =
                    activeSentenceIndex < parsedSentences.length - 1
                      ? parsedSentences[activeSentenceIndex + 1].startTime
                      : audioDuration || start + 25;
                  if (a.currentTime >= nextStart) {
                    try {
                      a.currentTime = start;
                    } catch {
                      /* noop */
                    }
                  }
                }
              }}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}
          {/* Simulated Video or Waveform View */}
          {recording.type === 'video' ? (
            // VIDEO PLAYER CANVAS
            <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950 to-zinc-900 flex flex-col items-center justify-center overflow-hidden">
              {/* Dynamic Abstract Tech Background that moves slightly or has lines */}
              <div className="absolute inset-0 opacity-15 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-full h-full border-t border-b border-accent-subtle/30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent transition-all duration-700 ${isPlaying ? 'scale-110' : 'scale-100'}`}
                ></div>
                <div className="absolute grid grid-cols-6 gap-2 w-full h-full p-6">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div
                      key={i}
                      className={`bg-accent-subtle/10 border border-accent/5 rounded-lg transition-all duration-1000 ${isPlaying ? 'opacity-30' : 'opacity-10'}`}
                      style={{ transitionDelay: `${i * 50}ms` }}
                    ></div>
                  ))}
                </div>
              </div>

              {/* Dynamic Icon centered based on state */}
              <div className="z-10 w-20 h-20 rounded-full bg-surface/10 border border-white/15 flex items-center justify-center backdrop-blur-md shadow-2xl transition-transform duration-300 group-hover:scale-105">
                {isPlaying ? (
                  <Video className="w-10 h-10 text-white animate-pulse" />
                ) : (
                  <Play className="w-10 h-10 text-white ms-1" />
                )}
              </div>

              {/* Status Tags */}
              <div className="absolute top-4 left-4 bg-black/60 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold text-white flex items-center gap-1.5 backdrop-blur-md">
                <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-good' : 'bg-warn'} animate-pulse`}></span>
                {isPlaying ? 'EXECUTANDO FEED INTEGRADO' : 'PAUSADO'}
              </div>

              <div className="absolute top-4 right-4 bg-black/60 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold text-white flex items-center gap-1.5 backdrop-blur-md">
                <span>WPM: {activeWpm ?? '-'}</span>
              </div>
            </div>
          ) : (
            // AUDIO PLAYER WAVEFORM CANVAS
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-zinc-900 flex flex-col items-center justify-center overflow-hidden p-6">
              {/* WAVEFORM BAR GRID */}
              {/* Sem `gap` entre as barras: o vão de 4px era ZONA MORTA — clicar ali não fazia
                  nada, e vão + barra dava 36% da faixa sem resposta. Agora cada botão ocupa a
                  fatia inteira e a folga vira padding DENTRO dele, então o desenho é o mesmo e a
                  faixa toda busca. */}
              {/*
                UM slider, não 44 botões.

                As barras eram `<button>` de ~2px cada. O axe acusava 44 violações de
                `target-size` numa tela só, 44 dos 45 do produto inteiro, e alargá-las para os
                24px exigidos destruiria o waveform. O erro era o PADRÃO: busca em áudio é uma
                faixa contínua, não 44 destinos discretos.

                Agora a faixa inteira é um `slider` com teclado (setas, Home/End) e as barras são
                `aria-hidden`, desenho, não controle. Para leitor de tela isso deixa de ser uma
                fileira de 44 botões e vira "posição no áudio", que é o que de fato é.
              */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Posição no áudio"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalDurationSeconds)}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={formatSeconds(currentTime)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seekTo(((e.clientX - r.left) / r.width) * totalDurationSeconds);
                }}
                onKeyDown={(e) => {
                  const passo = e.shiftKey ? 10 : 5;
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    seekTo(Math.min(totalDurationSeconds, currentTime + passo));
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    seekTo(Math.max(0, currentTime - passo));
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    seekTo(0);
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    seekTo(totalDurationSeconds);
                  }
                }}
                className="w-full flex items-center justify-between max-w-lg z-10 h-32 px-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {Array.from({ length: 44 }).map((_, i) => {
                  const barProgress = i / 44;
                  const isActive = barProgress <= currentTime / totalDurationSeconds;
                  // Altura REAL do waveform (picos decodificados). Sem áudio → barras neutras baixas
                  // (placeholder honesto — não fabricamos um espectro de frequências).
                  const heightPercentage = peaks.length === 44 ? Math.round(peaks[i] * 100) : 22;

                  return (
                    <div key={i} aria-hidden="true" className="flex-1 h-full flex items-center justify-center px-[2px]">
                      <div
                        className={`w-full rounded-full transition-all duration-300 ${
                          isActive
                            ? 'bg-accent shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_50%,transparent)]'
                            : 'bg-white/15'
                        }`}
                        style={{ height: `${heightPercentage}%` }}
                      ></div>
                    </div>
                  );
                })}
              </div>

              {/* Headphones Icon background */}
              <div className="absolute opacity-5 pointer-events-none">
                <Mic className="w-56 h-56 text-white" />
              </div>

              <div className="absolute bottom-16 text-[10px] font-mono text-white/50 tracking-widest uppercase">
                Espectro de frequências de áudio capturado
              </div>
            </div>
          )}

          {/* Dynamic Smart Subtitles (Floating Bilingual Overlay) */}
          <div className="absolute bottom-6 left-6 right-6 z-20 bg-black/80 hover:bg-black/90 border border-white/10 rounded-2xl p-4 backdrop-blur-md shadow-2xl flex flex-col gap-1.5 transition-all text-center select-none">
            {activeSentence ? (
              <div className="animate-in fade-in duration-300">
                <div className="font-sans font-extrabold text-[15px] text-white leading-relaxed tracking-wide">
                  {activeSentence.original}
                </div>
                <div className="font-sans font-medium text-[13px] text-accent-soft leading-relaxed mt-1">
                  {activeSentence.translation}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-[10px] text-white/50 font-mono">
                    Falado às {activeSentence.time} por {activeSentence.speaker}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-white/60 font-medium text-[13px] py-1">
                Aperte o Play para acompanhar a legenda bilíngue integrada e a transcrição interativa.
              </div>
            )}
          </div>
        </div>

        {/* Seek and Bottom Controls Panel */}
        <div className="bg-surface border border-border-subtle p-4 rounded-xl flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {/* Time label elapsed */}
            <span className="font-mono text-[12px] font-bold text-ink-muted w-12 text-end">
              {formatSeconds(currentTime)}
            </span>

            {/* Slider Seekbar */}
            <div className="flex-1 relative flex items-center">
              {/* C2/C5 — este `range` carrega duas responsabilidades. Fecha a violação `label`,
                  e é a ALTERNATIVA ACESSÍVEL que legitima a exceção da C5: os 104 segmentos
                  clicáveis da linha do tempo têm 4,9 px e não podem ter 24 (a largura codifica a
                  posição no tempo, a isenção "apresentação essencial" da WCAG 2.5.8). A exceção
                  só se sustenta porque existe este controle, operável por teclado e nomeado.
                  `aria-valuetext` troca "248" por "4:08", que é o que a pessoa precisa ouvir. */}
              <input
                id="analysis-seekbar"
                name="analysis-seekbar"
                aria-label="Posição na gravação"
                aria-valuetext={`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')} de ${Math.floor(totalDurationSeconds / 60)}:${String(Math.floor(totalDurationSeconds % 60)).padStart(2, '0')}`}
                type="range"
                min="0"
                max={totalDurationSeconds}
                step="0.5"
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none bg-canvas border border-border-subtle cursor-pointer accent-accent outline-none focus:outline-none"
              />

              {/* Marcadores de fala na linha do tempo: um por trecho, todos iguais.
                  F2, antes, um trecho era pintado de âmbar e ficava PULSANDO quando continha
                  uma de quatro palavras cravadas no código (`heuristics`, `leverage`, `synergy`,
                  `volatility`). O destaque afirmava "aqui tem um trecho difícil" com base numa
                  lista fixa em inglês: numa gravação sem nenhuma dessas palavras, nada nunca era
                  destacado; numa que tivesse "leverage" por acaso, um ponto qualquer pulsava.
                  Sinal inventado é pior que sinal nenhum, porque o usuário confia nele.

                  Marcar dificuldade de verdade é possível, o cartão já guarda `cefr_level` e
                  `difficulty_score`, mas é trabalho de outra fase, e inventar enquanto isso não
                  é opção. O ponto continua fazendo o que sempre fez de fato: pular para a fala. */}
              {parsedSentences.map((s, idx) => {
                const percentage = (s.startTime / totalDurationSeconds) * 100;
                const rotulo = `Pular para o trecho de ${s.speaker} (${s.time})`;
                return (
                  <button
                    key={idx}
                    onClick={() => playFrom(s.startTime)}
                    /**
                     * F7 — 238 PARADAS DE TABULAÇÃO A MENOS.
                     *
                     * Medido nesta tela: dos 312 botões visíveis, 238 eram estes pontos — e
                     * NENHUM tinha nome acessível (só `title`, que leitor de tela não usa como
                     * nome). Quem navega por teclado passava por 238 "botão" mudos antes de
                     * chegar a qualquer outro controle da sessão.
                     *
                     * `aria-label` dá nome ao que ficou; `tabIndex={-1}` tira da navegação
                     * sequencial — sem perder nada, porque a MESMA navegação existe de forma
                     * acessível logo abaixo: a lista de falas do transcrito e os botões
                     * "Ir para <tempo>". Estes pontos são um atalho de mouse sobre a linha do
                     * tempo, e continuam funcionando como tal.
                     */
                    aria-label={rotulo}
                    tabIndex={-1}
                    className={`absolute w-2.5 h-2.5 -ms-1.25 rounded-full border border-surface shadow-sm transition-all hover:scale-125 z-10 cursor-pointer bg-accent ${
                      activeSentenceIndex === idx ? 'ring-2 ring-ink scale-125' : ''
                    }`}
                    style={{ left: `${percentage}%` }}
                    title={rotulo}
                  />
                );
              })}
            </div>

            {/* Total time label */}
            <span className="font-mono text-[12px] font-bold text-ink-muted w-12">{recording.durationStr}</span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
            {/* Play/Pause controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accent-faint text-accent-ink flex items-center justify-center transition-all shadow-md cursor-pointer"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ms-0.5" />}
              </button>

              <button
                onClick={() => playFrom(0)}
                className="p-2 hover:bg-surface-hover rounded-lg text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title="Reiniciar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setLoopMode(!loopMode)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  loopMode
                    ? 'bg-accent-soft border-accent/20 text-accent'
                    : 'bg-surface hover:bg-surface-hover border-border-subtle text-ink-muted'
                }`}
                title="Repetir continuamente o trecho ativo (ideal para fixação de pronúncia)"
              >
                <RefreshCw className={`w-3 h-3 ${loopMode ? 'animate-spin' : ''}`} />
                <span>Modo Loop</span>
              </button>
            </div>

            {/* Displaying Current Phrase Info */}
            {activeSentence && (
              <div className="flex items-center gap-2 bg-accent-soft/35 border border-accent/15 rounded-lg px-3 py-1.5 animate-in fade-in">
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 animate-pulse" />
                <span className="text-[11.5px] font-bold text-accent">
                  Foco de Estudo: {activeSentence.speaker} ({activeSentence.time})
                </span>
                <button
                  onClick={() => {
                    setShadowingSentenceIndex(activeSentence.index);
                    setShadowingStep('idle');
                    setShadowingScore(null);
                  }}
                  className="ms-2 btn-solid text-[10.5px] py-1 px-2 rounded-md cursor-pointer flex items-center gap-1"
                >
                  <Mic className="w-3 h-3 text-white" /> Treinar Sombra
                </button>
              </div>
            )}

            {/* Quick Action Info badge */}
            <div className="text-[11.5px] text-ink-muted font-medium bg-canvas border border-border-subtle rounded-lg px-2.5 py-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-ink-muted" />
              <span>
                Dificuldade Geral: <b className="text-warn font-extrabold">Médio/Avançado</b>
              </span>
            </div>
          </div>
        </div>

        {/* Inline Shadowing Board when activated */}
        {shadowingSentenceIndex !== null && shadowingSentenceIndex < parsedSentences.length && (
          <div className="bg-surface border-2 border-accent/30 rounded-2xl p-5 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                  <Mic className="w-4 h-4 animate-pulse text-accent" />
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-[14px]">Prática Ativa de Pronúncia (Shadowing)</h4>
                  <p className="text-[11px] text-ink-muted">
                    Trecho falado aos {parsedSentences[shadowingSentenceIndex].time}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShadowingSentenceIndex(null)}
                className="text-ink-muted hover:text-ink text-[11.5px] font-bold bg-canvas border border-border-subtle px-2.5 py-1 rounded-lg cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-xl p-4 mb-4 text-center">
              <span className="text-[9.5px] font-mono uppercase text-ink-muted tracking-wider block mb-1">
                Repita a frase abaixo
              </span>
              <p className="font-sans font-extrabold text-[16px] text-ink leading-relaxed">
                "{parsedSentences[shadowingSentenceIndex].original}"
              </p>
              <span className="text-[12.5px] text-ink-muted block mt-2 italic">
                "{parsedSentences[shadowingSentenceIndex].translation}"
              </span>
            </div>

            {/* Step actions inside Shadowing Board */}
            {shadowingStep === 'idle' && (
              <div className="flex flex-col items-center py-2">
                <button
                  onClick={() => {
                    const idx = shadowingSentenceIndex;
                    if (idx === null) return;
                    const target = parsedSentences[idx].original;
                    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SR) {
                      setShadowingScore({
                        fluency: 0,
                        accuracy: 0,
                        speed: 0,
                        feedback: 'Reconhecimento de voz não é suportado neste navegador.',
                      });
                      setShadowingStep('result');
                      return;
                    }
                    // Grava a fala REAL do usuário e pontua por similaridade com o alvo.
                    // Escuta no idioma REAL da frase-alvo (era 'en-US' fixo).
                    const rec = new SR();
                    rec.lang = langOfSentence(idx);
                    rec.interimResults = false;
                    rec.maxAlternatives = 1;
                    rec.continuous = false;
                    shadowRecRef.current = rec;
                    shadowStartRef.current = Date.now();
                    let got = '';
                    rec.onresult = (e: any) => {
                      got = e.results?.[0]?.[0]?.transcript || '';
                    };
                    // Era `() => {}`: o shadowing simplesmente parava, sem dizer por quê. Mic negado,
                    // rede caída e idioma sem suporte davam o mesmo silêncio.
                    rec.onerror = (e: any) => {
                      const msg = speechErrorMessage(e?.error);
                      if (msg) toast.warn(msg);
                    };
                    rec.onend = () => {
                      shadowRecRef.current = null;
                      setShadowingStep('processing');
                      const durationMs = Date.now() - shadowStartRef.current;
                      setShadowingScore(scorePronunciation(target, got, { durationMs }));
                      setShadowingStep('result');
                    };
                    setShadowingStep('recording');
                    try {
                      rec.start();
                    } catch {
                      setShadowingStep('idle');
                    }
                  }}
                  className="btn-solid flex items-center gap-2 px-6 py-3 rounded-full shadow-lg bg-error hover:brightness-110 text-white border-none text-[13px] cursor-pointer"
                >
                  <Mic className="w-4 h-4 text-white" />
                  <span>Iniciar Gravação de Áudio</span>
                </button>
                <p className="text-[11px] text-ink-muted mt-2">
                  Clique para permitir o microfone local e começar a falar
                </p>
              </div>
            )}

            {shadowingStep === 'recording' && (
              <div className="flex flex-col items-center py-3 animate-in fade-in">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-14 h-14 bg-error/20 rounded-full animate-ping"></div>
                  <div className="absolute w-10 h-10 bg-error/40 rounded-full animate-pulse"></div>
                  <button
                    onClick={() => {
                      try {
                        shadowRecRef.current?.stop();
                      } catch {}
                    }}
                    className="relative w-8 h-8 rounded-full bg-error hover:brightness-110 flex items-center justify-center text-white cursor-pointer border-none"
                  >
                    <Pause className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <span className="text-[13px] font-bold text-error-ink animate-pulse mt-4">GRAVANDO SUA VOZ...</span>
                <p className="text-[11.5px] text-ink-muted mt-1">
                  Fale agora. O estúdio analisará o ritmo e a fonologia em tempo real.
                </p>
              </div>
            )}

            {shadowingStep === 'processing' && (
              <div className="flex flex-col items-center py-4 animate-in fade-in">
                <div className="w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
                <span className="text-[13px] font-bold text-ink mt-3">Analisando ondas de áudio com IA...</span>
                <p className="text-[11.5px] text-ink-muted mt-1">
                  Mapeando pitch vocal, velocidade de entrega e correspondência de fonemas...
                </p>
              </div>
            )}

            {shadowingStep === 'result' && shadowingScore && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  {/* Circular visual score */}
                  <div className="card-panel bg-canvas p-4 flex flex-col items-center justify-center border-accent/20">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" className="stroke-canvas-subtle fill-none" strokeWidth="6" />
                        <circle
                          cx="40"
                          cy="40"
                          r="34"
                          className="stroke-accent fill-none"
                          strokeWidth="6"
                          strokeDasharray={`${2 * Math.PI * 34}`}
                          strokeDashoffset={`${2 * Math.PI * 34 * (1 - shadowingScore.fluency / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute font-display font-black text-xl text-ink">{shadowingScore.fluency}%</div>
                    </div>
                    <span className="font-bold text-[11px] text-ink-muted uppercase mt-2">Score Final</span>
                  </div>

                  {/* Stats breakdown */}
                  <div className="md:col-span-3 grid grid-cols-3 gap-3">
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">
                        Fluência
                      </span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.fluency}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-accent h-full" style={{ width: `${shadowingScore.fluency}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">
                        Precisão
                      </span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.accuracy}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-good h-full" style={{ width: `${shadowingScore.accuracy}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">
                        Ritmo / Tempo
                      </span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.speed}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-warn h-full" style={{ width: `${shadowingScore.speed}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phoneme visual feedback */}
                <div className="bg-canvas border border-border-subtle rounded-xl p-4 mb-4">
                  <span className="text-[9.5px] font-mono uppercase text-ink-muted tracking-wider block mb-2">
                    Mapeamento de Fonemas Vocalizados
                  </span>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {parsedSentences[shadowingSentenceIndex].original.split(' ').map((word, wIdx) => {
                      const clean = word.replace(/[^\p{L}]/gu, '').toLowerCase();
                      // Removido: `isTarget` comparava com uma lista de 5 palavras HARDCODED
                      // ('heuristics', 'leverage', 'synergy', 'volatility', 'new') e não era lida
                      // por ninguém — resíduo do mesmo padrão que o BL-01 já tinha eliminado.
                      // Color code word targets for high interactive value
                      let colorClass = 'bg-good-soft text-good border-good/20';
                      let tip = 'Correto';
                      if (clean === 'new') {
                        colorClass = 'bg-warn-soft text-warn-ink border-warn/30';
                        tip = 'Sotaque nativo leve';
                      }

                      return (
                        <div
                          key={wIdx}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex flex-col items-center ${colorClass}`}
                          title={tip}
                        >
                          <span>{word}</span>
                          <span className="text-[9px] font-mono opacity-60 font-normal">{tip}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-accent-soft/20 border border-accent/20 rounded-xl mb-4 text-[12.5px] text-ink leading-relaxed">
                  <b className="font-bold text-accent">Análise Vocálica:</b> {shadowingScore.feedback}
                </div>

                <div className="flex gap-3 justify-end flex-wrap">
                  <button
                    onClick={() => {
                      setShadowingStep('recording');
                      setShadowingScore(null);
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                  <button
                    onClick={() => {
                      playWordTTS(parsedSentences[shadowingSentenceIndex].original);
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Ouvir Original</span>
                  </button>
                  <button
                    onClick={() => {
                      // Reprodução da tentativa: mesma frase, no idioma REAL dela (era 'en-US' fixo).
                      ttsSpeak(parsedSentences[shadowingSentenceIndex].original, {
                        // `langOfSentence` ja devolve string; o `|| undefined` era resquicio de
                        // quando `SpeakOptions.lang` era opcional.
                        lang: langOfSentence(shadowingSentenceIndex),
                        rate: 0.8,
                        pitch: 1.1,
                      });
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Ouvir Minha Gravação</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
}
