import {
  BookOpen,
  Check,
  ExternalLink,
  ImageOff,
  Loader2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Target,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type DictionaryResult, forvoUrl, lookup, wiktionaryUrl } from '../lib/dictionary';
import { idiomaDaInterface, t } from '../lib/i18n';
import { baseLang, langLabel, langLabelNaUI } from '../lib/languages';
import type { AppLayoutConfig } from '../lib/layoutStore';
import type { ExerciseId } from '../lib/sentences';
import type { VocabWord } from '../types';
import EditablePanel from './EditablePanel';
import Provenance from './Provenance';
import { Dialogo } from './ui';

/** Rótulos amigáveis dos motores de tradução — o usuário não deve ler ids técnicos crus. */
const MT_ENGINE_LABELS: Record<string, string> = {
  // As duas chaves de propósito: sessões antigas gravaram 'groq-llm'; as novas gravam o id neutro.
  'groq-llm': 'Tradutor IA (servidor)',
  'server-llm-mt': 'Tradutor IA (servidor)',
  mymemory: 'MyMemory (web)',
  'opus-mt-local': 'Tradutor local (opus-mt)',
  // O pt→en do tradutor local (A9b): o Bergamot traduz no aparelho, como o opus-mt.
  'bergamot-local': 'Tradutor local (Bergamot)',
  'chrome-translator': 'Tradutor do navegador',
  // Degrau M1: palavra solta respondida por dicionário, sem MT (`lib/traducaoDePalavra.ts`).
  'dicionario-local': 'Dicionário do app',
  wiktionary: 'Wikcionário',
};

/** Estes "motores" são dicionários: a tradução é um verbete, não uma saída de máquina. */
const DE_DICIONARIO = new Set(['dicionario-local', 'wiktionary']);

/**
 * ANALISTA DE VOCABULÁRIO — painel ÚNICO e padronizado, usado por TODAS as telas
 * (Captura, Análise, Leitura, Estudo, Métricas).
 *
 * Antes este JSX era duplicado inline em cada view, mostrando conteúdos DIFERENTES (a versão do
 * Analysis era mock hardcoded). Agora existe uma implementação só: mesma informação, mesmo layout,
 * em qualquer tela.
 *
 * VISIBILIDADE: o painel é OCULTO por padrão e só monta quando há uma palavra selecionada
 * (`word != null`) — é o clique numa palavra que o abre, e o "X" que o fecha. Isso é feito por
 * montagem condicional, NÃO mexendo no `show` persistido do layout: o toggle do LayoutStudio
 * continua significando "este painel está habilitado nesta tela".
 *
 * HONESTIDADE: `cefr`, `phonetics`, `explanation` e `example` são opcionais — cada seção só é
 * renderizada quando a fonte real forneceu o dado. Nada é preenchido com valor fabricado.
 *
 * ANCORAGEM NO VIEWPORT (o painel SEGUE a tela, não a rolagem):
 * antes o painel era uma coluna que rolava junto com a página — o usuário rolava até o fim de uma
 * transcrição longa, clicava numa palavra lá embaixo e a análise abria fora do campo de visão
 * (no topo, ou empilhada em algum lugar). Agora:
 *   • ≥ lg  → coluna lateral `sticky top-0` com altura de viewport: role onde rolar, ela fica ao lado.
 *   • < lg  → folha inferior FIXA (`fixed inset-x-0 bottom-0`, até 70dvh), surge por cima do ponto
 *             de clique. Em ambos os modos o conteúdo rola DENTRO do painel, nunca a página.
 */
