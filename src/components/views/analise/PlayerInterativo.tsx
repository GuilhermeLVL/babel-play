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
import {
  AlertTriangle,
  CircleHelp,
  Loader2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Snail,
} from 'lucide-react';
import { type Dispatch, type ReactNode, type RefObject, type SetStateAction, useState } from 'react';

import { formatSeconds } from '../../../lib/analise/playerDaSessao';
import type { FalaDaAnalise } from '../../../lib/analise/tiposDaAnalise';
import { noHeadset, useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
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
  /** O áudio gravado ainda está sendo baixado (só a faixa do Quest mostra a espera). */
  carregandoAudio?: boolean;
  /** O áudio gravado não veio: a mensagem do motivo (só a faixa do Quest a mostra). */
  erroDoAudio?: string | null;
  /**
   * Sessão sem áudio gravado: há voz de leitura para narrar alguma fala? `false` (o Quest sem a voz
   * do site, ou num idioma que ela não lê) troca a faixa pelo motivo. Só o ramo do Quest olha.
   */
  haVozParaNarrar?: boolean;
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
    carregandoAudio = false,
    erroDoAudio = null,
    haVozParaNarrar = true,
  } = props;
  const questNovo = useQuestNovo();
  /* Só no Quest: "O que fazem Slow-Mo e Loop". Na tela de sempre isso é a dica do ponteiro (`title`),
     que no headset não existe. */
  const [ajudaAberta, setAjudaAberta] = useState(false);

  if (recording.type === 'document') return null;

  const activeSentence =
    activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length
      ? parsedSentences[activeSentenceIndex]
      : null;

  /* Marcação do protótipo aprovado (`abaTranscricao`): um cartão compacto — tocar, a trilha com o
       tempo e quem está falando, a velocidade, e embaixo Slow-Mo, loop, reiniciar e "Ajustar exibição".
       O áudio REAL continua sendo a fonte do tempo; sem áudio, o relógio avança pela legenda. */
  const pct = totalDurationSeconds > 0 ? Math.min(100, (currentTime / totalDurationSeconds) * 100) : 0;
  const audio = hasRealAudio && (
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
  );

  /* META QUEST (as telas novas): a faixa de controles do pé da tela, a mesma peça da legenda ao vivo e
     da Biblioteca. Um único botão principal (tocar), a posição com o tempo e quem fala, e as três
     velocidades, o Slow-Mo, o loop e o reiniciar como alvos de 60 px. "Ajustar exibição" fica na
     barra acima das falas (vale também para documento, que não tem player). */
  if (questNovo) {
    /* Sem áudio gravado o player NARRA o texto (no Quest, pela voz do site). Sem voz para nenhuma
       fala, em vez de um botão que não toca a faixa diz o motivo. */
    if (!hasRealAudio && !haVozParaNarrar) {
      return (
        <section className="q-aviso qs-player-sem-voz" aria-label={t('Player')} role="note">
          <span>
            {/* A voz do site é a saída do HEADSET; no computador a voz é a do sistema. */}
            {noHeadset()
              ? t(
                  'Esta sessão não tem áudio gravado, e não há voz de leitura neste aparelho para o idioma dela. A voz do site lê inglês, espanhol, francês, chinês, japonês e coreano, com a IA de nuvem ligada em Ajustes.',
                )
              : t(
                  'Esta sessão não tem áudio gravado, e este navegador não tem voz de leitura para o idioma dela. Instale uma voz para o idioma nas configurações do sistema (no Windows: Hora e Idioma → Voz).',
                )}
          </span>
        </section>
      );
    }
    const esperando = hasRealAudio && (carregandoAudio || (!audioSrc && !erroDoAudio));
    const falhou = hasRealAudio && !!erroDoAudio;
    return (
      <section className="qs-player" aria-label={t('Player')}>
        {audio}
        {ajudaAberta && (
          <dl className="qs-ajuda-do-player" id="ajuda-do-player">
            <div>
              <dt>
                <Snail aria-hidden /> {t('Smart Slow-Mo')}
              </dt>
              <dd>{t('Diminui a velocidade nos trechos com vocabulário difícil.')}</dd>
            </div>
            <div>
              <dt>
                <Repeat aria-hidden /> {t('Modo loop')}
              </dt>
              <dd>{t('Repete o trecho ativo, bom para fixar pronúncia.')}</dd>
            </div>
            {!hasRealAudio && (
              <div>
                <dt>
                  <Play aria-hidden /> {t('Sem áudio gravado')}
                </dt>
                <dd>{t('O player narra o texto com a voz de leitura, uma fala por vez.')}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="q-faixa qs-faixa-do-player">
          <button
            type="button"
            className="q-ctl pri"
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={esperando || falhou}
            aria-label={isPlaying ? t('Pausar') : t('Tocar')}
          >
            {esperando ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : isPlaying ? (
              <Pause aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
          </button>
          <div className="qs-trilho">
            <input
              id="analysis-seekbar"
              name="analysis-seekbar"
              type="range"
              className="qs-posicao"
              min={0}
              max={totalDurationSeconds}
              step={0.5}
              value={currentTime}
              disabled={esperando || falhou}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label={t('Posição na gravação')}
              aria-valuetext={t('{atual} de {total}', {
                atual: formatSeconds(currentTime),
                total: formatSeconds(totalDurationSeconds),
              })}
              style={{ ['--p' as string]: `${pct}%` }}
            />
            <div className="qs-relogio">
              <span>{formatSeconds(currentTime)}</span>
              <span className="qs-falando" role="status">
                {falhou ? (
                  <>
                    <AlertTriangle aria-hidden /> {t('Não deu para carregar o áudio desta sessão.')}
                  </>
                ) : esperando ? (
                  t('Carregando o áudio…')
                ) : activeSentence ? (
                  t('{quem} falando', { quem: activeSentence.speaker })
                ) : (
                  ''
                )}
              </span>
              <span>{recording.durationStr}</span>
            </div>
          </div>
          <div className="q-abas q-seg" role="group" aria-label={t('Velocidade')}>
            {[0.75, 1, 1.25].map((sp) => (
              <button
                key={sp}
                type="button"
                className="q-aba"
                aria-pressed={playbackSpeed === sp}
                onClick={() => setPlaybackSpeed(sp)}
              >
                {String(sp).replace('.', ',')}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="q-ctl"
            aria-pressed={autoSlowEnabled}
            aria-label={t('Smart Slow-Mo: diminui a velocidade nos trechos com vocabulário difícil')}
            onClick={() => setAutoSlowEnabled(!autoSlowEnabled)}
          >
            <Snail aria-hidden /> <span className="qs-rotulo-do-ctl">{t('Slow-Mo')}</span>
          </button>
          <button
            type="button"
            className="q-ctl"
            aria-pressed={loopMode}
            aria-label={t('Modo loop: repete o trecho ativo')}
            onClick={() => setLoopMode(!loopMode)}
          >
            <Repeat aria-hidden /> <span className="qs-rotulo-do-ctl">{t('Loop')}</span>
          </button>
          <button type="button" className="q-ctl" aria-label={t('Reiniciar')} onClick={() => seekTo(0)}>
            <RotateCcw aria-hidden />
          </button>
          <button
            type="button"
            className="q-ctl"
            aria-label={t('O que fazem Slow-Mo e Loop')}
            aria-expanded={ajudaAberta}
            aria-controls="ajuda-do-player"
            onClick={() => setAjudaAberta((v) => !v)}
          >
            <CircleHelp aria-hidden />
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="cartao p5 player" aria-label="Player">
        {audio}
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
