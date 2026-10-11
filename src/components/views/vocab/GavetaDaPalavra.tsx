/**
 * A GAVETA DA PALAVRA — "a palavra aberta" do protótipo enxuto dos Cartões (`ctAbrirPalavra()`,
 * `cartoes.js:713-778`): `<dialog class="gaveta ct-gaveta">` que entra pela direita (no celular, folha
 * que sobe de baixo).
 *
 * É o que abre ao tocar numa palavra da lista de Palavras e no "Editar cartão" da Revisão. A ORDEM é a do
 * protótipo: ouvir e a FALA ORIGINAL lado a lado; a tradução; a CENA de onde a palavra veio, logo na
 * dobra (as outras frases ficam recolhidas); o aviso de palavra difícil; "Na sua memória" com a linha do
 * HISTÓRICO; e o pé com Editar, "…" e Revisar (suspender, praticar, jogar e excluir moram no "…").
 *
 * Tudo é do cartão REAL e das fontes que o app já consultava:
 *  - pronúncia pela voz do sistema, na velocidade escolhida (0,75× / 1×);
 *  - a fala original: o trecho gravado da sessão (`lib/revisao/falaOriginal`), só quando a sessão tem
 *    áudio; sem ele, a tela diz "Sem fala gravada";
 *  - tradução do cartão, ou a que o tradutor do app acabou de fazer (com o motor que a fez);
 *  - a cena e as outras frases: as ocorrências do cartão e a transcrição da sessão (`lib/revisao/cena`);
 *  - verbete do Wiktionary (`lookup`), com IPA e sentidos, e a fonte: continua aqui, depois da cena;
 *  - "Na sua memória": próxima revisão, estabilidade e dificuldade do FSRS e os acertos (`/memoria`).
 *
 * O HISTÓRICO diz o que `GET /api/vocab/:id/memoria` dá: quantas revisões e quantas foram acerto. A rota
 * não devolve a lista (data, nota, intervalo), então a linha não abre tabela nenhuma.
 */
import '../../../styles/cartoes.css';
import '../../../styles/questVocabulario.css';

import {
  AudioLines,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  Ellipsis,
  ExternalLink,
  Gamepad2,
  GraduationCap,
  History,
  type LucideIcon,
  Mic,
  Monitor,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Target,
  Trash2,
  TriangleAlert,
  Volume2,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { fetchMemoriaDoCartao, updateCard } from '../../../data/api';
import { cartaoDificil } from '../../../lib/conteudo/cartoes';
import { type DictionaryResult, forvoUrl, lookup, wiktionaryUrl } from '../../../lib/dictionary';
import { noHeadset } from '../../../lib/dispositivo/telaNovaDoQuest';
import { numero, t, tp } from '../../../lib/i18n';
import { baseLang, langLabelNaUI } from '../../../lib/languages';
import { classesDaPalavra } from '../../../lib/pelesDeCartao';
import { anima, polido, reduz } from '../../../lib/polimento/base';
import { sentir } from '../../../lib/polimento/sentidos';
import { lerOrigemDoCartao, type OrigemDoCartao } from '../../../lib/revisao/cena';
import { criarTocador, type Tocador } from '../../../lib/revisao/falaOriginal';
import { haVozPara } from '../../../lib/voz/haVoz';
import type { Recording, VocabCard, VocabWord } from '../../../types';
import { toast } from '../../Toast';
import { DialogoBase, IconeEmBloco } from '../../ui';
import { Segmentos } from './Dialogo';

const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Rótulos dos motores de tradução — o mesmo mapa do painel antigo, sem ids técnicos crus. */
const MOTORES: Record<string, string> = {
  'groq-llm': 'tradutor de IA no servidor',
  'server-llm-mt': 'tradutor de IA no servidor',
  mymemory: 'MyMemory, na web',
  'opus-mt-local': 'opus-mt, no seu computador',
  'bergamot-local': 'Bergamot, no seu computador',
  'chrome-translator': 'tradutor do navegador, no seu computador',
  // Degrau M1: dicionário respondeu o toque, sem MT (`lib/traducaoDePalavra.ts`).
  'dicionario-local': 'dicionário do app, no seu computador',
  wiktionary: 'Wikcionário',
};

/** "Motores" que são dicionários — a tradução é verbete, não saída de IA. */
const DE_DICIONARIO = new Set(['dicionario-local', 'wiktionary']);

const DIA = 86_400_000;
function proximaRevisao(c: VocabCard): string {
  if (!c.inDeck) return t('suspensa');
  if (c.fsrsState === 'New' && c.dueAtMs == null) return t('ainda não vista');
  const due = c.dueAtMs ?? null;
  if (due == null) return t('hoje');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.floor((due - hoje.getTime()) / DIA);
  if (dias <= 0) return t('hoje');
  if (dias === 1) return t('amanhã');
  return t('em {n} dias', { n: dias });
}
const virgula = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',');
const relogio = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

