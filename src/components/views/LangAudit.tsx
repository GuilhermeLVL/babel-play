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
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, HelpCircle, Loader2, ScanSearch } from 'lucide-react';
import { useState } from 'react';

import { fetchAllUtterances, fetchDeck, relabelCards, relabelUtterances } from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t, tp } from '../../lib/i18n';
import { auditDeck, type AuditReport, auditUtterances, type LangFinding, targetFor } from '../../lib/langAudit';
import { fetchLangConfig, type LangConfig } from '../../lib/langConfig';
import { baseLang, knownShorts, langLabel } from '../../lib/languages';
import { askConfirm, toast } from '../Toast';
import { TituloDeSecao } from '../ui';

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
    scanBtn: 'Conferir agora',
    headerTitle: 'Conferir o idioma dos meus cartões',
    headerIntro: 'Compara o idioma gravado em cada cartão com a frase de onde a palavra saiu, e mostra o que não bate.',
    emptyMsg: 'Você ainda não tem cartões no baralho, não há nada para auditar.',
    analyzing: (n) =>
      `Analisando ${n} ${n === 1 ? 'cartão' : 'cartões'}. A detecção roda um texto de cada vez, em baralhos grandes isso leva alguns segundos.`,
    chip: { ok: 'Certos', fix: 'A corrigir', amb: 'Ambíguos', none: 'Sem sinal' },
    proposedIntro: 'O texto do cartão contradiz o idioma gravado. Desmarque o que não quiser corrigir.',
    ambiguousIntro:
      'O sinal existe, mas é fraco demais para sobrescrever no automático. Marque só o que você reconhecer, e confirme o idioma.',
    noSignalIntro:
      'Não temos como saber o idioma destes cartões: ficam como estão. Não há proposta nossa aqui, se você souber, pode dizer no seletor; se não, deixe em branco.',
    okLine: (n) => `${n} ${n === 1 ? 'cartão já está certo' : 'cartões já estão certos'}`,
    applyIdle: 'Nenhum cartão marcado, nada será gravado.',
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
    scanBtn: 'Conferir agora',
    headerTitle: 'Conferir o idioma das minhas falas',
    headerIntro:
      'Compara o idioma gravado em cada fala das suas transcrições com o texto dela, e mostra o que não bate.',
    emptyMsg: 'Você ainda não tem falas transcritas, não há nada para auditar.',
    analyzing: (n) =>
      `Analisando ${n} ${n === 1 ? 'fala' : 'falas'}. A detecção roda um texto de cada vez, pode levar alguns segundos.`,
    chip: { ok: 'Certas', fix: 'A corrigir', amb: 'Ambíguas', none: 'Sem sinal' },
    proposedIntro: 'O texto da fala contradiz o idioma gravado. Desmarque o que não quiser corrigir.',
    ambiguousIntro:
      'O sinal existe, mas é fraco demais para sobrescrever no automático. Marque só o que você reconhecer, e confirme o idioma.',
    noSignalIntro:
      'Não temos como saber o idioma destas falas: ficam como estão. Não há proposta nossa aqui, se você souber, pode dizer no seletor; se não, deixe em branco.',
    okLine: (n) => `${n} ${n === 1 ? 'fala já está certa' : 'falas já estão certas'}`,
    applyIdle: 'Nenhuma fala marcada, nada será gravado.',
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
  const src = current.srcLang ? langLabel(current.srcLang) : '-';
  const tgt = current.tgtLang ? langLabel(current.tgtLang) : '-';
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

