import '../styles/legendas.css';

import {
  ChevronUp,
  Headphones,
  Languages,
  MessagesSquare,
  Mic,
  MonitorPlay,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react';
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
  /** A tradução espera o tradutor local carregar: a linha diz "Baixando o tradutor…". */
  traducaoPendente?: boolean;
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
  /**
   * O download do tradutor local (0..1), para a linha das falas que esperam por ele ("Baixando o
   * tradutor… 42%"). Ausente/`null` = sem porcentagem ("Preparando a tradução…").
   */
  progressoDoTradutor?: number | null;
  /**
   * TOCAR NA FALA (a captura no celular): o toque em qualquer ponto do balão abre as ações dela — a
   * folha da frase. Com isto, a palavra solta deixa de falar sozinha no toque (o dedo não acerta uma
   * palavra de 14 px sem acertar a frase); as palavras viram botões dentro da folha. Ausente = o
   * comportamento de sempre.
   */
  aoTocarFala?: (segment: ChatSegment, lang: string) => void;
  /** A fala tocada por último: ela mostra `acoesDaFala` embaixo do texto (os atalhos Ouvir/Devagar). */
  falaEmFoco?: string | null;
  acoesDaFala?: (segment: ChatSegment, lang: string) => React.ReactNode;
  /**
   * O MENU DO BALÃO NO COMPUTADOR (Tradução Nuance, D4 da Fase D): um botão discreto em cada fala
   * final abre as "Outras formas" e o Formal/Informal dela. Só onde não há o toque na fala (o celular
   * já tem a folha da frase). Ausente = sem o botão.
   */
  aoAbrirMenuDaFala?: (segment: ChatSegment, lang: string) => void;
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

/**
 * QUANTAS FALAS VÃO AO DOM. Medido (Playwright, falas injetadas): 3.000 falas eram 48 mil nós e
 * 191 ms por quadro PARADO — estilo e layout de milhares de linhas que ninguém está vendo. As
 * últimas 200 cobrem vários minutos de conversa na tela; as anteriores ficam a um clique, em
 * páginas do mesmo tamanho. Não há lib de virtualização nas dependências, e uma janela simples não
 * mexe no acompanhamento do fim (a rolagem continua sendo a do contêiner da tela).
 */
export const JANELA_DA_CONVERSA = 200;
/**
 * A janela desliza em DEGRAUS, não fala a fala: sem isto, cada fala nova tiraria a primeira do
 * DOM (duas mutações por fala, e a rolagem de quem relê pulando uma linha a cada fala). Com o
 * degrau, entre 200 e 249 linhas ficam montadas e a saída acontece de 50 em 50 — o ancoramento de
 * rolagem do navegador (`overflow-anchor`) segura a posição de quem está lendo mais acima.
 */
const DEGRAU_DA_JANELA = 50;

/** Índice da primeira fala montada: as últimas `limite`, em degraus, sem esconder a fala `fixada`. */
function inicioDaJanela(total: number, limite: number, fixada: number): number {
  const bruto = Math.max(0, total - limite);
  const inicio = Math.floor(bruto / DEGRAU_DA_JANELA) * DEGRAU_DA_JANELA;
  return fixada >= 0 && fixada < inicio ? fixada : inicio;
}

const NENHUMA: string[] = [];

interface FalaProps {
  segment: ChatSegment;
  speaker: ChatSpeaker;
  lang: string;
  esconderOriginal: boolean;
  originalPrimeiro: boolean;
  tamOriginal: string;
  tamTraducao: string;
  /** A palavra selecionada (minúscula), SÓ se ela está nesta fala (senão `null`): tocar numa
   *  palavra não re-renderiza as outras 199 linhas. */
  selecionada: string | null;
  /** O caderno desta visita, só para fala com palavra do caderno (as outras não o leem). */
  guardadas: string[];
  aprendidas?: ReadonlySet<string>;
  conhecidas?: ConhecidasDaFala | null;
  aoExaminar: (segment: ChatSegment, word: VocabWord, lang: string) => void;
  aoOuvir: (segId: string, word: string, lang: string) => void;
  aoRevelar?: (segId: string) => void;
  /** O que a linha da tradução diz enquanto ela espera o tradutor (só nas falas pendentes). */
  pendente?: string;
  aoTocar?: (segment: ChatSegment, lang: string) => void;
  /** Os atalhos embaixo do texto (só a fala em foco os recebe). */
  acoes?: React.ReactNode;
  /** O menu do balão no computador (D4). */
  aoMenu?: (segment: ChatSegment, lang: string) => void;
}

/**
 * UMA FALA, memorizada. As props são estáveis entre renders (os callbacks chegam embrulhados pela
 * lista, o falante é o objeto do array, o tamanho vem como string): quando chega fala nova, só a
 * linha nova — e a parcial que virou final — renderiza de novo. Antes, cada parcial do streaming
 * refazia um `<span>` por palavra de TODAS as falas da sessão.
 */
const FalaDaConversa = React.memo(function FalaDaConversa({
  segment,
  speaker,
  lang: lineLang,
  esconderOriginal,
  originalPrimeiro,
  tamOriginal,
  tamTraducao,
  selecionada,
  guardadas,
  aprendidas,
  conhecidas,
  aoExaminar,
  aoOuvir,
  aoRevelar,
  pendente,
  aoTocar,
  acoes,
  aoMenu,
}: FalaProps) {
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

  const original = !esconderOriginal && (
    <span className={`orig ${tamOriginal}`} style={{ gridColumn: 2 }}>
      {segment.originalText.split(' ').map((wordStr, wIdx) => {
        const cleanWord = wordStr.replace(/[,.:?!]/g, '').toLowerCase();
        const vocabMatch = segment.words.find((vw) => vw.word.toLowerCase() === cleanWord);
        if (vocabMatch) {
          const marcada = selecionada === cleanWord;
          const guardada = guardadas.includes(vocabMatch.word);
          return (
            <React.Fragment key={wIdx}>
              <button
                type="button"
                className="palavra"
                data-aprendida={aprendida(wordStr)}
                data-nova={nova(wordStr, lineLang)}
                onClick={(e) => {
                  e.stopPropagation(); // a palavra abre o cartão dela, não a folha da frase
                  aoExaminar(segment, vocabMatch, lineLang);
                }}
                title="Clique para pronúncia nativa e detalhes"
                aria-pressed={marcada}
                style={
                  marcada
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
              onClick={aoTocar ? undefined : () => aoOuvir(segment.id, wordStr, lineLang)}
              title={aoTocar ? undefined : 'Clique para ouvir'}
              style={aoTocar ? undefined : { cursor: 'pointer' }}
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
  const traducao = pendente ? (
    <span className={`trad mut ${tamTraducao}`} data-testid="traducao-pendente">
      {pendente}
    </span>
  ) : segment.translatedText ? (
    <span className={`trad mut ${tamTraducao}`}>{segment.translatedText}</span>
  ) : (
    segment.traducaoSobDemanda &&
    !segment.isPartial &&
    aoRevelar && (
      <button
        type="button"
        className={`trad link ${tamTraducao}`}
        style={{ justifySelf: 'start', minHeight: 0 }}
        onClick={() => aoRevelar(segment.id)}
      >
        <Languages aria-hidden /> {t('Mostrar tradução')}
      </button>
    )
  );

  /* O toque na fala (celular): o balão inteiro é o alvo, e um botão de verdade (o "Mais") dá o mesmo
     caminho a teclado e leitor de tela — um `div` clicável sozinho não é alcançável por eles. */
  const tocavel = aoTocar && !segment.isPartial && !!segment.originalText;
  const comMenu = !aoTocar && aoMenu && !segment.isPartial && !!segment.originalText;
  return (
    <div
      className={`fala ${segment.isPartial ? 'nova' : ''} ${acoes ? 'em-foco' : ''}`}
      data-tocavel={tocavel ? true : undefined}
      onClick={
        tocavel
          ? (e) => {
              if ((e.target as HTMLElement).closest('button, a')) return;
              aoTocar(segment, lineLang);
            }
          : undefined
      }
    >
      <span className="quem" style={{ color: speaker.color }}>
        {speaker.name}
      </span>
      {originalPrimeiro ? (
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
      {tocavel &&
        (acoes ?? (
          <button type="button" className="sr fala-mais" onClick={() => aoTocar(segment, lineLang)}>
            {t('Ações da fala')}
          </button>
        ))}
      {comMenu && (
        <span className="fala-acoes" style={{ gridColumn: 2, justifySelf: 'end' }}>
          <button
            type="button"
            className="btn btn-outline icone"
            aria-label={t('Tradução Nuance da fala')}
            title={t('Outras formas, formal ou informal')}
            onClick={() => aoMenu(segment, lineLang)}
          >
            <Sparkles aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
});

/**
 * A lista, memorizada: o relógio de 1 s e todo estado da tela que não é da conversa param aqui
 * (a tela passa props estáveis — ver o bloco da transcrição em `LiveCapture`). Os callbacks são
 * lidos por ref: um callback novo a cada render do pai não derruba o memo das linhas, e a linha
 * sempre chama o mais recente.
 */
function ChatTranscript({
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
  progressoDoTradutor,
  aoTocarFala,
  falaEmFoco = null,
  acoesDaFala,
  aoAbrirMenuDaFala,
}: ChatTranscriptProps) {
  const callbacks = React.useRef({ onExamineWord, onSpeakWord, onRevelarTraducao, aoTocarFala, aoAbrirMenuDaFala });
  callbacks.current = { onExamineWord, onSpeakWord, onRevelarTraducao, aoTocarFala, aoAbrirMenuDaFala };
  /* A fala em que a pessoa tocou por último: a janela não a tira do DOM enquanto ela lê a ficha. */
  const [fixadaId, setFixadaId] = React.useState<string | null>(null);
  const [limite, setLimite] = React.useState(JANELA_DA_CONVERSA);

  const aoExaminar = React.useCallback((segment: ChatSegment, word: VocabWord, lang: string) => {
    setFixadaId(segment.id);
    callbacks.current.onExamineWord(word, lang, segment.originalText);
  }, []);
  const aoOuvir = React.useCallback((segId: string, word: string, lang: string) => {
    setFixadaId(segId);
    callbacks.current.onSpeakWord(word, lang);
  }, []);
  const aoRevelarEstavel = React.useCallback((segId: string) => callbacks.current.onRevelarTraducao?.(segId), []);
  const aoRevelar = onRevelarTraducao ? aoRevelarEstavel : undefined;
  const aoTocarEstavel = React.useCallback((segment: ChatSegment, lang: string) => {
    setFixadaId(segment.id);
    callbacks.current.aoTocarFala?.(segment, lang);
  }, []);
  const aoTocar = aoTocarFala ? aoTocarEstavel : undefined;
  const aoMenuEstavel = React.useCallback((segment: ChatSegment, lang: string) => {
    setFixadaId(segment.id);
    callbacks.current.aoAbrirMenuDaFala?.(segment, lang);
  }, []);
  const aoMenu = aoAbrirMenuDaFala ? aoMenuEstavel : undefined;

  if (!segments.length) {
    return <EmptyState scenario={scenario} ageProfile={ageProfile} isRecording={isRecording} escuro={escuro} />;
  }

  const { sizeClasses, fontClass } = getTranscriptStyleClasses(tsSettings);
  /* O ESTILO DE LEGENDA equipado (onda 4): só classes no contêiner — a cor de alto contraste, o
     tamanho e a fonte acima continuam valendo por cima dele. */
  const estilo = classesDoEstilo(
    resolverEstiloDeLegenda(tsSettings.estilo, { altoContraste: tsSettings.textColor === 'highContrast' }),
  );

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
  const selecionadaMin = selectedWord ? selectedWord.toLowerCase() : null;

  /* A fixada é procurada de trás para frente: quase sempre está entre as últimas. */
  let fixada = -1;
  if (fixadaId) {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].id === fixadaId) {
        fixada = i;
        break;
      }
    }
  }
  const inicio = inicioDaJanela(segments.length, limite, fixada);
  const visiveis = inicio > 0 ? segments.slice(inicio) : segments;
  const rotuloPendente =
    progressoDoTradutor != null && progressoDoTradutor < 1
      ? t('Baixando o tradutor… {pct}%', { pct: Math.round(progressoDoTradutor * 100) })
      : t('Preparando a tradução…');

  /* Marcação do protótipo aprovado (`T.capturar`): cada fala é uma `.fala` — quem falou, o original
     com as palavras do caderno clicáveis (`.palavra`) e a tradução embaixo. A ordem e o "esconder o
     original" das configurações da legenda continuam valendo; a cor da pessoa vai no nome. */
  return (
    <div className={`${fontClass} ${estilo}`}>
      {inicio > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 6 }}>
          <button
            type="button"
            className="link"
            /* Abre uma página a mais A PARTIR do que já está montado (o degrau pode ter deixado
               mais que `limite`), para o clique sempre revelar falas novas. */
            onClick={() => setLimite((l) => Math.max(l, segments.length - inicio) + JANELA_DA_CONVERSA)}
          >
            <ChevronUp aria-hidden /> {t('Mostrar falas anteriores ({n})', { n: inicio })}
          </button>
        </div>
      )}
      {visiveis.map((segment) => (
        // A linha da fala que espera o tradutor: a porcentagem só chega a ela (as outras não mudam).
        <FalaDaConversa
          key={segment.id}
          segment={segment}
          speaker={speakerOf(segment.speakerId)}
          lang={langOf(segment)}
          esconderOriginal={!!tsSettings.hideOriginal}
          originalPrimeiro={tsSettings.displayOrder === 'original-first'}
          tamOriginal={sizeClasses.original}
          tamTraducao={sizeClasses.translated}
          selecionada={
            selecionadaMin && segment.words.some((w) => w.word.toLowerCase() === selecionadaMin) ? selecionadaMin : null
          }
          guardadas={segment.words.length ? addedWords : NENHUMA}
          aprendidas={aprendidas}
          conhecidas={conhecidas}
          aoExaminar={aoExaminar}
          aoOuvir={aoOuvir}
          aoRevelar={aoRevelar}
          pendente={segment.traducaoPendente && segment.translatedText === '…' ? rotuloPendente : undefined}
          aoTocar={aoTocar}
          acoes={falaEmFoco === segment.id ? acoesDaFala?.(segment, langOf(segment)) : undefined}
          aoMenu={aoMenu}
        />
      ))}
    </div>
  );
}

export default React.memo(ChatTranscript);
