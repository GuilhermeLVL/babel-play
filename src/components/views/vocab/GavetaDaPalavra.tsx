/**
 * A GAVETA DA PALAVRA — o "Analista de vocabulário" do protótipo aprovado (`dialogoPalavra()`, V3):
 * `<dialog class="gaveta">` que entra pela direita (no celular, folha que sobe de baixo).
 *
 * É o que abre ao clicar numa palavra do Vocabulário e no "Editar cartão" da Revisão. Tudo aqui é do
 * cartão REAL e das fontes reais que o app já consultava no painel antigo (`VocabularyPanel`):
 *  - pronúncia pela voz do sistema, na velocidade escolhida (0,75× / 1×);
 *  - tradução do cartão, ou a que o tradutor do app acabou de fazer (com o motor que a fez);
 *  - verbete do Wiktionary (`lookup`), com IPA e sentidos, e a fonte;
 *  - "Onde apareceu": a frase do encontro, a sessão e o tempo da fala (`/ocorrencias`);
 *  - "Na sua memória": próxima revisão, estabilidade e dificuldade do FSRS e os acertos
 *    (`/memoria`, contados em `review_logs`);
 *  - Editar (tradução, frase, nível), Suspender/Reativar e Excluir (dois cliques).
 */
import '../../../styles/cartoes.css';

import {
  BookMarked,
  BookOpen,
  Check,
  ExternalLink,
  FileAudio,
  FileText,
  Gamepad2,
  Pause,
  Pencil,
  Play,
  Sparkles,
  Target,
  Trash2,
  Volume2,
  X,
  Youtube,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  fetchMemoriaDoCartao,
  fetchOcorrencias,
  fetchSessionTranscript,
  type OcorrenciaDoCartao,
  updateCard,
} from '../../../data/api';
import { type DictionaryResult, forvoUrl, lookup, wiktionaryUrl } from '../../../lib/dictionary';
import { baseLang, langLabelNaUI } from '../../../lib/languages';
import { classesDaPalavra } from '../../../lib/pelesDeCartao';
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
  'chrome-translator': 'tradutor do navegador, no seu computador',
  // Degrau M1: dicionário respondeu o toque, sem MT (`lib/traducaoDePalavra.ts`).
  'dicionario-local': 'dicionário do app, no seu computador',
  wiktionary: 'Wikcionário',
};

/** "Motores" que são dicionários — a tradução é verbete, não saída de IA. */
const DE_DICIONARIO = new Set(['dicionario-local', 'wiktionary']);

const DIA = 86_400_000;
function proximaRevisao(c: VocabCard): string {
  if (!c.inDeck) return 'suspensa';
  const due = c.dueAtMs ?? null;
  if (due == null) return 'hoje';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.floor((due - hoje.getTime()) / DIA);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}