/* ── As mesmas três peças, nas medidas do headset (texto de corpo, sem itálico, campo de 60 px) ── */
function SeletorDoQuest({
  value,
  onChange,
  placeholder,
  rotulo,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rotulo: string;
}) {
  return (
    <select
      className="q-campo q-aud-seletor"
      aria-label={rotulo}
      value={value}
      onChange={(e) => onChange(e.target.value)}
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

function ParAtualDoQuest({ current }: { current: LangFinding['current'] }) {
  const src = current.srcLang ? langLabel(current.srcLang) : '-';
  const tgt = current.tgtLang ? langLabel(current.tgtLang) : '-';
  return (
    <span className="q-aud-par">
      {src} → {tgt}
    </span>
  );
}

function EvidenciaDoQuest({ finding, emptyMsg }: { finding: LangFinding; emptyMsg: string }) {
  return (
    <>
      <b>{finding.word}</b>
      <p className="q-aud-frase">{finding.sentence ? `“${finding.sentence}”` : emptyMsg}</p>
      <p className="q-aju-nota">{finding.reason}</p>
    </>
  );
}

const chaveDoResumo = (m: Mode) => `babel.auditoriaDeIdioma.${m}`;

function lerResumo(m: Mode): string | null {
  try {
    return localStorage.getItem(chaveDoResumo(m));
  } catch {
    return null;
  }
}

function gravarResumo(m: Mode, texto: string) {
  try {
    localStorage.setItem(chaveDoResumo(m), texto);
  } catch {
    /* sem armazenamento: o resumo vale só nesta visita */
  }
}

/** A frase do protótipo ("3 palavras conferidas, nenhuma fora do idioma."), com os números reais. */
function resumoDe(m: Mode, total: number, fora: number): string {
  const coisa =
    m === 'cards'
      ? total === 1
        ? 'palavra conferida'
        : 'palavras conferidas'
      : total === 1
        ? 'fala conferida'
        : 'falas conferidas';
  return `${total} ${coisa}, ${fora === 0 ? 'nenhuma fora do idioma.' : `${fora} fora do idioma.`}`;
}

export default function LangAudit() {
  const questNovo = useQuestNovo();
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

  /** O resumo da ÚLTIMA conferência de cada modo — fica guardado para a próxima visita. */
  const [resumos, setResumos] = useState<Record<Mode, string | null>>(() => ({
    cards: lerResumo('cards'),
    utterances: lerResumo('utterances'),
  }));
  const resumo = resumos[mode];

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
      const texto = resumoDe(mode, size, (result.counts.confiante ?? 0) + (result.counts.ambiguo ?? 0));
      gravarResumo(mode, texto);
      setResumos((r) => ({ ...r, [mode]: texto }));
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
  const pending: Relabel[] =
    !report || !cfg
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

  /* QUEST: o mesmo fluxo (conferir, decidir item a item, aplicar com confirmação), com um controle
     grande por item: interruptor para "corrigir este", seletor para o idioma. */
  if (questNovo) {
    const desmarcar = (id: string) =>
      setChecked((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    const traduzPara = (src: string) =>
      src && cfg ? (
        <span className="q-aud-par">
          {t('traduz para {idioma}', { idioma: langLabel(targetFor(baseLang(src), cfg)) })}
        </span>
      ) : null;
    return (
      <section className="q-secao" data-testid="auditoria-de-idioma">
        <header>
          <div>
            <h2>{t('Auditoria de idioma')}</h2>
            <p>{t('Confere se as palavras do seu caderno estão mesmo no idioma certo.')}</p>
          </div>
          {/* O MESMO reparo sobre as transcrições: na tela de sempre é um link embaixo do cartão. */}
          <div className="q-abas q-seg" role="group" aria-label={t('O que conferir')}>
            <button
              type="button"
              className="q-aba"
              aria-pressed={mode === 'cards'}
              disabled={running || applying}
              onClick={() => switchMode('cards')}
            >
              {t('Palavras do caderno')}
            </button>
            <button
              type="button"
              className="q-aba"
              aria-pressed={mode === 'utterances'}
              disabled={running || applying}
              onClick={() => switchMode('utterances')}
            >
              {t('Falas das transcrições')}
            </button>
          </div>
        </header>

        <div className="q-ajuste">
          <div>
            <b>{copy.headerTitle}</b>
            <small>{resumo ?? `${copy.headerIntro} ${t('Nada é alterado sem a sua confirmação.')}`}</small>
          </div>
          <button type="button" className="q-ctl" onClick={() => void run()} disabled={running || applying}>
            {running ? <Loader2 className="gira" aria-hidden /> : <ScanSearch aria-hidden />}
            {running
              ? t('Conferindo…')
              : resumo || report || deckSize === 0
                ? t('Conferir de novo')
                : t('Conferir agora')}
          </button>
        </div>

        {running && (
          <div className="q-aju-espera" role="status">
            <Loader2 className="gira" aria-hidden />
            <span>
              {deckSize != null ? copy.analyzing(deckSize) : t('Carregando os dados e a sua configuração de idiomas…')}
            </span>
          </div>
        )}

        {!running && deckSize === 0 && (
          <p className="q-aju-nota" role="status">
            {copy.emptyMsg}
          </p>
        )}

        {!running && report && (
          <>
            <div className="q-grade g4">
              <div className="q-num tom-bom">
                <b>{counts?.ok ?? 0}</b>
                <span>{copy.chip.ok}</span>
              </div>
              <div className="q-num tom-erro">
                <b>{counts?.confiante ?? 0}</b>
                <span>{copy.chip.fix}</span>
              </div>
              <div className="q-num tom-aviso">
                <b>{counts?.ambiguo ?? 0}</b>
                <span>{copy.chip.amb}</span>
              </div>
              <div className="q-num">
                <b>{counts?.['sem-sinal'] ?? 0}</b>
                <span>{copy.chip.none}</span>
              </div>
            </div>

            {confident.length > 0 && (
              <div className="q-cartao">
                <h3>
                  <AlertTriangle aria-hidden /> {t('Correções propostas ({n})', { n: confident.length })}
                </h3>
                <p className="q-aju-nota">{copy.proposedIntro}</p>
                <ul className="q-aud-lista">
                  {confident.map((f) => (
                    <li key={f.cardId} className="q-aud-item">
                      <div>
                        <EvidenciaDoQuest finding={f} emptyMsg={copy.emptyEvidence} />
                        <div className="q-aud-linha">
                          <ParAtualDoQuest current={f.current} />
                          <ArrowRight aria-hidden />
                          <span className="q-tag">
                            {langLabel(f.proposed!.srcLang)} → {langLabel(f.proposed!.tgtLang)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="q-interruptor"
                        role="switch"
                        aria-checked={checked.has(f.cardId)}
                        aria-label={copy.ariaFix(f.word)}
                        onClick={() => toggle(f.cardId)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ambiguous.length > 0 && (
              <div className="q-cartao">
                <h3>
                  <HelpCircle aria-hidden /> {t('Precisam da sua decisão ({n})', { n: ambiguous.length })}
                </h3>
                <p className="q-aju-nota">{copy.ambiguousIntro}</p>
                <ul className="q-aud-lista">
                  {ambiguous.map((f) => {
                    const src = srcFor(f);
                    return (
                      <li key={f.cardId} className="q-aud-item">
                        <div>
                          <EvidenciaDoQuest finding={f} emptyMsg={copy.emptyEvidence} />
                          <div className="q-aud-linha">
                            <ParAtualDoQuest current={f.current} />
                            <ArrowRight aria-hidden />
                            <SeletorDoQuest
                              value={src}
                              rotulo={t('Idioma de "{palavra}"', { palavra: f.word })}
                              placeholder={t('Escolher idioma…')}
                              onChange={(v) => {
                                setManual((m) => ({ ...m, [f.cardId]: v }));
                                // Sem idioma escolhido não há o que gravar: desmarca sozinho.
                                if (!v) desmarcar(f.cardId);
                              }}
                            />
                            {traduzPara(src)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="q-interruptor"
                          role="switch"
                          aria-checked={checked.has(f.cardId)}
                          aria-label={copy.ariaFix(f.word)}
                          disabled={!src}
                          onClick={() => toggle(f.cardId)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {noSignal.length > 0 && (
              <div className="q-cartao">
                <h3>
                  <Ban aria-hidden /> {t('Sem como saber ({n})', { n: noSignal.length })}
                </h3>
                <p className="q-aju-nota">{copy.noSignalIntro}</p>
                <ul className="q-aud-lista">
                  {noSignal.map((f) => (
                    <li key={f.cardId} className="q-aud-item">
                      <div>
                        <EvidenciaDoQuest finding={f} emptyMsg={copy.emptyEvidence} />
                        <div className="q-aud-linha">
                          <ParAtualDoQuest current={f.current} />
                          <SeletorDoQuest
                            value={manual[f.cardId] ?? ''}
                            rotulo={t('Idioma de "{palavra}"', { palavra: f.word })}
                            placeholder={t('Manter como está')}
                            onChange={(v) => setManual((m) => ({ ...m, [f.cardId]: v }))}
                          />
                          {traduzPara(manual[f.cardId] ?? '')}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(counts?.ok ?? 0) > 0 && (
              <details className="q-aju-detalhe">
                <summary>
                  <CheckCircle2 aria-hidden /> {copy.okLine(counts?.ok ?? 0)}
                </summary>
                <ul className="q-aud-certos">
                  {findings
                    .filter((f) => f.verdict === 'ok')
                    .map((f) => (
                      <li key={f.cardId} className="q-tag">
                        {f.word}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            <div className="q-ajuste">
              <div>
                <b>{pending.length === 0 ? copy.applyIdle : copy.willWrite(pending.length)}</b>
                <small>{t('Nada é gravado sem a sua confirmação.')}</small>
              </div>
              <button
                type="button"
                className="q-ctl pri"
                onClick={() => void apply()}
                disabled={!pending.length || applying || running}
              >
                {applying ? <Loader2 className="gira" aria-hidden /> : <CheckCircle2 aria-hidden />}
                {applying ? t('Gravando…') : tp(pending.length, 'Aplicar {n} correção', 'Aplicar {n} correções')}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="secao">
      {/* Marcação do protótipo: `TituloDeSecao` + `.cartao.p5.entre` com o resumo da última conferência
          e "Conferir de novo". As falas (o mesmo reparo sobre as transcrições) viram um link embaixo. */}
      <TituloDeSecao
        icone={ScanSearch}
        titulo="Auditoria de idioma"
        desc="Confere se as palavras do seu caderno estão mesmo no idioma certo."
      />

      <div className="cartao">
        <div
          className="p5 entre"
          style={running || report || deckSize === 0 ? { borderBottom: '1px solid var(--border-subtle)' } : undefined}
        >
          <p className="mut" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
            {resumo ?? `${copy.headerIntro} Nada é alterado sem a sua confirmação.`}
          </p>
          <button type="button" onClick={() => void run()} disabled={running || applying} className="btn btn-outline">
            {running ? <Loader2 className="gira" aria-hidden /> : <ScanSearch aria-hidden />}
            {running ? 'Conferindo…' : resumo || report || deckSize === 0 ? 'Conferir de novo' : copy.scanBtn}
          </button>
        </div>

        {running && (
          <div className="p-5 border-b border-border-subtle flex items-center gap-3 text-[12.5px] text-ink-muted">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-accent" />
            <span>
              {deckSize != null ? copy.analyzing(deckSize) : 'Carregando os dados e a sua configuração de idiomas…'}
            </span>
          </div>
        )}

        {!running && deckSize === 0 && <div className="p-5 text-[12.5px] text-ink-muted">{copy.emptyMsg}</div>}

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
                    <li
                      key={f.cardId}
                      className="flex items-start gap-3 rounded-xl bg-surface border border-border-subtle p-3"
                    >
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
                      <li
                        key={f.cardId}
                        className="flex items-start gap-3 rounded-xl bg-surface border border-border-subtle p-3"
                      >
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
                                if (!v)
                                  setChecked((prev) => {
                                    const next = new Set(prev);
                                    next.delete(f.cardId);
                                    return next;
                                  });
                              }}
                              placeholder="Escolher idioma…"
                            />
                            {src && cfg && (
                              <span className="text-[11.5px] text-ink-muted">
                                traduz para{' '}
                                <span className="font-mono text-ink">{langLabel(targetFor(baseLang(src), cfg))}</span>
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
                            <span className="font-mono text-ink">
                              {langLabel(targetFor(baseLang(manual[f.cardId]), cfg))}
                            </span>
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
      {/* O MESMO reparo sobre as transcrições: o protótipo desenha só o caderno, e as falas ficam a um clique. */}
      <button
        type="button"
        className="link"
        style={{ marginTop: 10, fontSize: 12.5 }}
        onClick={() => switchMode(mode === 'cards' ? 'utterances' : 'cards')}
        disabled={running || applying}
      >
        {mode === 'cards' ? 'Conferir também as falas das transcrições' : 'Voltar às palavras do caderno'}
      </button>
    </section>
  );
}
