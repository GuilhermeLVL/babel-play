/**
 * AUDITORIA DE IDIOMA — a tela do reparo do passivo.
 *
 * Ela não decide nada: quem classifica é o `lib/langAudit.ts`. Aqui só mostramos o que ele encontrou e
 * pedimos a confirmação. Três invariantes que esta tela existe para respeitar:
 *
 *   • A varredura NÃO roda sozinha. O usuário aperta o botão.
 *   • Nada é gravado sem `askConfirm` — e o número que o toast comemora é o `changed` que a API
 *     devolveu, não o número de itens que pedimos.
 *   • Item 'sem-sinal' não recebe proposta nossa. Ele fica como está, e a tela DIZ que ficou.
 *
 * Dois modos, o MESMO fluxo: **Cartões** (vocabulário) e **Falas** (as transcrições). O classificador,
 * o render e as invariantes são idênticos; muda só a fonte dos dados, o endpoint de gravação e o texto
 * (e o gênero em pt-BR: cartão corrigido × fala corrigida). Depois de aplicar, re-auditamos: a lista
 * passa a refletir o banco, não o nosso otimismo.
 */
import { useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, HelpCircle, Loader2, ScanSearch } from 'lucide-react';
import { fetchAllUtterances, fetchDeck, relabelCards, relabelUtterances } from '../../data/api';
import { auditDeck, auditUtterances, targetFor, type AuditReport, type LangFinding } from '../../lib/langAudit';
import { fetchLangConfig, type LangConfig } from '../../lib/langConfig';
import { baseLang, knownShorts, langLabel } from '../../lib/languages';
import { askConfirm, toast } from '../Toast';

type Mode = 'cards' | 'utterances';

/** Um item pronto para a API: idioma escolhido + o alvo DERIVADO pela regra única do `langAudit`. */
interface Relabel {
  id: string;
  srcLang: string;
  tgtLang: string;
}

/**
 * Todo o texto que difere entre os dois modos, num só lugar. Os trechos com gênero/plural são funções
 * porque em pt-BR "cartão corrigido" e "fala corrigida" não compartilham a mesma forma.
 */
interface ModeCopy {
  tab: string;
  scanBtn: string;
  headerTitle: string;
  headerIntro: string;
  emptyMsg: string;
  analyzing: (n: number) => string;
  chip: { ok: string; fix: string; amb: string; none: string };
  proposedIntro: string;
  ambiguousIntro: string;
  noSignalIntro: string;
  okLine: (n: number) => string;
  applyIdle: string;
  willWrite: (n: number) => string;
  confirmTitle: (n: number) => string;
  confirmDetail: string;
  successToast: (n: number) => string;
  zeroChanged: string;
  ariaFix: (label: string) => string;
  emptyEvidence: string;
  errorScan: string;
}