export interface VocabularyPanelProps {
  /** Tela onde o painel vive. Restrito às chaves reais do layoutStore (capture | analysis |
   *  reading | study | metrics) — cada uma precisa ter `vocabAnalyst` registrado lá. */
  viewKey: keyof AppLayoutConfig;
  /** Palavra em análise. `null` = painel não monta (estado padrão). */
  word: VocabWord | null;
  /** Fecha o painel (o "X"). */
  onClose: () => void;
  /** Pronuncia a palavra (TTS). */
  onSpeak: (word: string) => void;
  /** Adiciona ao deck SRS (FSRS). */
  onAddToDeck: (word: VocabWord) => void;
  /** A palavra já está no deck? Troca o CTA pelo estado de confirmação. */
  isAdded: boolean;
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;
  /**
   * Manda praticar esta palavra num exercício. Opcional: telas sem navegação (ou onde praticar não
   * faz sentido) simplesmente não passam.
   *
   * Antes o painel só sabia "adicionar ao deck" — e o usuário ficava torcendo para reencontrar a
   * palavra numa revisão futura. Agora dá para ir direto ao exercício.
   */
  onPractice?: (word: VocabWord, exercise: ExerciseId) => void;
  /**
   * POR QUE não há tradução (ex.: "não há motor de tradução para este par de idiomas", "o MT
   * falhou"). Sem isto o painel ficava em "traduzindo…" PARA SEMPRE quando o MT falhava ou o par não
   * tinha motor — indistinguível de lentidão. `undefined`/`null` = ainda traduzindo (ou já traduziu).
   */
  mtNote?: string | null;
  /**
   * A FOLHA DA PALAVRA (o desenho do headset): o mesmo conteúdo num diálogo no centro, com alvos de
   * 56 px, no lugar da coluna lateral e do cartão que abria por hover. Quem a usa passa também o que
   * o cartão de hover mostrava (`imagem`) e diz se há voz para o idioma (`podeOuvir`).
   */
  emFolha?: boolean;
  /** Só na folha: a imagem associada (o que o hover mostrava). Ausente = esta tela não busca imagem. */
  imagem?: { url: string | null; carregando: boolean };
  /** Só na folha: há voz de leitura para o idioma da palavra? `false` troca o "Ouvir" pelo motivo. */
  podeOuvir?: boolean;
  /** Só na folha: as velocidades do áudio (a Análise oferece 0,5× e 1×; a Leitura, 0,75× e 1×). */
  velocidades?: readonly number[];
  /** Só na folha: o nível CEFR do cartão, quando a palavra já está no caderno. */
  nivel?: string;
}

const VELOCIDADES_PADRAO: readonly number[] = [0.75, 1];

