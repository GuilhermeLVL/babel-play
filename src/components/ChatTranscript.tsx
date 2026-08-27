import React from 'react';
import { MonitorPlay, MessagesSquare, Mic, Headphones, Play, Radio } from 'lucide-react';
import { LangChip } from './LangFlag';
import { toBcp47 } from '../lib/languages';
import { getTranscriptStyleClasses, type TranscriptSettings } from '../lib/transcriptUtils';
import type { AgeProfileType } from '../lib/profile';
import type { VocabWord } from '../types';

/**
 * A CONVERSA — transcrição ao vivo em balões, com os dois lados em posições opostas
 * (som do computador à esquerda, seu microfone à direita), como num aplicativo de mensagens.
 *
 * POR QUE ISTO EXISTE COMO COMPONENTE. Antes a transcrição era renderizada em DOIS blocos JSX
 * quase idênticos — um embutido na tela, outro no Modo Foco — e eles divergiam a cada ajuste
 * (foi assim que o Modo Foco ficou meses sem o destaque de vocabulário). Aqui é um só.
 *
 * POR QUE LADOS OPOSTOS. Numa conversa, "quem falou" é a primeira pergunta que o olho faz. Com
 * tudo empilhado do mesmo lado, o usuário lia o NOME para descobrir de quem era a fala — trabalho
 * de leitura a cada linha. O lado responde isso antes de ler, e a cor da pessoa distingue os
 * vários interlocutores DENTRO do lado de lá (a diarização pode achar 2, 3, 5 vozes).
 *
 * No cenário "assistir mídia" NÃO há dois lados (é uma fonte só): ali os balões ocupam a largura
 * inteira, como uma legenda — inventar um "lado" para conteúdo de vídeo seria ruído.
 */

interface ChatSpeaker {
  id: string;
  name: string;
  color: string;
}

export interface ChatSegment {
  id: string;
  speakerId: string;
  source: 'system' | 'mic';
  timestamp: string;
  originalText: string;
  translatedText: string;
  isPartial?: boolean;
  words: VocabWord[];
  lang?: string;
}

interface ChatTranscriptProps {
  segments: ChatSegment[];
  speakers: ChatSpeaker[];
  scenario: 'media' | 'conversation' | 'mic';
  tsSettings: TranscriptSettings;
  ageProfile: AgeProfileType;
  /** Idiomas configurados — último recurso quando não há detecção nem observação. */
  sourceLang: string;
  targetLang: string;
  /**
   * Idioma OBSERVADO na sessão (perfil adaptativo, já convergido). Vazio enquanto ouvindo.
   *
   * Entra na frente do configurado no recuo: um usuário assistindo vídeo em espanhol com a
   * configuração em inglês via 🇺🇸 em toda fala cuja detecção individual falhasse — o rótulo
   * afirmava o que estava escrito nos ajustes, não o que estava sendo dito.
   */
  observedLang?: string;
  isRecording: boolean;
  /** Modo Foco usa a versão espaçada (`dense = false`). */
  dense?: boolean;
  selectedWord?: string | null;
  addedWords: string[];
  onExamineWord: (word: VocabWord, lang: string, sentence: string) => void;
  onSpeakWord: (word: string, lang: string) => void;
}

/** Iniciais para o avatar ("Pessoa 2" → "P2", "Você" → "VO", "Maria Silva" → "MS"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * ESTADO VAZIO que ENSINA. Antes, esta área era um retângulo em branco de meia tela — o maior
 * elemento da interface não dizia nada. Agora ela explica, no vocabulário do perfil, o que vai
 * acontecer e qual é o próximo passo.
 */