const COPY: Record<Mode, ModeCopy> = {
  cards: {
    tab: 'Cartões',
    scanBtn: 'Analisar meus cartões',
    headerTitle: 'Conferir o idioma dos meus cartões',
    headerIntro:
      'Compara o idioma gravado em cada cartão com a frase de onde a palavra saiu, e mostra o que não bate.',
    emptyMsg: 'Você ainda não tem cartões no baralho — não há nada para auditar.',
    analyzing: (n) =>
      `Analisando ${n} ${n === 1 ? 'cartão' : 'cartões'}. A detecção roda um texto de cada vez — em baralhos grandes isso leva alguns segundos.`,
    chip: { ok: 'Certos', fix: 'A corrigir', amb: 'Ambíguos', none: 'Sem sinal' },
    proposedIntro: 'O texto do cartão contradiz o idioma gravado. Desmarque o que não quiser corrigir.',
    ambiguousIntro:
      'O sinal existe, mas é fraco demais para sobrescrever no automático. Marque só o que você reconhecer, e confirme o idioma.',
    noSignalIntro:
      'Não temos como saber o idioma destes cartões: ficam como estão. Não há proposta nossa aqui — se você souber, pode dizer no seletor; se não, deixe em branco.',
    okLine: (n) => `${n} ${n === 1 ? 'cartão já está certo' : 'cartões já estão certos'}`,
    applyIdle: 'Nenhum cartão marcado — nada será gravado.',
    willWrite: (n) => `${n} ${n === 1 ? 'cartão será reescrito' : 'cartões serão reescritos'} no banco.`,
    confirmTitle: (n) => `Gravar ${n} ${n === 1 ? 'correção' : 'correções'} no banco?`,
    confirmDetail:
      'Isto reescreve o idioma destes cartões no banco de dados, de forma permanente. Os cartões que você não marcou ficam exatamente como estão.',
    successToast: (n) => `${n} ${n === 1 ? 'cartão corrigido' : 'cartões corrigidos'}.`,
    zeroChanged: 'O servidor aceitou a chamada, mas não alterou nenhum cartão.',
    ariaFix: (label) => `Corrigir o cartão "${label}"`,
    emptyEvidence: 'Este cartão não guardou a frase de origem.',
    errorScan: 'Não foi possível auditar o baralho.',
  },
  utterances: {
    tab: 'Falas',
    scanBtn: 'Analisar minhas falas',
    headerTitle: 'Conferir o idioma das minhas falas',
    headerIntro:
      'Compara o idioma gravado em cada fala das suas transcrições com o texto dela, e mostra o que não bate.',
    emptyMsg: 'Você ainda não tem falas transcritas — não há nada para auditar.',
    analyzing: (n) =>
      `Analisando ${n} ${n === 1 ? 'fala' : 'falas'}. A detecção roda um texto de cada vez — pode levar alguns segundos.`,
    chip: { ok: 'Certas', fix: 'A corrigir', amb: 'Ambíguas', none: 'Sem sinal' },
    proposedIntro: 'O texto da fala contradiz o idioma gravado. Desmarque o que não quiser corrigir.',
    ambiguousIntro:
      'O sinal existe, mas é fraco demais para sobrescrever no automático. Marque só o que você reconhecer, e confirme o idioma.',
    noSignalIntro:
      'Não temos como saber o idioma destas falas: ficam como estão. Não há proposta nossa aqui — se você souber, pode dizer no seletor; se não, deixe em branco.',
    okLine: (n) => `${n} ${n === 1 ? 'fala já está certa' : 'falas já estão certas'}`,
    applyIdle: 'Nenhuma fala marcada — nada será gravado.',
    willWrite: (n) => `${n} ${n === 1 ? 'fala será reescrita' : 'falas serão reescritas'} no banco.`,
    confirmTitle: (n) => `Gravar ${n} ${n === 1 ? 'correção' : 'correções'} no banco?`,
    confirmDetail:
      'Isto reescreve o idioma destas falas no banco de dados, de forma permanente. As falas que você não marcou ficam como estão, e o texto transcrito e a tradução nunca são tocados.',
    successToast: (n) => `${n} ${n === 1 ? 'fala corrigida' : 'falas corrigidas'}.`,
    zeroChanged: 'O servidor aceitou a chamada, mas não alterou nenhuma fala.',
    ariaFix: (label) => `Corrigir a ${label}`,
    emptyEvidence: 'Esta fala não tem texto transcrito.',
    errorScan: 'Não foi possível auditar as falas.',
  },
};

const SHORTS = knownShorts();

function LangSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface border border-border-subtle rounded-lg px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent transition-colors"
    >
      <option value="">{placeholder}</option>
      {SHORTS.map((s) => (
        <option key={s} value={s}>
          {langLabel(s)}
        </option>
      ))}
    </select>
  );
}

/** Rótulo atual do item. `—` quando a coluna está nula: é informação ausente, não um idioma. */
function CurrentPair({ current }: { current: LangFinding['current'] }) {
  const src = current.srcLang ? langLabel(current.srcLang) : '—';
  const tgt = current.tgtLang ? langLabel(current.tgtLang) : '—';
  return (
    <span className="font-mono text-[11.5px] text-ink-muted">
      {src} → {tgt}
    </span>
  );
}

function Evidence({ finding, emptyMsg }: { finding: LangFinding; emptyMsg: string }) {
  return (
    <div className="min-w-0">
      <div className="font-bold text-[13.5px] text-ink">{finding.word}</div>
      {finding.sentence ? (
        <p className="text-[12px] text-ink-muted italic mt-0.5 break-words">“{finding.sentence}”</p>
      ) : (
        <p className="text-[12px] text-ink-faint mt-0.5">{emptyMsg}</p>
      )}
      {/* O `reason` vem escrito em pt-BR pelo `langAudit` — exibimos como está. */}
      <p className="text-[12px] text-ink-muted mt-1">{finding.reason}</p>
    </div>
  );
}

