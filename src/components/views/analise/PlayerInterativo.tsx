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
  Headphones,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Snail,
  Volume2,
} from 'lucide-react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';

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
  /** "Ajustar exibição" (protótipo): o botão mora no player, o painel de opções vem da tela. */
  mostrarExib?: boolean;
  aoAlternarExib?: () => void;
  exib?: ReactNode;
}

export default function PlayerInterativo(props: PropsDoPlayerInterativo) {
  const {
    recording,
    parsedSentences,
    totalDurationSeconds,
    hasRealAudio,
    audioSrc,
    audioRef,
    audioDuration,
    setAudioDuration,
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
    mostrarExib = false,
    aoAlternarExib,
    exib,
  } = props;

  if (recording.type === 'document') return null;

  const activeSentence =
    activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length
      ? parsedSentences[activeSentenceIndex]
      : null;

  /* Marcação do protótipo aprovado (`abaTranscricao`): um cartão compacto — tocar, a trilha com o
       tempo e quem está falando, a velocidade, e embaixo Slow-Mo, loop, reiniciar e "Ajustar exibição".
       O áudio REAL continua sendo a fonte do tempo; sem áudio, o relógio avança pela legenda. */
  const pct = totalDurationSeconds > 0 ? Math.min(100, (currentTime / totalDurationSeconds) * 100) : 0;
  return (
    <>
      <section className="cartao p5 player" aria-label="Player">
        {hasRealAudio && (
          <audio
            ref={audioRef}
            src={audioSrc ?? undefined}
            preload="metadata"
            onError={(e) => {
              /* MediaError code 4 também dispara com src VAZIO (blob ainda carregando) e com blob
                 revogado (StrictMode desmonta/remonta): sem src, não há o que reportar. */
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
        <div className="linha" style={{ gap: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-solid redondo"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          >
            {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden />}
          </button>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              id="analysis-seekbar"
              name="analysis-seekbar"
              type="range"
              className="trilho"
              min={0}
              max={totalDurationSeconds}
              step={0.5}
              value={currentTime}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="Posição na gravação"
              aria-valuetext={`${formatSeconds(currentTime)} de ${formatSeconds(totalDurationSeconds)}`}
              style={{ ['--p' as string]: `${pct}%` }}
            />
            <div className="entre mut tn" style={{ font: '600 11.5px var(--font-mono)', marginTop: 4 }}>
              <span>{formatSeconds(currentTime)}</span>
              <span>{activeSentence ? `${activeSentence.speaker} falando` : ''}</span>
              <span>{recording.durationStr}</span>
            </div>
          </div>
          <div className="seg" role="group" aria-label="Velocidade">
            {[0.75, 1, 1.25].map((sp) => (
              <button
                key={sp}
                type="button"
                aria-pressed={playbackSpeed === sp && !autoSlowEnabled}
                onClick={() => {
                  setPlaybackSpeed(sp);
                  setAutoSlowEnabled(false); // escolher a velocidade à mão desliga o automático
                }}
              >
                {String(sp).replace('.', ',')}×
              </button>
            ))}
          </div>
        </div>
        <div className="linha" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pill"
            aria-pressed={autoSlowEnabled}
            onClick={() => setAutoSlowEnabled(!autoSlowEnabled)}
            title="Diminui a velocidade nos trechos com vocabulário difícil"
          >
            <Snail aria-hidden /> Smart Slow-Mo
          </button>
          <button
            type="button"
            className="pill"
            aria-pressed={loopMode}
            onClick={() => setLoopMode(!loopMode)}
            title="Repete o trecho ativo, bom para fixar pronúncia"
          >
            <Repeat aria-hidden /> Modo loop
          </button>
          <button type="button" className="pill" onClick={() => playFrom(0)}>
            <RotateCcw aria-hidden /> Reiniciar
          </button>
          <span style={{ flex: 1 }} />
          {aoAlternarExib && (
            <button type="button" className="btn btn-outline peq" onClick={aoAlternarExib} aria-expanded={mostrarExib}>
              <SlidersHorizontal aria-hidden /> Ajustar exibição
            </button>
          )}
        </div>
        {mostrarExib && exib}
      </section>
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
    </>
  );
}