function EmptyState({ scenario, ageProfile, isRecording }: {
  scenario: 'media' | 'conversation' | 'mic';
  ageProfile: AgeProfileType;
  isRecording: boolean;
}) {
  if (isRecording) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 select-none">
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent/20 animate-ping" />
          <Radio className="w-6 h-6 text-accent relative" />
        </span>
        <p className="text-[15px] font-bold text-ink">Ouvindo…</p>
        <p className="text-[12px] text-ink-muted max-w-sm leading-relaxed">
          {scenario === 'media' && 'Dê o play no vídeo ou áudio. A legenda aparece aqui assim que alguém falar.'}
          {scenario === 'conversation' && 'Fale ou deixe a conversa correr. Cada pessoa vai aparecer de um lado, com a sua cor.'}
          {scenario === 'mic' && 'Pode falar ao microfone. Sua fala vira texto e tradução na hora.'}
        </p>
      </div>
    );
  }

  const passos = scenario === 'media'
    ? [
        { icon: <Play className="w-4 h-4" />, txt: ageProfile === 'kids' ? 'Abra o vídeo ou o jogo' : 'Abra o vídeo, aula ou podcast em qualquer app' },
        { icon: <MonitorPlay className="w-4 h-4" />, txt: 'Clique em iniciar, pegamos o som do computador' },
        { icon: <Headphones className="w-4 h-4" />, txt: 'A legenda bilíngue aparece aqui e nas Legendas flutuantes' },
      ]
    : scenario === 'conversation'
      ? [
          { icon: <Play className="w-4 h-4" />, txt: ageProfile === 'senior' ? 'Abra a sua chamada (WhatsApp, Zoom…)' : 'Entre na call, reunião ou partida' },
          { icon: <MessagesSquare className="w-4 h-4" />, txt: 'Clique em iniciar, capturamos você e os outros ao mesmo tempo' },
          { icon: <Mic className="w-4 h-4" />, txt: 'Cada voz vira uma pessoa, com cor e lado próprios' },
        ]
      : [
          { icon: <Mic className="w-4 h-4" />, txt: 'Clique em iniciar e fale ao microfone' },
          { icon: <MessagesSquare className="w-4 h-4" />, txt: 'Sua fala vira texto na hora' },
          { icon: <Headphones className="w-4 h-4" />, txt: 'A tradução aparece embaixo, para você conferir' },
        ];

  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 text-center px-6 select-none">
      <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center">
        {scenario === 'media' ? <MonitorPlay className="w-7 h-7 text-accent" />
          : scenario === 'conversation' ? <MessagesSquare className="w-7 h-7 text-accent" />
          : <Mic className="w-7 h-7 text-accent" />}
      </div>
      <div>
        <p className="text-[15px] font-bold text-ink">
          {ageProfile === 'kids' ? 'A legenda aparece aqui' : 'Sua conversa aparece aqui'}
        </p>
        <p className="text-[12px] text-ink-muted mt-1">Três passos e pronto:</p>
      </div>
      <ol className="flex flex-col gap-2.5 text-left">
        {passos.map((p, i) => (
          <li key={i} className="flex items-center gap-3 text-[12.5px] text-ink-muted">
            <span className="w-7 h-7 rounded-lg bg-canvas border border-border-subtle flex items-center justify-center text-ink-faint shrink-0">
              {p.icon}
            </span>
            <span><b className="text-ink-faint font-mono text-[10px] mr-1.5">{i + 1}</b>{p.txt}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ChatTranscript({
  segments, speakers, scenario, tsSettings, ageProfile, sourceLang, targetLang, observedLang,
  isRecording, dense = true, selectedWord, addedWords, onExamineWord, onSpeakWord,
}: ChatTranscriptProps) {
  const { sizeClasses, fontClass, colorClasses } = getTranscriptStyleClasses(tsSettings);
  // "Mídia" tem uma fonte só — não há dois lados a distinguir; o balão ocupa a linha toda.
  const usaLados = scenario !== 'media';
  // Kids/Sênior respiram mais: alvo de toque maior e menos densidade visual.
  const folgado = ageProfile !== 'pro' || !dense;

  if (!segments.length) {
    return <EmptyState scenario={scenario} ageProfile={ageProfile} isRecording={isRecording} />;
  }

  const speakerOf = (id: string) => speakers.find(p => p.id === id) ?? speakers[0];
  /**
   * Idioma da fala, em ordem de confiabilidade:
   *  1. o DETECTADO nesta fala — é a evidência mais direta;
   *  2. o OBSERVADO na sessão — o que de fato está sendo falado, com confiança medida;
   *  3. o CONFIGURADO — último recurso, porque é uma declaração de intenção, não uma medição.
   *
   * A ordem importa e o passo 2 faltava: sem ele, toda fala com detecção falha exibia o idioma
   * dos ajustes. Num vídeo em espanhol com configuração em inglês, o chip dizia 🇺🇸 enquanto o
   * app já sabia, por dezenas de outras falas, que o conteúdo era espanhol.
   */
  const langOf = (s: ChatSegment) => {
    if (s.lang) return toBcp47(s.lang) || s.lang;
    if (s.source === 'system' && observedLang) return toBcp47(observedLang) || observedLang;
    return s.source === 'system' ? targetLang : sourceLang;
  };

  return (
    <div className={`flex flex-col ${folgado ? 'gap-3' : 'gap-2'} ${fontClass}`}>
      {segments.map((segment, i) => {
        const speaker = speakerOf(segment.speakerId);
        const isMic = segment.source === 'mic';
        const lineLang = langOf(segment);
        // AGRUPAMENTO: falas seguidas da MESMA pessoa não repetem avatar e nome — é o que
        // transforma uma lista de linhas numa conversa legível (e economiza altura de tela).
        const anterior = segments[i - 1];
        const primeiraDaSequencia = !anterior
          || anterior.speakerId !== segment.speakerId
          || anterior.source !== segment.source;

        const palavras = !tsSettings.hideOriginal && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {segment.originalText.split(' ').map((wordStr, wIdx) => {
              const cleanWord = wordStr.replace(/[,.:?!]/g, '').toLowerCase();
              const vocabMatch = segment.words.find(vw => vw.word.toLowerCase() === cleanWord);
              if (vocabMatch) {
                return (
                  <button
                    key={wIdx}
                    onClick={() => onExamineWord(vocabMatch, lineLang, segment.originalText)}
                    className={`font-bold px-1.5 py-0.5 rounded border border-dashed transition-all cursor-pointer ${sizeClasses.original} ${
                      selectedWord?.toLowerCase() === cleanWord
                        ? 'bg-accent text-white border-accent shadow-btn'
                        : addedWords.includes(vocabMatch.word)
                          ? 'bg-good-soft border-good/50 text-good-ink'
                          : 'bg-canvas/80 border-border-subtle text-ink hover:bg-surface-hover'
                    }`}
                    title="Clique para pronúncia nativa e detalhes"
                  >
                    {wordStr}
                  </button>
                );
              }
              return (
                <span
                  key={wIdx}
                  className={`cursor-pointer hover:text-accent transition-colors font-medium ${sizeClasses.original}`}
                  onClick={() => onSpeakWord(wordStr, lineLang)}
                  title="Clique para ouvir"
                >
                  {wordStr}
                </span>
              );
            })}
          </div>
        );

        const traducao = segment.translatedText && (
          <p className={`leading-relaxed font-semibold ${sizeClasses.translated} ${colorClasses.translated} ${
            tsSettings.hideOriginal ? '' : 'mt-1 pt-1 border-t border-border-subtle/60'
          }`}>
            {segment.translatedText}
          </p>
        );

        const avatar = (
          <div
            className={`${folgado ? 'w-8 h-8 text-[11px]' : 'w-7 h-7 text-[10px]'} rounded-full shrink-0 flex items-center justify-center font-black text-white shadow-sm`}
            style={{ backgroundColor: speaker.color }}
            title={speaker.name}
            aria-hidden
          >
            {initials(speaker.name)}
          </div>
        );

        return (
          <div
            key={segment.id}
            className={`flex items-end gap-2 animate-in fade-in ${
              usaLados
                ? (isMic ? 'flex-row-reverse slide-in-from-right-2' : 'slide-in-from-left-2')
                : 'slide-in-from-bottom-1'
            } ${primeiraDaSequencia ? '' : (folgado ? '-mt-1.5' : '-mt-1')}`}
          >
            {/* Avatar só na primeira fala da sequência; nas seguintes, um vão do mesmo tamanho
                mantém os balões alinhados (sem "degrau" na coluna). */}
            {usaLados && (primeiraDaSequencia
              ? avatar
              : <div className={folgado ? 'w-8 shrink-0' : 'w-7 shrink-0'} aria-hidden />)}

            <div className={`min-w-0 ${usaLados ? 'max-w-[82%]' : 'w-full'} flex flex-col ${isMic && usaLados ? 'items-end' : 'items-start'}`}>
              {/* Cabeçalho: nome (só na 1ª da sequência), idioma da fala e hora. */}
              {(primeiraDaSequencia || !usaLados) && (
                <div className={`flex items-center gap-1.5 mb-0.5 px-1 ${isMic && usaLados ? 'flex-row-reverse' : ''}`}>
                  {usaLados && (
                    <span className="text-[11px] font-bold truncate" style={{ color: speaker.color }}>
                      {speaker.name}
                    </span>
                  )}
                  <LangChip code={lineLang} />
                  <span className="text-[9px] font-mono text-ink-faint">{segment.timestamp}</span>
                </div>
              )}

              {/* BALÃO. Superfície do TEMA nos dois lados (nunca `bg-accent` com texto branco: nos
                  temas de destaque claro isso vira texto branco em fundo branco). A identidade vem
                  da faixa colorida da pessoa e do lado, não de um fundo colorido ilegível. */}
              <div
                className={`relative px-3 py-2 shadow-sm ${colorClasses.container} ${
                  usaLados
                    ? (isMic
                        ? 'bg-accent-soft/60 border border-accent/25 rounded-2xl rounded-br-sm'
                        : 'bg-surface border border-border-subtle rounded-2xl rounded-bl-sm')
                    : 'bg-surface border border-border-subtle rounded-xl w-full'
                } ${segment.isPartial ? 'opacity-90' : ''}`}
                style={!usaLados || !isMic ? { borderLeftWidth: 3, borderLeftColor: speaker.color } : undefined}
              >
                {tsSettings.displayOrder === 'original-first'
                  ? <>{palavras}{traducao}</>
                  : <>{traducao}{palavras}</>}

                {/* Fala ainda em andamento: três pontos vivos, como num app de mensagens. */}
                {segment.isPartial && !segment.originalText && (
                  <span className="flex items-center gap-1 py-0.5" aria-label="transcrevendo">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-faint animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