const virgula = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',');
const relogio = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

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
}: {
  cartao: VocabCard;
  /** A palavra como o analista a examinou (tradução nova e o motor que a fez). */
  palavra?: VocabWord | null;
  /** As sessões do app: o título e o tipo da sessão em "Onde apareceu". */
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
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [editando, setEditando] = useState(editandoInicial);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [verbete, setVerbete] = useState<DictionaryResult | null>(null);
  const [memoria, setMemoria] = useState<{ revisoes: number; acertos: number } | null>(null);
  const [encontro, setEncontro] = useState<{ o: OcorrenciaDoCartao; tempo: number | null } | null>(null);
  const [explicaIA, setExplicaIA] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [t, setT] = useState(cartao.translation ?? '');
  const [ex, setEx] = useState(cartao.sentence ?? '');
  const [nv, setNv] = useState(cartao.cefrLevel ?? '');

  const lang = baseLang(cartao.srcLang || palavra?.lang || '');
  const traducao = cartao.translation || palavra?.translation || '';
  const motor = !cartao.translation && palavra?.mtEngine ? MOTORES[palavra.mtEngine] : undefined;
  const doDicionario = !cartao.translation && DE_DICIONARIO.has(palavra?.mtEngine ?? '');

  useEffect(() => {
    let vivo = true;
    setVerbete(null);
    if (lang) void lookup(cartao.word, lang).then((r) => vivo && setVerbete(r));
    void fetchMemoriaDoCartao(cartao.id).then((m) => vivo && setMemoria(m));
    void fetchOcorrencias(cartao.id).then(async (lista) => {
      const o = lista.find((x) => (x.sentence ?? '').trim()) ?? null;
      if (!o) return vivo && setEncontro(null);
      let tempo: number | null = null;
      if (o.originKind === 'sessao' && o.originRef && o.utteranceId) {
        try {
          const tr = await fetchSessionTranscript(o.originRef);
          tempo = tr.utterances.find((u) => u.id === o.utteranceId)?.tStartMs ?? null;
        } catch {
          /* sem o tempo da fala, a frase continua valendo */
        }
      }
      if (vivo) setEncontro({ o, tempo });
    });
    return () => {
      vivo = false;
    };
  }, [cartao.id, cartao.word, lang]);

  const fechar = () => ref.current?.close();

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!t.trim()) return;
    setSalvando(true);
    try {
      const novo = await updateCard(cartao.id, {
        translation: t.trim(),
        sentence: ex,
        ...(nv !== (cartao.cefrLevel ?? '') ? { cefrLevel: nv || null } : {}),
      });
      aoMudar(novo);
      setEditando(false);
      toast.ok('Palavra atualizada');
    } catch (err) {
      toast.error('Não deu para salvar a palavra.', { detail: err });
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
          ? `“${cartao.word}” volta para a revisão`
          : `“${cartao.word}” suspensa: não aparece na revisão até você reativar`,
      );
    } catch (err) {
      toast.error('Não deu para mudar a palavra.', { detail: err });
    }
  };

  const excluir = () => {
    if (!confirmaExcluir) {
      setConfirmaExcluir(true);
      toast.warn('Clique de novo para excluir. O progresso de revisão desta palavra some.');
      return;
    }
    aoExcluir(cartao);
    fechar();
  };

  const achado = verbete?.status === 'found' ? verbete.entry : null;
  const ipa = achado?.ipa ?? (cartao.phonetics || undefined);
  const gravacao =
    encontro?.o.originKind === 'sessao' ? gravacoes.find((g) => g.id === encontro.o.originRef) : undefined;
  const IconeDaGravacao = gravacao?.type === 'video' ? Youtube : gravacao?.type === 'document' ? FileText : FileAudio;
  const nomeDoIdioma = lang ? langLabelNaUI(lang).toLowerCase() : '';
  const estabilidade = Number(cartao.fsrsStability ?? cartao.stability ?? 0);
  const dificuldade = Number(cartao.fsrsDifficulty ?? 0);
  const revisada = cartao.fsrsState !== 'New' && (memoria?.revisoes ?? 0) > 0;

  return (
    <DialogoBase classe="gaveta" rotuloId={idTitulo} aoFechar={aoFechar} refDialogo={ref}>
      <div className="dlg-cab">
        <IconeEmBloco icone={BookOpen} />
        <div style={{ minWidth: 0 }}>
          <span className="label-mono">
            Analista de vocabulário · {cartao.cefrLevel || 'sem nível'}
            {nomeDoIdioma && ` · ${nomeDoIdioma}`}
          </span>
          <h2 id={idTitulo} style={{ fontSize: 26 }}>
            {cartao.word}
          </h2>
          {ipa && <p className="mut tn">{ipa}</p>}
        </div>
        <button type="button" className="x" aria-label="Fechar" onClick={fechar}>
          <X aria-hidden />
        </button>
      </div>
      <div className="gav-corpo pilha-g">
        <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline peq" onClick={() => aoFalar(cartao.word)}>
            <Volume2 aria-hidden /> Ouvir
          </button>
          <Segmentos
            atual={String(velocidade)}
            opcoes={[
              ['0.75', '0,75×'],
              ['1', '1×'],
            ]}
            aoTrocar={(v) => aoTrocarVelocidade(Number(v))}
            rotulo="Velocidade da pronúncia"
          />
          {lang && (
            <>
              <a className="link" href={wiktionaryUrl(cartao.word, lang)} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Wiktionary
              </a>
              <a className="link" href={forvoUrl(cartao.word, lang)} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Forvo
              </a>
            </>
          )}
        </div>

        {editando ? (
          <form className="cartao p5 pilha" onSubmit={(e) => void salvarEdicao(e)}>
            <div>
              <label className="rot" htmlFor="pw-t">
                Tradução
              </label>
              <input className="campo" id="pw-t" value={t} required onChange={(e) => setT(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="rot" htmlFor="pw-ex">
                Frase de exemplo
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
                Nível
              </label>
              <select className="campo" id="pw-n" value={nv} onChange={(e) => setNv(e.target.value)}>
                {!cartao.cefrLevel && <option value="">Sem nível</option>}
                {NIVEIS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="linha" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-solid peq" disabled={salvando || !t.trim()}>
                <Check aria-hidden /> Salvar
              </button>
              <button type="button" className="btn btn-outline peq" onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            <section>
              <span className="label-mono">Tradução automática</span>
              <p style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
                {traducao || <span className="mut">sem tradução ainda</span>}
              </p>
              {traducao && (
                <span className="proveniencia">
                  <Sparkles aria-hidden />
                  {motor ? `${doDicionario ? 'Do dicionário' : 'Gerado por IA'} · ${motor}` : 'Guardada no seu caderno'} ·{' '}
                  <button
                    type="button"
                    className="link"
                    aria-expanded={explicaIA}
                    onClick={() => setExplicaIA((v) => !v)}
                  >
                    o que isso significa
                  </button>
                </span>
              )}
              {explicaIA && (
                <p className="mut" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {doDicionario
                    ? 'Tradução curta de dicionário (Wikcionário e Wikidata), sem inteligência artificial. Ela dá o sentido mais comum; confira os outros no dicionário e corrija em Editar.'
                    : motor
                    ? 'Um modelo de tradução automática escreveu esta tradução. Ele acerta a maioria, mas pode errar o sentido: confira no dicionário e corrija em Editar.'
                    : 'É a tradução que ficou gravada no cartão quando a palavra entrou no caderno. Se estiver errada, corrija em Editar.'}
                </p>
              )}
            </section>
            <section>
              <span className="label-mono">Dicionário</span>
              <ol className="sentidos">
                {!verbete && lang ? (
                  <li className="mut">consultando o verbete…</li>
                ) : achado && achado.senses.length ? (
                  achado.senses.slice(0, 4).map((s, i) => (
                    <li key={i}>
                      {s.partOfSpeech && <i className="mut">{s.partOfSpeech}</i>} {s.definition}
                    </li>
                  ))
                ) : (
                  <li>sem verbete ainda</li>
                )}
              </ol>
              <span className="proveniencia">
                <BookMarked aria-hidden /> Fonte · {achado ? `Wiktionary, ${achado.source.wiki}` : 'Wiktionary'} (CC
                BY-SA)
              </span>
            </section>
            {encontro && (
              <section>
                <span className="label-mono">Onde apareceu</span>
                <blockquote className="exemplo-gav">
                  “{encontro.o.sentence}”
                  <small className="mut">
                    {gravacao ? (
                      <>
                        <IconeDaGravacao aria-hidden /> {gravacao.title}
                        {encontro.tempo != null && ` · ${relogio(encontro.tempo)}`}
                      </>
                    ) : encontro.o.originKind === 'trilha' ? (
                      'Trilha'
                    ) : encontro.o.originKind === 'anki' ? (
                      'Baralho do Anki'
                    ) : (
                      'Adicionada à mão'
                    )}
                  </small>
                </blockquote>
              </section>
            )}
          </>
        )}

        {/* A PELE DE CARTÃO (spec 5.2.4): o bloco que diz o estado da palavra na memória veste a
            pele equipada nesse estado (nova · aprendida · dominada), como o cartão do Estudar. */}
        <section className={`cartao p5 sutil ${classesDaPalavra(cartao)}`}>
          <span className="label-mono">Na sua memória</span>
          <div className="memoria-g">
            {[
              ['Próxima revisão', proximaRevisao(cartao)],
              ['Estabilidade', revisada && estabilidade > 0 ? `${virgula(estabilidade)} dias` : '—'],
              ['Dificuldade', revisada && dificuldade > 0 ? `${virgula(dificuldade)} de 10` : '—'],
              ['Acertos', memoria ? `${memoria.acertos} de ${memoria.revisoes}` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <small className="mut">{k}</small>
                <b className="tn">{v}</b>
              </div>
            ))}
          </div>
          <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>
            Calculado pelo FSRS com meta de 90% de retenção.
          </p>
        </section>
      </div>
      <div className="gav-pe col-celular">
        <button type="button" className="btn btn-outline peq" onClick={() => setEditando((v) => !v)}>
          <Pencil aria-hidden /> Editar
        </button>
        <button type="button" className="btn btn-outline peq" onClick={() => void suspender()}>
          {cartao.inDeck ? <Pause aria-hidden /> : <Play aria-hidden />} {cartao.inDeck ? 'Suspender' : 'Reativar'}
        </button>
        <button
          type="button"
          className={`btn btn-outline peq perigo ${confirmaExcluir ? 'perigo-solid' : ''}`}
          onClick={excluir}
        >
          <Trash2 aria-hidden /> {confirmaExcluir ? 'Confirmar exclusão' : 'Excluir'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            fechar();
            aoExercitar(cartao);
          }}
        >
          <Gamepad2 aria-hidden /> Exercitar
        </button>
        <button
          type="button"
          className="btn btn-solid"
          onClick={() => {
            fechar();
            aoRevisar(cartao);
          }}
        >
          <Target aria-hidden /> Revisar
        </button>
      </div>
    </DialogoBase>
  );
}
