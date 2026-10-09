/**
 * O PLAYER da sessão — a faixa do protótipo: fala anterior, tocar/pausar, próxima fala, o trilho e
 * "Fala n de N". O shadowing mora na folha da frase (`SombraDaFala`).
 *
 * Todo o estado que ele lê e escreve mora na tela (`views/Analysis.tsx`) e chega aqui por props,
 * explícito. A máquina de reprodução (seek, motor de áudio/TTS, waveform) está em
 * `lib/analise/playerDaSessao.ts`.
 */
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { type Dispatch, type RefObject, type SetStateAction } from 'react';

import type { FalaDaAnalise } from '../../../lib/analise/tiposDaAnalise';
import { noHeadset } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { mediaErrorMessage } from '../../../lib/mediaErrors';
import { Recording } from '../../../types';
import { toast } from '../../Toast';

export interface PropsDoPlayerInterativo {
  recording: Recording;
  parsedSentences: FalaDaAnalise[];
  /** Há áudio gravado de verdade? Sem ele o player narra por TTS. */
  hasRealAudio: boolean;
  /** URL de BLOB do áudio autenticado (a rota da API está atrás do `authMiddleware`). */
  audioSrc: string | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  audioDuration: number;
  setAudioDuration: Dispatch<SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  loopMode: boolean;
  activeSentenceIndex: number;
  seekTo: (t: number) => void;
  /** O áudio gravado ainda está sendo baixado (a faixa mostra a espera). */
  carregandoAudio?: boolean;
  /** O áudio gravado não veio: a mensagem do motivo. */
  erroDoAudio?: string | null;
  /**
   * Sessão sem áudio gravado: há voz de leitura para narrar alguma fala? `false` (o Quest sem a voz
   * do site, ou num idioma que ela não lê) troca a faixa pelo motivo.
   */
  haVozParaNarrar?: boolean;
}

export default function PlayerInterativo(props: PropsDoPlayerInterativo) {
  const {
    recording,
    parsedSentences,
    hasRealAudio,
    audioSrc,
    audioRef,
    audioDuration,
    setAudioDuration,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    loopMode,
    activeSentenceIndex,
    seekTo,
    carregandoAudio = false,
    erroDoAudio = null,
    haVozParaNarrar = true,
  } = props;

  if (recording.type === 'document') return null;

  /* O áudio REAL continua sendo a fonte do tempo; sem áudio, o relógio avança pela legenda. */
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

  /* O DESENHO NOVO: a faixa do protótipo (`telas3.js:69-70`), presa ao pé da tela. "Ajustar
     exibição" fica na barra acima das falas (vale também para documento, que não tem player). */
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
  /* O PLAYER DO PROTÓTIPO (`telas3.js:69-70`, itens D51 e D52): anterior, o botão principal, próxima,
       o trilho e "Fala n de N", numa faixa de vidro presa embaixo (`telas3.css:13-21, 54-55`). O áudio
       é o de verdade: "Ouvir" toca de onde parou e os vizinhos recomeçam da fala ao lado
       (`telas3.js:172-173`). */
  const total = parsedSentences.length;
  const naFala = Math.max(0, Math.min(total - 1, activeSentenceIndex));
  const irPara = (i: number) => {
    const alvo = parsedSentences[Math.max(0, Math.min(total - 1, i))];
    if (!alvo) return;
    seekTo(alvo.startTime);
    setIsPlaying(true);
  };
  /* `telas3.js:48`: a barra anda uma fala por vez; parada no começo, fica vazia. */
  const largura = total > 0 && (isPlaying || activeSentenceIndex > 0) ? ((naFala + 1) / total) * 100 : 0;
  return (
    <div className="q-faixa px-player" role="group" aria-label={t('Player')}>
      {audio}
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Fala anterior')}
        data-px="antes"
        disabled={esperando || falhou || total === 0}
        onClick={() => irPara(naFala - 1)}
      >
        <SkipBack aria-hidden />
      </button>
      <button
        type="button"
        className="q-ctl pri"
        data-px="tocar"
        disabled={esperando || falhou || total === 0}
        onClick={() => setIsPlaying(!isPlaying)}
      >
        {isPlaying ? (
          <>
            <Pause key="pausa" aria-hidden /> {t('Pausar')}
          </>
        ) : (
          <>
            <Play key="toca" aria-hidden /> {t('Ouvir')}
          </>
        )}
      </button>
      <button
        type="button"
        className="q-ctl"
        aria-label={t('Próxima fala')}
        data-px="depois"
        disabled={esperando || falhou || total === 0}
        onClick={() => irPara(naFala + 1)}
      >
        <SkipForward aria-hidden />
      </button>
      <span className="qs-trilho px-trilho-do-player">
        <span className="qs-posicao" style={{ width: `${largura}%` }} />
      </span>
      <span className="q-tempo px-onde" role="status">
        {falhou
          ? t('Não deu para carregar o áudio desta sessão.')
          : esperando
            ? t('Carregando o áudio…')
            : t('Fala {n} de {total}', { n: naFala + 1, total: Math.max(1, total) })}
      </span>
    </div>
  );
}
