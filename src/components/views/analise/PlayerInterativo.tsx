/**
 * O PLAYER INTERATIVO da sessão — tocar, a trilha, as velocidades, Smart Slow-Mo, loop e
 * reiniciar, e o "Ajustar exibição". O shadowing mora DENTRO de cada fala (`SombraDaFala`), como no
 * protótipo.
 *
 * Era o `renderInteractivePlayer` de `views/Analysis.tsx`, 680 linhas de JSX dentro do
 * componente-deus. Saiu inteiro, sem uma linha alterada: continua sendo montado num único ponto
 * da aba "Transcrição", e todo o estado que ele lê e escreve continua morando na tela — chega
 * aqui por props, explícito. A máquina de reprodução (seek, motor de áudio/TTS, waveform) está em
 * `lib/analise/playerDaSessao.ts`.
 */
import { Pause, Play, Repeat, RotateCcw, SlidersHorizontal, Snail } from 'lucide-react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';

import { formatSeconds } from '../../../lib/analise/playerDaSessao';
import type { FalaDaAnalise } from '../../../lib/analise/tiposDaAnalise';
import { mediaErrorMessage } from '../../../lib/mediaErrors';
import { Recording } from '../../../types';
import { toast } from '../../Toast';

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
              <button key={sp} type="button" aria-pressed={playbackSpeed === sp} onClick={() => setPlaybackSpeed(sp)}>
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
          <button type="button" className="pill" onClick={() => seekTo(0)}>
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
    </>
  );
}