export default function LangAudit() {
  const [mode, setMode] = useState<Mode>('cards');
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [cfg, setCfg] = useState<LangConfig | null>(null);

  /** Itens marcados para correção (só 'confiante' e 'ambiguo' entram aqui). */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** Idioma escolhido à mão, por item. Sobrepõe a proposta (e é a ÚNICA fonte no 'sem-sinal'). */
  const [manual, setManual] = useState<Record<string, string>>({});

  const copy = COPY[mode];

  /** Zera o resultado — ao trocar de modo, ou antes de uma nova varredura. */
  const resetResult = () => {
    setReport(null);
    setDeckSize(null);
    setChecked(new Set());
    setManual({});
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    resetResult();
  };

  const run = async () => {
    setRunning(true);
    try {
      const config = await fetchLangConfig();
      setCfg(config);

      let result: AuditReport;
      let size: number;
      if (mode === 'cards') {
        const deck = await fetchDeck();
        size = deck.length;
        setDeckSize(size);
        if (!size) {
          setReport(null);
          return;
        }
        result = await auditDeck(deck, config);
      } else {
        const utts = await fetchAllUtterances();
        size = utts.length;
        setDeckSize(size);
        if (!size) {
          setReport(null);
          return;
        }
        result = await auditUtterances(utts, config);
      }

      setReport(result);
      // 'confiante' já vem marcado: é a faixa em que o texto contradiz o rótulo COM confiança.
      setChecked(new Set(result.findings.filter((f) => f.verdict === 'confiante' && f.proposed).map((f) => f.cardId)));
      setManual({});
    } catch (err) {
      toast.error(copy.errorScan, { detail: err });
    } finally {
      setRunning(false);
    }
  };

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Idioma que será gravado para um item: a escolha do usuário manda; a proposta é só o padrão. */
  const srcFor = (f: LangFinding): string => manual[f.cardId] || f.proposed?.srcLang || '';

  /**
   * O que de fato vai para a API. O `tgtLang` NUNCA é escolhido aqui: é derivado por `targetFor`, a
   * mesma função que o `langAudit` usa para propor — se a regra mudar lá, esta tela acompanha.
   */
  const pending: Relabel[] = !report || !cfg
    ? []
    : report.findings.flatMap((f) => {
        // 'sem-sinal' não tem checkbox: só entra se o usuário escolher o idioma à mão.
        const wanted = f.verdict === 'sem-sinal' ? manual[f.cardId] : checked.has(f.cardId) ? srcFor(f) : '';
        if (!wanted) return [];
        const src = baseLang(wanted);
        return [{ id: f.cardId, srcLang: src, tgtLang: targetFor(src, cfg) }];
      });

  const apply = async () => {
    if (!pending.length) return;
    const ok = await askConfirm({
      danger: true,
      title: copy.confirmTitle(pending.length),
      detail: copy.confirmDetail,
      confirmLabel: 'Gravar correções',
    });
    if (!ok) return;

    setApplying(true);
    try {
      // O número que vale é o que o servidor devolveu — não o que pedimos. Cada modo tem seu endpoint;
      // o par de idiomas é o mesmo, só muda o nome dos campos (srcLang/tgtLang × sourceLang/targetLang).
      const changed =
        mode === 'cards'
          ? await relabelCards(pending)
          : await relabelUtterances(pending.map((p) => ({ id: p.id, sourceLang: p.srcLang, targetLang: p.tgtLang })));
      if (changed === 0) {
        toast.warn(copy.zeroChanged);
      } else {
        toast.ok(copy.successToast(changed));
      }
      // Re-audita: a tela passa a mostrar o banco, não a nossa expectativa sobre ele.
      await run();
    } catch (err) {
      toast.error('Não foi possível gravar as correções.', { detail: err });
    } finally {
      setApplying(false);
    }
  };

  const findings = report?.findings ?? [];
  const confident = findings.filter((f) => f.verdict === 'confiante' && f.proposed);
  const ambiguous = findings.filter((f) => f.verdict === 'ambiguo');
  const noSignal = findings.filter((f) => f.verdict === 'sem-sinal');
  const counts = report?.counts;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4 text-ink">
        <ScanSearch className="w-5 h-5" />
        <h2 className="font-display font-bold text-lg">Auditoria de idioma</h2>
      </div>

      {/* Seletor de modo: o mesmo reparo, duas fontes de dados. Trocar de modo zera o resultado. */}
      <div className="inline-flex rounded-xl bg-surface border border-border-subtle p-1 mb-4">
        {(['cards', 'utterances'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            disabled={running || applying}
            aria-pressed={mode === m}
            className={`px-4 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === m ? 'btn-solid' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {COPY[m].tab}
          </button>
        ))}
      </div>

      <div className="card-panel">
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle">
          <div className="min-w-0">
            <div className="font-bold text-[14px] mb-1">{copy.headerTitle}</div>
            <p className="text-[12px] text-ink-muted">
              {copy.headerIntro} <span className="text-ink">Nada é alterado sem a sua confirmação.</span>
            </p>
          </div>
          <button
            onClick={() => void run()}
            disabled={running || applying}
            className="btn-solid shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
            {running ? 'Analisando…' : report || deckSize === 0 ? 'Analisar de novo' : copy.scanBtn}
          </button>
        </div>

        {running && (
          <div className="p-5 border-b border-border-subtle flex items-center gap-3 text-[12.5px] text-ink-muted">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-accent" />
            <span>
              {deckSize != null
                ? copy.analyzing(deckSize)
                : 'Carregando os dados e a sua configuração de idiomas…'}
            </span>
          </div>
        )}

        {!running && deckSize === 0 && (
          <div className="p-5 text-[12.5px] text-ink-muted">{copy.emptyMsg}</div>
        )}

        {!running && report && (
          <>
            {/* Resumo: as 4 contagens REAIS devolvidas pelo classificador. */}
            <div className="p-5 border-b border-border-subtle grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-good-soft px-3 py-2.5">
                <div className="label-mono text-good-ink">{copy.chip.ok}</div>
                <div className="font-mono font-black text-xl text-good-ink">{counts?.ok ?? 0}</div>
              </div>
              <div className="rounded-xl bg-error-soft px-3 py-2.5">
                <div className="label-mono text-error-ink">{copy.chip.fix}</div>
                <div className="font-mono font-black text-xl text-error-ink">{counts?.confiante ?? 0}</div>
              </div>
              <div className="rounded-xl bg-warn-soft px-3 py-2.5">
                <div className="label-mono text-warn-ink">{copy.chip.amb}</div>
                <div className="font-mono font-black text-xl text-warn-ink">{counts?.ambiguo ?? 0}</div>
              </div>
              <div className="rounded-xl bg-surface border border-border-subtle px-3 py-2.5">
                <div className="label-mono text-ink-muted">{copy.chip.none}</div>
                <div className="font-mono font-black text-xl text-ink-muted">{counts?.['sem-sinal'] ?? 0}</div>
              </div>
            </div>

            {/* CONFIANTE — o texto contradiz o rótulo com confiança. Marcados por padrão. */}
            {confident.length > 0 && (
              <div className="p-5 border-b border-border-subtle">
                <div className="flex items-center gap-2 mb-1 text-error-ink">
                  <AlertTriangle className="w-4 h-4" />
                  <h3 className="font-bold text-[13.5px]">Correções propostas ({confident.length})</h3>
                </div>
                <p className="text-[12px] text-ink-muted mb-4">{copy.proposedIntro}</p>
                <ul className="space-y-3">
                  {confident.map((f) => (
                    <li key={f.cardId} className="flex items-start gap-3 rounded-xl bg-surface border border-border-subtle p-3">
                      <input
                        type="checkbox"
                        checked={checked.has(f.cardId)}
                        onChange={() => toggle(f.cardId)}
                        aria-label={copy.ariaFix(f.word)}
                        className="mt-1 shrink-0 text-accent cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <Evidence finding={f} emptyMsg={copy.emptyEvidence} />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <CurrentPair current={f.current} />
                          <ArrowRight className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                          <span className="badge-tag ok font-mono">
                            {langLabel(f.proposed!.srcLang)} → {langLabel(f.proposed!.tgtLang)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AMBÍGUO — há sinal, mas fraco. Desmarcado por padrão; o idioma é escolha do usuário. */}
            {ambiguous.length > 0 && (
              <div className="p-5 border-b border-border-subtle">
                <div className="flex items-center gap-2 mb-1 text-warn-ink">
                  <HelpCircle className="w-4 h-4" />
                  <h3 className="font-bold text-[13.5px]">Precisam da sua decisão ({ambiguous.length})</h3>
                </div>
                <p className="text-[12px] text-ink-muted mb-4">{copy.ambiguousIntro}</p>
                <ul className="space-y-3">
                  {ambiguous.map((f) => {
                    const src = srcFor(f);
                    return (
                      <li key={f.cardId} className="flex items-start gap-3 rounded-xl bg-surface border border-border-subtle p-3">
                        <input
                          type="checkbox"
                          checked={checked.has(f.cardId)}
                          onChange={() => toggle(f.cardId)}
                          disabled={!src}
                          aria-label={copy.ariaFix(f.word)}
                          className="mt-1 shrink-0 text-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <div className="min-w-0 flex-1">
                          <Evidence finding={f} emptyMsg={copy.emptyEvidence} />
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <CurrentPair current={f.current} />
                            <ArrowRight className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                            <LangSelect
                              value={src}
                              onChange={(v) => {
                                setManual((m) => ({ ...m, [f.cardId]: v }));
                                // Sem idioma escolhido não há o que gravar — desmarca sozinho.
                                if (!v) setChecked((prev) => {
                                  const next = new Set(prev);
                                  next.delete(f.cardId);
                                  return next;
                                });
                              }}
                              placeholder="Escolher idioma…"
                            />
                            {src && cfg && (
                              <span className="text-[11.5px] text-ink-muted">
                                traduz para <span className="font-mono text-ink">{langLabel(targetFor(baseLang(src), cfg))}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* SEM-SINAL — não temos proposta. Só o usuário pode dizer, e só se ele quiser. */}
            {noSignal.length > 0 && (
              <div className="p-5 border-b border-border-subtle">
                <div className="flex items-center gap-2 mb-1 text-ink-muted">
                  <Ban className="w-4 h-4" />
                  <h3 className="font-bold text-[13.5px] text-ink">Sem como saber ({noSignal.length})</h3>
                </div>
                <p className="text-[12px] text-ink-muted mb-4">{copy.noSignalIntro}</p>
                <ul className="space-y-3">
                  {noSignal.map((f) => (
                    <li key={f.cardId} className="rounded-xl bg-surface border border-border-subtle p-3">
                      <Evidence finding={f} emptyMsg={copy.emptyEvidence} />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CurrentPair current={f.current} />
                        <LangSelect
                          value={manual[f.cardId] ?? ''}
                          onChange={(v) => setManual((m) => ({ ...m, [f.cardId]: v }))}
                          placeholder="Manter como está"
                        />
                        {manual[f.cardId] && cfg && (
                          <span className="text-[11.5px] text-ink-muted">
                            traduz para{' '}
                            <span className="font-mono text-ink">{langLabel(targetFor(baseLang(manual[f.cardId]), cfg))}</span>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* OK — só a contagem, colapsado. Não há o que decidir sobre item certo. */}
            {(counts?.ok ?? 0) > 0 && (
              <details className="p-5 border-b border-border-subtle">
                <summary className="flex items-center gap-2 cursor-pointer text-good-ink text-[13.5px] font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  {copy.okLine(counts?.ok ?? 0)}
                </summary>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {findings
                    .filter((f) => f.verdict === 'ok')
                    .map((f) => (
                      <li key={f.cardId} className="badge-tag ok">
                        {f.word}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[12px] text-ink-muted">
                {pending.length === 0 ? copy.applyIdle : copy.willWrite(pending.length)}
              </p>
              <button
                onClick={() => void apply()}
                disabled={!pending.length || applying || running}
                className="btn-solid shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {applying
                  ? 'Gravando…'
                  : `Aplicar ${pending.length} ${pending.length === 1 ? 'correção' : 'correções'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
