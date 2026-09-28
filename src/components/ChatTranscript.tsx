import '../styles/legendas.css';

import { Headphones, Languages, MessagesSquare, Mic, MonitorPlay, Play, Radio } from 'lucide-react';
import React from 'react';

import type { ConhecidasDaFala } from '../lib/captura/traducaoSobDemanda';
import { chaveDaPalavra, classesDoEstilo, resolverEstiloDeLegenda } from '../lib/estilosDeLegenda';
import { t } from '../lib/i18n';
import { baseLang, toBcp47 } from '../lib/languages';
import type { AgeProfileType } from '../lib/profile';
import { getTranscriptStyleClasses, type TranscriptSettings } from '../lib/transcriptUtils';
import type { VocabWord } from '../types';
import { IconeEmBloco } from './ui';

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
  /** Ficou sem tradução automática pela preferência "Tradução": mostra "Mostrar tradução". */
  traducaoSobDemanda?: boolean;
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
  /**
   * Painel de leitura ESCURO (`bg-ink`), como no design: os balões viram vidro sobre o escuro
   * em vez de cartões claros. Quem decide é a tela — só liga quando
   * `permiteSuperficieEscura(tsSettings)` (ver `lib/transcriptUtils`).
   */
  escuro?: boolean;
  selectedWord?: string | null;
  addedWords: string[];
  /** Palavras (minúsculas, sem pontuação) que a pessoa já aprendeu: ganham `data-aprendida`, que o
   *  estilo de legenda destaca. Ausente = nenhuma marcada. */
  aprendidas?: ReadonlySet<string>;
  onExamineWord: (word: VocabWord, lang: string, sentence: string) => void;
  onSpeakWord: (word: string, lang: string) => void;
  /** "Mostrar tradução" de uma fala deixada sob demanda. Ausente = sem o botão. */
  onRevelarTraducao?: (segId: string) => void;
  /**
   * Palavras que o aluno já sabe (modo "Só frases com palavra nova"): nas falas DESTE idioma, a
   * palavra que ele ainda não sabe ganha `data-nova`, um sublinhado pontilhado discreto. Ausente =
   * nenhuma marcada.
   */
  conhecidas?: ConhecidasDaFala | null;
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
function EmptyState({
  scenario,
  ageProfile,
  isRecording,
  escuro = false,
}: {
  scenario: 'media' | 'conversation' | 'mic';
  ageProfile: AgeProfileType;
  isRecording: boolean;
  escuro?: boolean;
}) {
  const tituloCls = escuro ? 'text-ink-contrast' : 'text-ink';
  const apoioCls = escuro ? 'text-white/60' : 'text-ink-muted';
  if (isRecording) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 select-none">
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent/20 animate-ping" />
          <Radio className="w-6 h-6 text-accent relative" />
        </span>
        <p className={`text-[15px] font-bold ${tituloCls}`}>Ouvindo…</p>
        <p className={`text-[12px] ${apoioCls} max-w-sm leading-relaxed`}>
          {scenario === 'media' && 'Dê o play no vídeo ou áudio. A legenda aparece aqui assim que alguém falar.'}
          {scenario === 'conversation' &&
            'Fale ou deixe a conversa correr. Cada pessoa vai aparecer de um lado, com a sua cor.'}
          {scenario === 'mic' && 'Pode falar ao microfone. Sua fala vira texto e tradução na hora.'}
        </p>
      </div>
    );
  }

  const passos =
    scenario === 'media'
      ? [
          {
            icon: Play,
            txt: ageProfile === 'kids' ? 'Abra o vídeo ou o jogo' : 'Abra o vídeo, aula ou podcast em qualquer app',
          },
          { icon: MonitorPlay, txt: 'Clique em Iniciar captura, pegamos o som do computador' },
          {
            icon: Headphones,
            txt: 'A legenda bilíngue aparece aqui e nas Legendas flutuantes',
          },
        ]
      : scenario === 'conversation'
        ? [
            {
              icon: Play,
              txt:
                ageProfile === 'senior' ? 'Abra a sua chamada (WhatsApp, Zoom…)' : 'Entre na call, reunião ou partida',
            },
            {
              icon: MessagesSquare,
              txt: 'Clique em iniciar, capturamos você e os outros ao mesmo tempo',
            },
            { icon: Mic, txt: 'Cada voz vira uma pessoa, com cor e lado próprios' },
          ]
        : [
            { icon: Mic, txt: 'Clique em iniciar e fale ao microfone' },
            { icon: MessagesSquare, txt: 'Sua fala vira texto na hora' },
            { icon: Headphones, txt: 'A tradução aparece embaixo, para você conferir' },
          ];

  // Marcação do protótipo aprovado (`T.capturar`): `.vazio` com o ícone em bloco, o título e os três
  // passos em `.pilha` > `.passo`.
  const IconeDoCenario = scenario === 'media' ? MonitorPlay : scenario === 'conversation' ? MessagesSquare : Mic;
  return (
    <div className="vazio">
      <IconeEmBloco icone={IconeDoCenario} />
      <h3 style={{ color: 'inherit' }}>
        {ageProfile === 'kids' ? 'A legenda aparece aqui' : 'Sua conversa aparece aqui'}
      </h3>
      <p className="mut">Três passos e pronto:</p>
      <div className="pilha" style={{ textAlign: 'left', marginTop: 6 }}>
        {passos.map((p, i) => (
          <div className="passo" key={i}>
            <IconeEmBloco icone={p.icon} />
            <span>
              {i + 1} · {p.txt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatTranscript({
  segments,
  speakers,
  scenario,
  tsSettings,
  ageProfile,
  sourceLang,
  targetLang,
  observedLang,
  isRecording,
  escuro = false,
  selectedWord,
  addedWords,
  aprendidas,
  onExamineWord,
  onSpeakWord,
  onRevelarTraducao,
  conhecidas,
}: ChatTranscriptProps) {
  const { sizeClasses, fontClass } = getTranscriptStyleClasses(tsSettings);
  /* O ESTILO DE LEGENDA equipado (onda 4): só classes no contêiner — a cor de alto contraste, o
     tamanho e a fonte acima continuam valendo por cima dele. */
  const estilo = classesDoEstilo(
    resolverEstiloDeLegenda(tsSettings.estilo, { altoContraste: tsSettings.textColor === 'highContrast' }),
  );
  const aprendida = (palavra: string) => (aprendidas?.has(chaveDaPalavra(palavra)) ? true : undefined);
  /* A palavra NOVA (só no modo `novas`, só no idioma do predicado, nunca número nem a que já tem o
     destaque de aprendida): `true` vira o atributo, `undefined` o omite. */
  const nova = (palavra: string, lang: string) =>
    conhecidas &&
    baseLang(lang) === baseLang(conhecidas.idioma) &&
    /\p{L}/u.test(palavra) &&
    !aprendida(palavra) &&
    !conhecidas.conhece(palavra)
      ? true
      : undefined;

  if (!segments.length) {
    return <EmptyState scenario={scenario} ageProfile={ageProfile} isRecording={isRecording} escuro={escuro} />;
  }

  const speakerOf = (id: string) => speakers.find((p) => p.id === id) ?? speakers[0];
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

  /* Marcação do protótipo aprovado (`T.capturar`): cada fala é uma `.fala` — quem falou, o original
     com as palavras do caderno clicáveis (`.palavra`) e a tradução embaixo. A ordem e o "esconder o
     original" das configurações da legenda continuam valendo; a cor da pessoa vai no nome. */
  return (
    <div className={`${fontClass} ${estilo}`}>
      {segments.map((segment) => {
        const speaker = speakerOf(segment.speakerId);
        const lineLang = langOf(segment);

        const original = !tsSettings.hideOriginal && (
          <span className={`orig ${sizeClasses.original}`} style={{ gridColumn: 2 }}>
            {segment.originalText.split(' ').map((wordStr, wIdx) => {
              const cleanWord = wordStr.replace(/[,.:?!]/g, '').toLowerCase();
              const vocabMatch = segment.words.find((vw) => vw.word.toLowerCase() === cleanWord);
              if (vocabMatch) {
                const selecionada = selectedWord?.toLowerCase() === cleanWord;
                const guardada = addedWords.includes(vocabMatch.word);
                return (
                  <React.Fragment key={wIdx}>
                    <button
                      type="button"
                      className="palavra"
                      data-aprendida={aprendida(wordStr)}
                      data-nova={nova(wordStr, lineLang)}
                      onClick={() => onExamineWord(vocabMatch, lineLang, segment.originalText)}
                      title="Clique para pronúncia nativa e detalhes"
                      aria-pressed={selecionada}
                      style={
                        selecionada
                          ? { background: 'color-mix(in srgb,var(--accent) 28%,transparent)', borderRadius: 4 }
                          : guardada
                            ? { borderBottomColor: 'var(--good)' }
                            : undefined
                      }
                    >
                      {wordStr}
                    </button>{' '}
                  </React.Fragment>
                );
              }
              return (
                <React.Fragment key={wIdx}>
                  <span
                    className="w"
                    data-aprendida={aprendida(wordStr)}
                    data-nova={nova(wordStr, lineLang)}
                    onClick={() => onSpeakWord(wordStr, lineLang)}
                    title="Clique para ouvir"
                    style={{ cursor: 'pointer' }}
                  >
                    {wordStr}
                  </span>{' '}
                </React.Fragment>
              );
            })}
            {/* Fala ainda em andamento: três pontos vivos. */}
            {segment.isPartial && !segment.originalText && (
              <span className="inline-flex items-center gap-1 py-0.5" aria-label="transcrevendo">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms`, background: 'currentColor', opacity: 0.5 }}
                  />
                ))}
              </span>
            )}
          </span>
        );
        /* Sob demanda (preferência "Tradução"): no lugar da linha traduzida, o convite a mostrá-la. */
        const traducao = segment.translatedText ? (
          <span className={`trad mut ${sizeClasses.translated}`}>{segment.translatedText}</span>
        ) : (
          segment.traducaoSobDemanda &&
          !segment.isPartial &&
          onRevelarTraducao && (
            <button
              type="button"
              className={`trad link ${sizeClasses.translated}`}
              style={{ justifySelf: 'start', minHeight: 0 }}
              onClick={() => onRevelarTraducao(segment.id)}
            >
              <Languages aria-hidden /> {t('Mostrar tradução')}
            </button>
          )
        );

        return (
          <div key={segment.id} className={`fala ${segment.isPartial ? 'nova' : ''}`}>
            <span className="quem" style={{ color: speaker.color }}>
              {speaker.name}
            </span>
            {tsSettings.displayOrder === 'original-first' ? (
              <>
                {original}
                {traducao}
              </>
            ) : (
              <>
                {traducao}
                {original}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