type ComErros = VocabCard & { lapses?: number | null };

/** O que se abre e se fecha na gaveta: o movimento é o do protótipo (`cartoes.js:752-758`). */
function mostrar(alvo: HTMLElement | null): void {
  if (!alvo || !polido() || reduz()) return;
  anima(
    alvo,
    [
      { opacity: 0, transform: 'translateY(-8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { d: 320 },
  );
  alvo.querySelectorAll(':scope > *').forEach((x, i) =>
    anima(
      x,
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { d: 300, atraso: 40 + Math.min(i, 8) * 35 },
    ),
  );
}

export default function GavetaDaPalavra({
  cartao,
  palavra,
  gravacoes = [],
  editando: editandoInicial = false,
  velocidade,
  aoTrocarVelocidade,
  aoFalar,
  aoFechar,
  aoMudar,
  aoExcluir,
  aoExercitar,
  aoRevisar,
  aoPraticar,
  aoAbrirSessao,
}: {
  cartao: VocabCard;
  /** A palavra como o analista a examinou (tradução nova e o motor que a fez). */
  palavra?: VocabWord | null;
  /** As sessões do app: o título, o tipo e o áudio da sessão de onde a palavra veio. */
  gravacoes?: Recording[];
  /** Abre já no modo de edição (o "Editar cartão" da Revisão). */
  editando?: boolean;
  velocidade: number;
  aoTrocarVelocidade: (v: number) => void;
  aoFalar: (palavra: string) => void;
  aoFechar: () => void;
  /** O cartão mudou no servidor (edição, suspensão): quem abriu atualiza a sua lista. */
  aoMudar: (c: VocabCard) => void;
  /** Segundo clique em Excluir: quem abriu tira o cartão e cuida do "Desfazer". */
  aoExcluir: (c: VocabCard) => void;
  aoExercitar: (c: VocabCard) => void;
  aoRevisar: (c: VocabCard) => void;
  /** "Praticar de outro jeito" só com esta palavra. Sem ele, a ação não aparece. */
  aoPraticar?: (c: VocabCard) => void;
  /** "Abrir a sessão" na cena. Sem ele, a ação não aparece. */
  aoAbrirSessao?: (sessionId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [editando, setEditando] = useState(editandoInicial);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [verbete, setVerbete] = useState<DictionaryResult | null>(null);
  const [memoria, setMemoria] = useState<{ revisoes: number; acertos: number } | null>(null);
  const [origem, setOrigem] = useState<OrigemDoCartao | null>(null);
  const [explicaIA, setExplicaIA] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [maisLugares, setMaisLugares] = useState(false);
  const [maisAcoes, setMaisAcoes] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [traducaoEditada, setTraducaoEditada] = useState(cartao.translation ?? '');
  const [ex, setEx] = useState(cartao.sentence ?? '');
  const [nv, setNv] = useState(cartao.cefrLevel ?? '');
  const lugares = useRef<HTMLDivElement>(null);
  const acoes = useRef<HTMLDivElement>(null);
  const tocador = useRef<Tocador | null>(null);

  const lang = baseLang(cartao.srcLang || palavra?.lang || '');
  /* NO META QUEST a gaveta é um painel no CENTRO (`questVocabulario.css`: nada desliza pela lateral), com
     o conteúdo em duas colunas. E a voz: o headset não tem voz própria, só a do site, em alguns idiomas;
     o botão de ouvir (e a velocidade dele) aparece quando há voz para o idioma DESTA palavra. */
  const temVoz = haVozPara(lang);
  const traducao = cartao.translation || palavra?.translation || '';
  const motor = !cartao.translation && palavra?.mtEngine ? MOTORES[palavra.mtEngine] : undefined;
  const doDicionario = !cartao.translation && DE_DICIONARIO.has(palavra?.mtEngine ?? '');

  /* A origem é lida com as sessões que a tela tem AGORA, sem refazer a leitura a cada render do pai. */
  const sessoes = useRef(gravacoes);
  sessoes.current = gravacoes;
  useEffect(() => {
    let vivo = true;
    setVerbete(null);
    setOrigem(null);
    if (lang) void lookup(cartao.word, lang).then((r) => vivo && setVerbete(r));
    void fetchMemoriaDoCartao(cartao.id).then((m) => vivo && setMemoria(m));
    void lerOrigemDoCartao(cartao, sessoes.current).then((o) => vivo && setOrigem(o));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartao.id, cartao.word, cartao.sentence, lang]);
  /* O áudio pedido para a fala original é devolvido ao fechar. */
  useEffect(
    () => () => {
      tocador.current?.soltar();
      tocador.current = null;
    },
    [],
  );

  const fechar = () => ref.current?.close();

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!traducaoEditada.trim()) return;
    setSalvando(true);
    try {
      const novo = await updateCard(cartao.id, {
        translation: traducaoEditada.trim(),
        sentence: ex,
        ...(nv !== (cartao.cefrLevel ?? '') ? { cefrLevel: nv || null } : {}),
      });
      aoMudar(novo);
      setEditando(false);
      toast.ok(t('Palavra atualizada'));
    } catch (err) {
      toast.error(t('Não deu para salvar a palavra.'), { detail: err });
    } finally {
      setSalvando(false);
    }
  };

  const suspender = async () => {
    try {
      const novo = await updateCard(cartao.id, { inDeck: !cartao.inDeck });
      aoMudar(novo);
      toast.ok(
        novo.inDeck
          ? t('“{palavra}” volta para a revisão', { palavra: cartao.word })
          : t('“{palavra}” suspensa: não aparece na revisão até você reativar', { palavra: cartao.word }),
      );
    } catch (err) {
      toast.error(t('Não deu para mudar a palavra.'), { detail: err });
    }
  };

  const excluir = () => {
    if (!confirmaExcluir) {
      setConfirmaExcluir(true);
      toast.warn(t('Clique de novo para excluir. O progresso de revisão desta palavra some.'));
      return;
    }
    aoExcluir(cartao);
    fechar();
  };

  const achado = verbete?.status === 'found' ? verbete.entry : null;
  const ipa = achado?.ipa ?? (cartao.phonetics || undefined);
  const nomeDoIdioma = lang ? langLabelNaUI(lang).toLowerCase() : '';
  const estabilidade = Number(cartao.fsrsStability ?? cartao.stability ?? 0);
  const dificuldade = Number(cartao.fsrsDifficulty ?? 0);
  const revisada = cartao.fsrsState !== 'New' && (memoria?.revisoes ?? 0) > 0;
  const estado = !cartao.inDeck
    ? t('Suspensa')
    : cartao.fsrsState === 'New'
      ? t('Nova')
      : cartao.fsrsState === 'Learning'
        ? t('Aprendendo')
        : t('Em revisão');
  const lapsos = (cartao as ComErros).lapses ?? 0;

  /* A CENA: a fala da sessão de onde a frase saiu; sem sessão, a frase do cartão com a procedência. */
  const cena = origem?.cena ?? null;
  const gravacao = cena ? gravacoes.find((g) => g.id === cena.sessionId) : undefined;
  const IconeDaOrigem: LucideIcon = cena
    ? gravacao?.type === 'video'
      ? Monitor
      : gravacao?.type === 'document'
        ? BookOpen
        : Mic
    : cartao.daAnki
      ? WalletCards
      : cartao.daTrilha
        ? GraduationCap
        : BookOpen;
  const fraseDaCena = cena?.frase || (cartao.sentence ?? '').trim();
  const deOnde = cena
    ? [cena.titulo || t('Sessão'), cena.quem].filter(Boolean).join(' · ')
    : cartao.daAnki
      ? t('Baralho do Anki · sem fala gravada')
      : cartao.daTrilha
        ? t('Trilha')
        : cartao.sourceSessionId
          ? t('Sessão')
          : t('Adicionada à mão');
  const outras = origem?.outrasFrases ?? [];
  const temFala = !!cena?.temAudio;

  const ouvirOriginal = () => {
    if (!cena) return;
    const tc = (tocador.current ??= criarTocador());
    setTocando(true);
    sentir('grava');
    void tc.original(cena, lang, velocidade).finally(() => setTocando(false));
  };

  return (
    <DialogoBase classe="gaveta ct-gaveta" rotuloId={idTitulo} aoFechar={aoFechar} refDialogo={ref}>
      <div className="dlg-cab">
        <IconeEmBloco icone={BookOpen} />
        <div style={{ minWidth: 0 }}>
          <span className="label-mono">
            {[cartao.cefrLevel || t('sem nível'), nomeDoIdioma, estado.toLowerCase()].filter(Boolean).join(' · ')}
          </span>
          <h2 id={idTitulo} style={{ fontSize: 26 }} lang={lang || undefined}>
            {cartao.word}
          </h2>
          {ipa && <p className="mut tn">{ipa}</p>}
        </div>
        <button type="button" className="x" aria-label={t('Fechar')} onClick={fechar}>
          <X aria-hidden />
        </button>
      </div>
      <div className="gav-corpo pilha-g">
        <div className="linha ct-ouvir" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline peq"
            data-precisa={temVoz ? undefined : 'voz'}
            onClick={() => aoFalar(cartao.word)}
          >
            <Volume2 aria-hidden /> {t('Ouvir')}
          </button>
          {temFala ? (
            <button
              type="button"
              className={`btn btn-outline peq ${tocando ? 'ct-tocando' : ''}`.trim()}
              data-testid="fala-original"
              onClick={ouvirOriginal}
            >
              <AudioLines aria-hidden />{' '}
              {cena?.quem ? t('Fala original · {quem}', { quem: cena.quem }) : t('Fala original')}
            </button>
          ) : (
            <span className="ct-sem-fala mut" data-testid="sem-fala">
              <AudioLines aria-hidden /> {t('Sem fala gravada')}
            </span>
          )}
          {temVoz && (
            <Segmentos
              atual={String(velocidade)}
              opcoes={[
                ['0.75', '0,75×'],
                ['1', '1×'],
              ]}
              aoTrocar={(v) => aoTrocarVelocidade(Number(v))}
              rotulo={t('Velocidade da pronúncia')}
            />
          )}
        </div>

        {editando ? (
          <form className="cartao p5 pilha" onSubmit={(e) => void salvarEdicao(e)}>
            <div>
              <label className="rot" htmlFor="pw-t">
                {t('Tradução')}
              </label>
              {/* No headset o campo não pega o foco sozinho: o teclado do sistema cobriria o painel ao abrir.
                  É limite do APARELHO: no computador com o mesmo desenho o campo pega o foco, como sempre. */}
              <input
                className="campo"
                id="pw-t"
                value={traducaoEditada}
                required
                onChange={(e) => setTraducaoEditada(e.target.value)}
                autoFocus={!noHeadset()}
              />
            </div>
            <div>
              <label className="rot" htmlFor="pw-ex">
                {t('Frase de exemplo')}
              </label>
              <textarea
                className="campo"
                id="pw-ex"
                rows={2}
                style={{ padding: '10px 14px' }}
                value={ex}
                onChange={(e) => setEx(e.target.value)}
              />
            </div>
            <div>
              <label className="rot" htmlFor="pw-n">
                {t('Nível')}
              </label>
              <select className="campo" id="pw-n" value={nv} onChange={(e) => setNv(e.target.value)}>
                {!cartao.cefrLevel && <option value="">{t('Sem nível')}</option>}
                {NIVEIS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="linha" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-solid peq" disabled={salvando || !traducaoEditada.trim()}>
                <Check aria-hidden /> {t('Salvar')}
              </button>
              <button type="button" className="btn btn-outline peq" onClick={() => setEditando(false)}>
                {t('Cancelar')}
              </button>
            </div>
          </form>
        ) : (
          <div className="ct-coluna">
            <section className="ct-traducao">
              <p className="ct-traducao-t">{traducao || <span className="mut">{t('sem tradução ainda')}</span>}</p>
              {traducao && (
                <span className="proveniencia">
                  <Sparkles aria-hidden />
                  {motor
                    ? `${doDicionario ? t('Do dicionário') : t('Gerado por IA')} · ${t(motor)}`
                    : t('Guardada no seu caderno')}{' '}
                  ·{' '}
                  <button
                    type="button"
                    className="link"
                    aria-expanded={explicaIA}
                    onClick={() => setExplicaIA((v) => !v)}
                  >
                    {t('o que isso significa')}
                  </button>
                </span>
              )}
              {explicaIA && (
                <p className="mut" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {doDicionario
                    ? t(
                        'Tradução curta de dicionário (Wikcionário e Wikidata), sem inteligência artificial. Ela dá o sentido mais comum; confira os outros no dicionário e corrija em Editar.',
                      )
                    : motor
                      ? t(
                          'Um modelo de tradução automática escreveu esta tradução. Ele acerta a maioria, mas pode errar o sentido: confira no dicionário e corrija em Editar.',
                        )
                      : t(
                          'É a tradução que ficou gravada no cartão quando a palavra entrou no caderno. Se estiver errada, corrija em Editar.',
                        )}
                </p>
              )}
            </section>
            {fraseDaCena && (
              <section className="ct-de-onde" data-testid="de-onde-veio">
                <span className="label-mono">
                  {outras.length
                    ? t('De onde veio · {n} lugares', { n: outras.length + 1 })
                    : t('De onde veio')}
                </span>
                <div className="ct-cena primeira">
                  <span className="ct-cena-quadro" aria-hidden="true">
                    <IconeDaOrigem />
                    {cena?.inicioMs != null && <small>{relogio(cena.inicioMs)}</small>}
                  </span>
                  <div className="ct-cena-texto">
                    <blockquote lang={lang || undefined}>“{fraseDaCena}”</blockquote>
                    {cena?.traducao && <p className="mut">{cena.traducao}</p>}
                    <small className="mut">{deOnde}</small>
                  </div>
                  {cena && aoAbrirSessao && (
                    <span className="ct-cena-acoes">
                      <button
                        type="button"
                        className="btn btn-outline peq"
                        onClick={() => {
                          fechar();
                          aoAbrirSessao(cena.sessionId);
                        }}
                      >
                        <ExternalLink aria-hidden /> {t('Abrir a sessão')}
                      </button>
                    </span>
                  )}
                </div>
                {outras.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="ct-expande"
                      aria-expanded={maisLugares}
                      onClick={() => {
                        sentir('aba');
                        setMaisLugares((v) => !v);
                        if (!maisLugares) requestAnimationFrame(() => mostrar(lugares.current));
                      }}
                    >
                      <ChevronDown aria-hidden />
                      <span>
                        {tp(outras.length, 'Mais {n} lugar onde apareceu', 'Mais {n} lugares onde apareceu')}
                      </span>
                    </button>
                    <div className="ct-recolhido" hidden={!maisLugares} ref={lugares}>
                      {outras.map((o, i) => (
                        <div key={i} className="ct-cena">
                          <span className="ct-cena-quadro" aria-hidden="true">
                            <BookOpen />
                          </span>
                          <div className="ct-cena-texto">
                            <blockquote lang={lang || undefined}>“{o.frase}”</blockquote>
                            {o.titulo && <small className="mut">{o.titulo}</small>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
            {cartaoDificil(cartao as ComErros) && (
              <section className="ct-aviso-dificil">
                <span className="label-mono">
                  <TriangleAlert aria-hidden /> {t('Palavra difícil · errada {n} vezes', { n: lapsos })}
                </span>
                <p className="mut">
                  {t('Costuma ser o cartão, não você: edite a tradução, troque a frase ou suspenda por um tempo.')}
                </p>
              </section>
            )}
            <section>
              <span className="label-mono">{t('Dicionário')}</span>
              <ol className="sentidos">
                {!verbete && lang ? (
                  <li className="mut">{t('consultando o verbete…')}</li>
                ) : achado && achado.senses.length ? (
                  achado.senses.slice(0, 4).map((s, i) => (
                    <li key={i}>
                      {s.partOfSpeech && <i className="mut">{s.partOfSpeech}</i>} {s.definition}
                    </li>
                  ))
                ) : (
                  <li>{t('sem verbete ainda')}</li>
                )}
              </ol>
              <span className="proveniencia">
                <BookMarked aria-hidden /> {t('Fonte')} · {achado ? `Wiktionary, ${achado.source.wiki}` : 'Wiktionary'} (CC
                BY-SA)
                {lang && (
                  <>
                    {' · '}
                    <a className="link" href={wiktionaryUrl(cartao.word, lang)} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> Wiktionary
                    </a>{' '}
                    <a className="link" href={forvoUrl(cartao.word, lang)} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> Forvo
                    </a>
                  </>
                )}
              </span>
            </section>
          </div>
        )}

        {/* A PELE DE CARTÃO (spec 5.2.4): o bloco que diz o estado da palavra na memória veste a
            pele equipada nesse estado (nova · aprendida · dominada), como o cartão do Estudar. */}
        <section className={`cartao p5 sutil ${classesDaPalavra(cartao)}`}>
          <span className="label-mono">
            {t('Na sua memória')} · {estado}
          </span>
          <div className="memoria-g">
            {[
              [t('Próxima revisão'), proximaRevisao(cartao)],
              [t('Estabilidade'), revisada && estabilidade > 0 ? t('{n} dias', { n: virgula(estabilidade) }) : '—'],
              [t('Dificuldade'), revisada && dificuldade > 0 ? t('{n} de 10', { n: virgula(dificuldade) }) : '—'],
              [t('Acertos'), memoria ? t('{n} de {total}', { n: memoria.acertos, total: memoria.revisoes }) : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <small className="mut">{k}</small>
                <b className="tn">{v}</b>
              </div>
            ))}
          </div>
          {/* A linha do Histórico (`cartoes.js:743`): o que a rota conta. Não abre: não há lista para mostrar. */}
          <p className="ct-expande ct-historico" data-testid="historico-da-palavra">
            <History aria-hidden />
            <span>
              <b>{t('Histórico')}</b>
              <small>
                {!memoria
                  ? '—'
                  : memoria.revisoes > 0
                    ? `${tp(memoria.revisoes, '{n} revisão', '{n} revisões', { n: numero(memoria.revisoes) })} · ${tp(
                        memoria.acertos,
                        '{n} lembrada',
                        '{n} lembradas',
                        { n: numero(memoria.acertos) },
                      )}`
                    : t('Ainda sem revisões')}
              </small>
            </span>
          </p>
          <p className="mut ct-hist-nota">{t('Agenda do FSRS, com a meta de retenção dos Ajustes da memória.')}</p>
        </section>
      </div>
      <div className="ct-mais-da-palavra" hidden={!maisAcoes} ref={acoes}>
        <button type="button" className="btn btn-outline peq" onClick={() => void suspender()}>
          {cartao.inDeck ? <Pause aria-hidden /> : <Play aria-hidden />} {cartao.inDeck ? t('Suspender') : t('Reativar')}
        </button>
        {aoPraticar && (
          <button
            type="button"
            className="btn btn-outline peq"
            onClick={() => {
              fechar();
              aoPraticar(cartao);
            }}
          >
            <Sparkles aria-hidden /> {t('Praticar de outro jeito')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline peq"
          onClick={() => {
            fechar();
            aoExercitar(cartao);
          }}
        >
          <Gamepad2 aria-hidden /> {t('Exercitar')}
        </button>
        <button
          type="button"
          className={`btn btn-outline peq perigo ${confirmaExcluir ? 'perigo-solid' : ''}`}
          onClick={excluir}
        >
          <Trash2 aria-hidden /> {confirmaExcluir ? t('Confirmar exclusão') : t('Excluir')}
        </button>
      </div>
      <div className="gav-pe ct-pe-da-palavra">
        <button type="button" className="btn btn-outline" onClick={() => setEditando((v) => !v)}>
          <Pencil aria-hidden /> {t('Editar')}
        </button>
        <button
          type="button"
          className="btn btn-outline ct-so-icone"
          aria-expanded={maisAcoes}
          aria-label={t('Mais ações: suspender, praticar, exercitar, excluir')}
          title={t('Suspender, praticar, exercitar, excluir')}
          onClick={() => {
            sentir('aba');
            setMaisAcoes((v) => !v);
            if (!maisAcoes) requestAnimationFrame(() => mostrar(acoes.current));
          }}
        >
          <Ellipsis aria-hidden />
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-solid"
          onClick={() => {
            fechar();
            aoRevisar(cartao);
          }}
        >
          <Target aria-hidden /> {t('Revisar')}
        </button>
      </div>
    </DialogoBase>
  );
}