export default function VocabularyPanel({
  viewKey,
  word,
  onClose,
  onSpeak,
  onAddToDeck,
  isAdded,
  ttsSpeed,
  setTtsSpeed,
  onPractice,
  mtNote,
  emFolha = false,
  imagem,
  podeOuvir = true,
  velocidades = VELOCIDADES_PADRAO,
  nivel,
}: VocabularyPanelProps) {
  /**
   * VERBETE REAL (Wiktionary). Três estados distintos — e a UI diz qual é:
   * carregando · encontrado · não encontrado/erro. "Não achamos" é uma resposta legítima;
   * preencher fonética no chute não é.
   */
  const [entry, setEntry] = useState<DictionaryResult | null>(null);
  const term = word?.word;
  const lang = word?.lang;

  /* A CADA PALAVRA NOVA, O CABEÇALHO À VISTA. Clicar numa palavra no pé da transcrição abria o
     painel com a rolagem interna onde estava (no "Velocidade" ou no dicionário da palavra
     anterior) e, na coluna lateral, com o topo fora do viewport — a pessoa via detalhes sem o
     título nem a imagem (relato do dono, 2026-08-28). */
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el || !term) return;
    el.scrollTop = 0;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [term]);

  useEffect(() => {
    if (!term || !lang) {
      setEntry(null);
      return;
    }
    let alive = true;
    setEntry(null); // limpa o verbete da palavra anterior, nunca mostrar dado de outra palavra
    void lookup(term, lang).then((r) => {
      if (alive) setEntry(r);
    });
    return () => {
      alive = false;
    };
  }, [term, lang]);

  // Sem palavra selecionada → o painel simplesmente não existe (nada de empty-state ocupando espaço).
  if (!word) return null;

  const found = entry?.status === 'found' ? entry.entry : null;
  // A fonética do verbete tem procedência; a de `word.phonetics` (quando existe) vem do card salvo.
  const ipa = found?.ipa ?? word.phonetics;

  if (emFolha) {
    const deDicionario = DE_DICIONARIO.has(word.mtEngine ?? '');
    const cefr = nivel ?? word.cefr;
    return (
      <Dialogo
        icone={BookOpen}
        titulo={word.word}
        sub={[word.lang ? langLabel(word.lang) : '', cefr, ipa].filter(Boolean).join(' · ') || undefined}
        aoFechar={onClose}
      >
        <div className="dlg-corpo qs-miolo qp" data-testid="folha-da-palavra">
          {imagem && (
            <div className="qp-imagem">
              {imagem.url ? (
                <img src={imagem.url} alt={word.word} referrerPolicy="no-referrer" />
              ) : imagem.carregando ? (
                <span role="status">
                  <Loader2 className="animate-spin" aria-hidden /> {t('Buscando imagem…')}
                </span>
              ) : (
                <span>
                  <ImageOff aria-hidden /> {t('Sem imagem')}
                </span>
              )}
            </div>
          )}
          <div className="qp-texto">
            <section className="qp-bloco">
              <span className="q-rotulo">{deDicionario ? t('Tradução do dicionário') : t('Tradução automática')}</span>
              {word.translation ? (
                <p className="qp-traducao">{word.translation}</p>
              ) : mtNote ? (
                <p className="qp-nota">{mtNote}</p>
              ) : (
                <p className="qp-espera" role="status">
                  <Loader2 className="animate-spin" aria-hidden /> {t('traduzindo…')}
                </p>
              )}
              {word.translation && (
                <Provenance
                  className="qp-procedencia"
                  kind={deDicionario ? 'source' : 'computed'}
                  origin={t(MT_ENGINE_LABELS[word.mtEngine ?? ''] ?? word.mtEngine ?? 'guardada no seu caderno')}
                  method={deDicionario ? t('glosa de dicionário') : t('tradução automática')}
                  limits={
                    deDicionario
                      ? t(
                          'Tradução curta de dicionário (Wikcionário e Wikidata), sem inteligência artificial. Ela dá o sentido mais comum da palavra; para os outros sentidos, use o verbete abaixo.',
                        )
                      : t(
                          'Tradução de máquina, palavra fora de contexto. Ela erra em gírias, termos técnicos e palavras com vários sentidos. Para a acepção exata, use o verbete abaixo.',
                        )
                  }
                />
              )}
            </section>

            {(ipa || found) && (
              <section className="qp-bloco" data-testid="fonetica-da-palavra">
                <span className="q-rotulo">{t('Fonética')}</span>
                {ipa ? (
                  <div className="q-acoes">
                    <span className="qp-ipa">{ipa}</span>
                    {found?.ipaSource && (
                      <a className="q-chip" href={found.ipaSource.url} target="_blank" rel="noopener noreferrer">
                        {t('Fonética do {wiki}', { wiki: found.ipaSource.wiki })} <ExternalLink aria-hidden />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="qp-apoio">{t('O verbete não traz transcrição fonética.')}</p>
                )}
              </section>
            )}

            {podeOuvir ? (
              <div className="q-acoes">
                <button type="button" className="q-ctl" onClick={() => onSpeak(word.word)}>
                  <Volume2 aria-hidden /> {t('Ouvir')}
                </button>
                <div className="q-abas q-seg" role="group" aria-label={t('Velocidade do áudio')}>
                  {velocidades.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="q-aba"
                      aria-pressed={ttsSpeed === v}
                      onClick={() => setTtsSpeed(v)}
                    >
                      {String(v).replace('.', ',')}×
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="qp-nota" data-testid="palavra-sem-voz">
                {word.lang
                  ? t('Sem voz de leitura para {idioma} neste aparelho.', { idioma: langLabel(word.lang) })
                  : t('Sem voz de leitura para esta palavra neste aparelho.')}
              </p>
            )}

            <section className="qp-bloco">
              <span className="q-rotulo">{t('Dicionário')}</span>
              {!word.lang && (
                <p className="qp-apoio">
                  {t('Não sabemos em que idioma esta palavra está, então não há verbete para consultar.')}
                </p>
              )}
              {word.lang && !entry && (
                <p className="qp-espera" role="status">
                  <Loader2 className="animate-spin" aria-hidden /> {t('Consultando o Wiktionary…')}
                </p>
              )}
              {found && (
                <>
                  {found.glossLang !== baseLang(idiomaDaInterface()) && (
                    <p className="qp-nota">
                      {t('Não há verbete em {idioma} para esta palavra. A definição abaixo está escrita em {outro}.', {
                        idioma: langLabelNaUI(idiomaDaInterface()),
                        outro: langLabelNaUI(found.glossLang),
                      })}
                    </p>
                  )}
                  <ul className="qp-sentidos">
                    {found.senses.slice(0, 3).map((s, i) => (
                      <li key={i}>
                        {s.partOfSpeech && <span className="q-tag">{s.partOfSpeech}</span>}
                        <p>{s.definition}</p>
                        {s.examples[0] && <p className="qp-exemplo">“{s.examples[0]}”</p>}
                      </li>
                    ))}
                  </ul>
                  <Provenance
                    className="qp-procedencia"
                    kind="source"
                    origin={`${found.source.wiki} · ${found.source.license}`}
                    method={t('verbete em {idioma}, definido em {outro}', {
                      idioma: langLabel(found.lang),
                      outro: langLabel(found.glossLang),
                    })}
                    url={found.source.url}
                    limits={t(
                      'Conteúdo escrito e revisado pela comunidade do Wiktionary. É citável e você pode conferir no link, mas, como toda obra colaborativa, um verbete pode estar incompleto ou desatualizado.',
                    )}
                  />
                </>
              )}
              {entry?.status === 'not-found' && (
                <p className="qp-apoio">
                  {word.lang
                    ? t(
                        'O Wiktionary não tem verbete para esta palavra em {idioma}. Não vamos inventar uma definição.',
                        { idioma: langLabel(word.lang) },
                      )
                    : t(
                        'O Wiktionary não tem verbete para esta palavra neste idioma. Não vamos inventar uma definição.',
                      )}
                </p>
              )}
              {entry?.status === 'error' && <p className="qp-nota">{entry.message}</p>}
              {word.lang && (
                <div className="q-acoes">
                  <a
                    className="q-chip"
                    href={entry?.status === 'not-found' ? entry.sourceUrl : wiktionaryUrl(word.word)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wiktionary <ExternalLink aria-hidden />
                  </a>
                  <a className="q-chip" href={forvoUrl(word.word, word.lang)} target="_blank" rel="noopener noreferrer">
                    {t('Forvo (voz humana)')} <ExternalLink aria-hidden />
                  </a>
                </div>
              )}
            </section>

            {word.explanation && (
              <section className="qp-bloco">
                <span className="q-rotulo">{t('Explicação linguística')}</span>
                <p className="qp-apoio">{word.explanation}</p>
              </section>
            )}
            {word.example && (
              <section className="qp-bloco">
                <span className="q-rotulo">{t('Exemplo prático')}</span>
                <p className="qp-exemplo">“{word.example}”</p>
              </section>
            )}
          </div>
        </div>
        <div className="dlg-pe qp-pe">
          {isAdded ? (
            <span className="q-chip qp-no-deck" role="status">
              <Check aria-hidden /> {t('Já está no Deck')}
            </span>
          ) : (
            <button type="button" className="q-ctl pri" onClick={() => onAddToDeck(word)}>
              <Plus aria-hidden /> {t('Adicionar ao Deck')}
            </button>
          )}
          {onPractice && (
            <>
              <button type="button" className="q-ctl" onClick={() => onPractice(word, 'review')}>
                <Target aria-hidden /> {t('Revisar agora')}
              </button>
              <button type="button" className="q-ctl" onClick={() => onPractice(word, 'blitz')}>
                <Zap aria-hidden /> {t('Duelo com esta palavra')}
              </button>
              <small className="qp-o-que-fazem">
                {t(
                  '"Revisar agora" adiciona a palavra ao deck, se preciso, e abre a revisão. O Duelo abre o Duelo relâmpago começando por ela.',
                )}
              </small>
            </>
          )}
        </div>
      </Dialogo>
    );
  }

  return (
    <EditablePanel
      viewKey={viewKey}
      panelKey="vocabAnalyst"
      title="Analista de Vocabulário"
      canResizeWidth={true}
      canResizeHeight={false}
      resizeHandlePosition="left"
      defaultWidth={35}
      defaultHeight={0}
      className={[
        // Estrutura comum aos dois modos.
        'flex flex-col shrink-0 border-border-subtle',

        // < lg — FOLHA INFERIOR fixa ao viewport. Sai do fluxo (não empilha mais no topo/rodapé
        // da página) e aparece imediatamente sobre o conteúdo, onde quer que o usuário esteja.
        // `z-40` fica abaixo dos modais (z-50) e acima do conteúdo das telas.
        'fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] border-t shadow-2xl',

        // ≥ lg — COLUNA LATERAL grudada no viewport. `sticky top-0` + teto de 1 viewport:
        // `h-full` continua valendo nas telas cuja linha já tem altura de viewport
        // (Captura/Leitura/Estudo/Métricas), e `max-h-dvh` é o que segura o caso da Análise,
        // onde a linha cresce com o conteúdo e a rolagem é da tela inteira.
        'lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-0 lg:z-auto',
        'lg:h-full lg:max-h-dvh lg:border-t-0 lg:border-s lg:shadow-none',

        // Entrada (classes preservadas como estavam).
        'animate-in slide-in-from-right duration-300',
      ].join(' ')}
      // O wrapper aplica `relative` por padrão; aqui a posição é o ponto do conserto, então ela
      // vem do consumidor. (Como `.relative` é emitido DEPOIS de `.fixed` no Tailwind, deixar o
      // default no lugar faria o `fixed` da folha inferior simplesmente não valer.)
      positionClass="fixed lg:sticky"
    >
      {/* `min-h-0` é o que permite a área de conteúdo encolher e ROLAR dentro do teto
          (70dvh na folha inferior, 1 viewport na coluna) em vez de estourar e ser cortada. */}
      <div className="flex-1 min-h-0 flex flex-col h-full bg-surface overflow-hidden rounded-t-2xl lg:rounded-none">
        {/* Cabeçalho: título + selo CEFR (se houver) + fechar */}
        <div className="bg-canvas border-b border-border-subtle px-5 py-3.5 flex shrink-0 justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider font-display text-ink flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-accent" /> Analista de Vocabulário
          </span>
          <div className="flex items-center gap-2">
            {word.cefr && (
              <span className="text-[10px] bg-accent-soft text-accent-ink border border-accent/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                {word.cefr}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-surface-hover rounded transition-colors text-ink-muted hover:text-ink cursor-pointer"
              title="Fechar Analista"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={rolagemRef}
          className="flex-1 min-h-0 p-5 overflow-y-auto custom-scrollbar space-y-4 bg-surface flex flex-col"
        >
          <span className="text-[10px] font-mono text-ink-muted font-bold uppercase tracking-wider">
            Análise Linguística de Termos
          </span>

          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3 shadow-sm">
              {/* Palavra + fonética + ouvir */}
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h4 className="font-display font-black text-2xl text-ink tracking-tight break-words">
                    "{word.word}"
                  </h4>
                  {/* Fonética REAL do verbete. Fonte própria: na prática só o Wiktionary inglês publica
                      IPA em marcação legível, então uma definição em português costuma vir com um IPA
                      vindo do wiki inglês, e o link diz exatamente de onde. */}
                  {ipa && (
                    <span className="font-mono text-[11px] text-ink-muted mt-0.5 flex items-center gap-1.5">
                      {ipa}
                      {found?.ipaSource && (
                        <a
                          href={found.ipaSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Fonética do ${found.ipaSource.wiki}`}
                          className="text-ink-faint hover:text-accent-ink"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </span>
                  )}
                  {/* Sem fonética não fingimos que há: dizemos, e apontamos o Forvo (voz humana). */}
                  {found && !ipa && (
                    <span className="text-[10.5px] text-ink-faint mt-0.5 block">
                      O verbete não traz transcrição fonética.
                    </span>
                  )}
                  {word.lang && <span className="label-mono block mt-1">{langLabel(word.lang)}</span>}
                </div>
                <button
                  onClick={() => onSpeak(word.word)}
                  className="p-2 rounded-lg bg-surface border border-border-subtle text-accent hover:text-accent-ink transition-all hover:scale-105 cursor-pointer shrink-0 ms-2"
                  title="Ouça a pronúncia nativa"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Velocidade do TTS */}
              <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted bg-surface/80 border border-border-subtle p-2 rounded-lg">
                <span>Velocidade Áudio:</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTtsSpeed(0.75)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${ttsSpeed === 0.75 ? 'bg-accent text-white font-bold' : 'hover:bg-canvas'}`}
                  >
                    0.75x
                  </button>
                  <button
                    onClick={() => setTtsSpeed(1.0)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer ${ttsSpeed === 1.0 ? 'bg-accent text-white font-bold' : 'hover:bg-canvas'}`}
                  >
                    1.0x
                  </button>
                </div>
              </div>

              {/* TRADUÇÃO — agora dizendo QUEM a fez. O gateway sempre devolveu `MtResult.engine`
                  e o cliente sempre descartou: a app exibia uma tradução automática com a mesma
                  autoridade de um dicionário. Não é a mesma coisa, e agora está escrito. */}
              <div className="border-t border-border-subtle pt-2 space-y-1.5">
                <span className="label-mono block">
                  {DE_DICIONARIO.has(word.mtEngine ?? '') ? t('Tradução do dicionário') : 'Tradução automática'}
                </span>
                {/* Sem tradução: dizemos o MOTIVO (par sem motor, falha do MT) em vez de deixar
                    "traduzindo…" eterno, e jamais preenchemos com um texto inventado. */}
                {word.translation ? (
                  <p className="text-[14px] font-bold text-accent-ink leading-tight">{word.translation}</p>
                ) : mtNote ? (
                  <p className="text-[11.5px] text-warn-ink leading-relaxed">{mtNote}</p>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> traduzindo…
                  </p>
                )}
                {word.translation && DE_DICIONARIO.has(word.mtEngine ?? '') && (
                  <Provenance
                    kind="source"
                    origin={t(MT_ENGINE_LABELS[word.mtEngine ?? ''])}
                    method={t('glosa de dicionário')}
                    limits={t(
                      'Tradução curta de dicionário (Wikcionário e Wikidata), sem inteligência artificial. Ela dá o sentido mais comum da palavra; para os outros sentidos, use o verbete abaixo.',
                    )}
                  />
                )}
                {word.translation && !DE_DICIONARIO.has(word.mtEngine ?? '') && (
                  <Provenance
                    kind="computed"
                    origin={t(MT_ENGINE_LABELS[word.mtEngine ?? ''] ?? word.mtEngine ?? 'guardada no seu caderno')}
                    method="tradução automática"
                    limits="Tradução de máquina, palavra fora de contexto. Ela erra em gírias, termos técnicos e palavras com vários sentidos. Para a acepção exata, use o verbete abaixo."
                  />
                )}
              </div>

              {/* VERBETE REAL — o único conteúdo aqui que é dicionário de verdade. */}
              <div className="border-t border-border-subtle pt-2 space-y-2">
                <span className="label-mono block">Dicionário</span>

                {!word.lang && (
                  <p className="text-[11.5px] text-ink-muted leading-relaxed">
                    Não sabemos em que idioma esta palavra está, então não há verbete para consultar.
                  </p>
                )}

                {word.lang && !entry && (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> Consultando o Wiktionary…
                  </p>
                )}

                {found && (
                  <>
                    {/* A definicao NAO esta no idioma de quem le. O painel consulta primeiro o
                        Wikcionario do idioma da INTERFACE; quando nao ha verbete la, dizemos em que
                        lingua o verbete esta. Isto comparava com `'pt'` cravado, entao quem lia a
                        tela em ingles recebia um aviso de que a definicao "nao esta em portugues"
                        sobre um verbete que estava, sim, no idioma dele (achado A39). */}
                    {found.glossLang !== baseLang(idiomaDaInterface()) && (
                      <p className="text-[10.5px] text-warn-ink bg-warn-soft border border-warn/20 rounded-lg px-2.5 py-1.5 leading-relaxed">
                        {t(
                          'Não há verbete em {idioma} para esta palavra. A definição abaixo está escrita em {outro}.',
                          {
                            idioma: langLabelNaUI(idiomaDaInterface()),
                            outro: langLabelNaUI(found.glossLang),
                          },
                        )}
                      </p>
                    )}
                    <ul className="space-y-2">
                      {found.senses.slice(0, 3).map((s, i) => (
                        <li key={i} className="space-y-0.5">
                          {s.partOfSpeech && (
                            <span className="font-mono text-[9.5px] text-accent-ink uppercase font-bold">
                              {s.partOfSpeech}
                            </span>
                          )}
                          <p className="text-[11.5px] text-ink-muted leading-relaxed">{s.definition}</p>
                          {s.examples[0] && <p className="text-[11px] text-ink italic">"{s.examples[0]}"</p>}
                        </li>
                      ))}
                    </ul>
                    <Provenance
                      kind="source"
                      origin={`${found.source.wiki} · ${found.source.license}`}
                      method={`verbete em ${langLabel(found.lang)}, definido em ${langLabel(found.glossLang)}`}
                      url={found.source.url}
                      limits="Conteúdo escrito e revisado pela comunidade do Wiktionary. É citável e você pode conferir no link, mas, como toda obra colaborativa, um verbete pode estar incompleto ou desatualizado."
                    />
                  </>
                )}

                {entry?.status === 'not-found' && (
                  <p className="text-[11.5px] text-ink-muted leading-relaxed">
                    O Wiktionary não tem verbete para esta palavra em{' '}
                    {word.lang ? langLabel(word.lang) : 'neste idioma'}. Não vamos inventar uma definição.{' '}
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-bold text-accent-ink hover:underline"
                    >
                      conferir na fonte <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                )}

                {entry?.status === 'error' && (
                  <p className="text-[11.5px] text-warn-ink leading-relaxed">{entry.message}</p>
                )}

                {word.lang && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    <a
                      href={wiktionaryUrl(word.word)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-ink-muted hover:text-ink"
                    >
                      Wiktionary <ExternalLink className="w-3 h-3" />
                    </a>
                    {/* Pronúncia HUMANA. O TTS acima é síntese — útil, mas não é um falante nativo. */}
                    <a
                      href={forvoUrl(word.word, word.lang)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold text-ink-muted hover:text-ink"
                    >
                      Forvo (voz humana) <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {word.explanation && (
                <div className="border-t border-border-subtle pt-2">
                  <span className="label-mono block">Explicação Linguística</span>
                  <p className="text-[11.5px] text-ink-muted font-medium leading-relaxed mt-0.5">{word.explanation}</p>
                </div>
              )}

              {word.example && (
                <div className="border-t border-border-subtle pt-2">
                  <span className="label-mono block">Exemplo Prático</span>
                  <p className="text-[11.5px] text-ink italic mt-0.5">"{word.example}"</p>
                </div>
              )}
            </div>

            {/* Ações. O deck é o destino padrão; praticar agora é o atalho que evita "adicionar e torcer". */}
            <div className="space-y-2">
              {isAdded ? (
                <div className="py-2.5 px-4 rounded-xl bg-good-soft border border-good/30 text-good-ink font-bold text-xs flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4 stroke-[3]" /> No seu deck (SRS)
                </div>
              ) : (
                <button
                  onClick={() => onAddToDeck(word)}
                  className="w-full py-3 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-transform hover:scale-[1.01] shadow-btn cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Adicionar ao deck (SRS)
                </button>
              )}

              {onPractice && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onPractice(word, 'review')}
                    className="btn-outline py-2.5 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5"
                    title="Adiciona ao deck (se preciso) e abre a revisão agora"
                  >
                    <Zap className="w-3.5 h-3.5" /> Revisar agora
                  </button>
                  {/* Era o `vocab_drill`, que saiu junto com os legados. O substituto é o Duelo
                      relâmpago, a mesma mecânica de múltipla escolha rápida, só que com as
                      palavras REAIS do baralho e contando no progresso, o que o antigo não fazia
                      (`metrics.ts` só lê `kind: 'drill'`). A palavra escolhida entra na frente. */}
                  <button
                    onClick={() => onPractice(word, 'blitz')}
                    className="btn-outline py-2.5 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5"
                    title="Abre o Duelo relâmpago começando por esta palavra"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Exercitar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </EditablePanel>
  );
}
