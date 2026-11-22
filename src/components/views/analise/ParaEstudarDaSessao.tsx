import '../../../styles/para-estudar.css';

import { Check, ChevronDown, Play } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import type { FraseIMais1, PalavraNovaDaSessao } from '../../../core/leitura/paraEstudarDaSessao';
import { estadoNoCaderno } from '../../../core/vocabulario/etiquetas';
import { useParaEstudarDaSessao } from '../../../hooks/useParaEstudarDaSessao';
import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { alternarMarcacao } from '../../../lib/etiquetas/teclasDeMarcacao';
import { t, tp } from '../../../lib/i18n';

type Aba = 'frases' | 'palavras';
const PASSO = 8;

interface Retida {
  f?: { item: FraseIMais1; pos: number };
  p?: { item: PalavraNovaDaSessao; pos: number };
}

export interface PalavraParaGuardar {
  palavra: string;
  frase: string;
  lang: string;
}

/**
 * "PARA ESTUDAR DESTA SESSÃO" (openspec `frases-i-mais-1`): as frases da sessão com UMA palavra nova (o melhor cartão) e
 * a lista das palavras novas por frequência. Recolhida: é uma sugestão, não uma tarefa. Sem número honesto (sem conta,
 * poucas sessões, idioma sem espaço entre palavras, pouco texto) não renderiza nada, como a cobertura.
 *
 * "Guardar" cria o cartão da palavra pelo MESMO fluxo da folha da palavra (`aoGuardar`); "Já sei" marca sem cartão
 * (`alternarMarcacao`, a régua do cartão). O que a pessoa acabou de guardar fica na lista, com "Guardado", mesmo
 * que o caderno passe a contar a palavra como conhecida.
 */
export default function ParaEstudarDaSessao({
  falas,
  idioma,
  aoGuardar,
  aoIrParaFala,
}: {
  /** As falas no texto original, na ordem da sessão (o índice é o que `aoIrParaFala` recebe). */
  falas: ReadonlyArray<{ texto: string; lang?: string | null }> | null;
  idioma: string | null | undefined;
  /** Cria o cartão da palavra com a frase como contexto. `true` quando entrou no caderno. */
  aoGuardar: (item: PalavraParaGuardar) => Promise<boolean>;
  /** Leva o player até a fala. Ausente: a frase não é um botão. */
  aoIrParaFala?: (indice: number) => void;
}) {
  const dados = useParaEstudarDaSessao(falas, idioma);
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<Aba>('frases');
  const [mostrar, setMostrar] = useState<Record<Aba, number>>({ frases: PASSO, palavras: PASSO });
  const [retidas, setRetidas] = useState<ReadonlyMap<string, Retida>>(new Map());
  const [erros, setErros] = useState<ReadonlySet<string>>(new Set());
  /* As chaves com pedido em andamento: a ref trava o segundo toque na hora, o estado desabilita o botão. */
  const emAndamento = useRef(new Set<string>());
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set());
  const [sessao, setSessao] = useState(falas);
  const id = useId();
  const lang = idioma ?? '';
  if (sessao !== falas) {
    /* Outra sessão: nada do estado da anterior vale. */
    setSessao(falas);
    setMostrar({ frases: PASSO, palavras: PASSO });
    setRetidas(new Map());
    setErros(new Set());
    setOcupadas(new Set());
    emAndamento.current.clear();
  }
  const guardadas = retidas;

  /* A palavra guardada passa a contar como conhecida e sairia da conta: ela fica na lista, no mesmo lugar. */
  const lista = useMemo(() => {
    const unir = <T extends { chave: string }>(
      novos: T[],
      deRetida: (r: Retida) => { item: T; pos: number } | undefined,
    ): T[] => {
      const saida = [...novos];
      const presentes = new Set(novos.map((n) => n.chave));
      const faltam = [...retidas]
        .flatMap(([c, r]) => {
          const x = deRetida(r);
          return x && !presentes.has(c) ? [x] : [];
        })
        .sort((x, y) => x.pos - y.pos);
      for (const { item, pos } of faltam) saida.splice(Math.min(pos, saida.length), 0, item);
      return saida;
    };
    if (!dados && !retidas.size) return null;
    return {
      frases: unir(dados?.frases ?? [], (r) => r.f),
      palavras: unir(dados?.palavras ?? [], (r) => r.p),
    };
  }, [dados, retidas]);

  const s = useSnapshotDasEtiquetas();
  if (!lista || (!lista.frases.length && !lista.palavras.length)) return null;

  const comTrava = async (chave: string, f: () => Promise<boolean>) => {
    if (emAndamento.current.has(chave)) return;
    emAndamento.current.add(chave);
    setOcupadas(new Set(emAndamento.current));
    setErros((e) => new Set([...e].filter((c) => c !== chave)));
    const ok = await f().catch(() => false);
    emAndamento.current.delete(chave);
    setOcupadas(new Set(emAndamento.current));
    if (!ok) setErros((e) => new Set(e).add(chave));
    return ok;
  };
  const guardar = async (chave: string, item: PalavraParaGuardar) => {
    let ok = false;
    await comTrava(chave, async () => (ok = await aoGuardar(item)));
    if (!ok) return;
    const f = lista.frases.findIndex((x) => x.chave === chave);
    const p = lista.palavras.findIndex((x) => x.chave === chave);
    setRetidas((m) =>
      new Map(m).set(chave, {
        f: f >= 0 ? { item: lista.frases[f]!, pos: f } : undefined,
        p: p >= 0 ? { item: lista.palavras[p]!, pos: p } : undefined,
      }),
    );
  };
  const jaSei = (chave: string, palavra: string) =>
    comTrava(chave, async () => (await alternarMarcacao(palavra, lang, 'conhecida')) !== false);
  const noCaderno = (palavra: string) => !!estadoNoCaderno(s.caderno, palavra, lang);

  const trocarAba = (a: Aba) => {
    setAba(a);
    document.getElementById(`${id}-aba-${a}`)?.focus();
  };
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    trocarAba(e.key === 'ArrowLeft' || e.key === 'Home' ? 'frases' : 'palavras');
  };

  const nFrases = lista.frases.length;
  const nPalavras = lista.palavras.length;
  const nivel = (n: string | null) =>
    n ? (
      <span className="estudar-nivel" title={t('Nível CEFR')}>
        {n}
      </span>
    ) : null;
  const erro = (chave: string) =>
    erros.has(chave) ? (
      <span className="estudar-erro" role="status">
        {t('Não deu para salvar agora.')}
      </span>
    ) : null;

  return (
    <section className="estudar" aria-labelledby={`${id}-titulo`} data-testid="para-estudar-da-sessao">
      <h2 className="estudar-titulo" id={`${id}-titulo`}>
        <button
          type="button"
          className="estudar-cabeca"
          aria-expanded={aberta}
          aria-controls={`${id}-corpo`}
          onClick={() => setAberta((v) => !v)}
        >
          <span>{t('Para estudar desta sessão')}</span>
          <span className="estudar-resumo">
            {tp(nFrases, '{n} frase com 1 palavra nova', '{n} frases com 1 palavra nova')}
          </span>
          <ChevronDown aria-hidden className="estudar-seta" />
        </button>
      </h2>
      <div id={`${id}-corpo`} className="estudar-corpo" hidden={!aberta}>
        <div className="estudar-abas" role="tablist" aria-label={t('Para estudar desta sessão')} onKeyDown={aoTeclar}>
          {(['frases', 'palavras'] as const).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              id={`${id}-aba-${a}`}
              aria-selected={aba === a}
              aria-controls={`${id}-painel-${a}`}
              tabIndex={aba === a ? 0 : -1}
              onClick={() => setAba(a)}
            >
              {a === 'frases' ? t('Frases com 1 palavra nova') : t('Palavras novas')}
              <span className="estudar-contagem"> ({a === 'frases' ? nFrases : nPalavras})</span>
            </button>
          ))}
        </div>

        {aba === 'frases' ? (
          <div role="tabpanel" id={`${id}-painel-frases`} aria-labelledby={`${id}-aba-frases`}>
            {nFrases === 0 ? (
              <p className="estudar-vazio">{t('Nenhuma frase desta sessão tem só uma palavra nova.')}</p>
            ) : (
              <ul className="estudar-lista">
                {lista.frases.slice(0, mostrar.frases).map((f) => {
                  const guardada = guardadas.has(f.chave);
                  const frase = (
                    <>
                      {f.frase.slice(0, f.destaque.inicio)}
                      <mark className="estudar-alvo">{f.frase.slice(f.destaque.inicio, f.destaque.fim)}</mark>
                      {f.frase.slice(f.destaque.fim)}
                    </>
                  );
                  return (
                    <li key={f.chave} className="estudar-item" data-guardada={guardada || undefined}>
                      {aoIrParaFala ? (
                        <button
                          type="button"
                          className="estudar-frase estudar-frase-botao"
                          aria-label={t('Ir para esta frase no áudio: {frase}', { frase: f.frase })}
                          onClick={() => aoIrParaFala(f.fala)}
                        >
                          <Play aria-hidden className="estudar-ir" />
                          <span>{frase}</span>
                        </button>
                      ) : (
                        <p className="estudar-frase">{frase}</p>
                      )}
                      <div className="estudar-acoes">
                        <span className="estudar-meta">
                          {tp(f.vezes, 'aparece {n} vez na sessão', 'aparece {n} vezes na sessão')}
                          {nivel(f.nivel)}
                        </span>
                        {guardada ? (
                          <span className="estudar-guardado" role="status">
                            <Check aria-hidden /> {t('Guardado')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="estudar-botao"
                            aria-label={t('Guardar como cartão: {palavra}', { palavra: f.palavra })}
                            disabled={ocupadas.has(f.chave)}
                            onClick={() => void guardar(f.chave, { palavra: f.palavra, frase: f.frase, lang })}
                          >
                            {t('Guardar como cartão')}
                          </button>
                        )}
                        {erro(f.chave)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {nFrases > mostrar.frases && (
              <button
                type="button"
                className="estudar-botao estudar-mais"
                onClick={() => setMostrar((m) => ({ ...m, frases: m.frases + PASSO }))}
              >
                {t('Mostrar mais')}
              </button>
            )}
          </div>
        ) : (
          <div role="tabpanel" id={`${id}-painel-palavras`} aria-labelledby={`${id}-aba-palavras`}>
            {nPalavras === 0 ? (
              <p className="estudar-vazio">{t('Nenhuma palavra nova nesta sessão.')}</p>
            ) : (
              <ul className="estudar-lista">
                {lista.palavras.slice(0, mostrar.palavras).map((p) => {
                  const guardada = guardadas.has(p.chave);
                  return (
                    <li
                      key={p.chave}
                      className="estudar-item estudar-item-palavra"
                      data-guardada={guardada || undefined}
                    >
                      <div className="estudar-palavra">
                        <strong>{p.palavra}</strong>
                        <span className="estudar-meta">
                          {tp(p.vezes, '{n} vez', '{n} vezes')}
                          {nivel(p.nivel)}
                        </span>
                      </div>
                      <div className="estudar-acoes">
                        {guardada || noCaderno(p.palavra) ? (
                          <span className="estudar-guardado" role="status">
                            <Check aria-hidden /> {t('Guardado')}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="estudar-botao"
                              aria-label={t('Guardar: {palavra}', { palavra: p.palavra })}
                              disabled={ocupadas.has(p.chave)}
                              onClick={() => void guardar(p.chave, { palavra: p.palavra, frase: p.frase, lang })}
                            >
                              {t('Guardar')}
                            </button>
                            <button
                              type="button"
                              className="estudar-botao"
                              aria-label={t('Já sei: {palavra}', { palavra: p.palavra })}
                              disabled={ocupadas.has(p.chave)}
                              onClick={() => void jaSei(p.chave, p.palavra)}
                            >
                              {t('Já sei')}
                            </button>
                          </>
                        )}
                        {erro(p.chave)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {nPalavras > mostrar.palavras && (
              <button
                type="button"
                className="estudar-botao estudar-mais"
                onClick={() => setMostrar((m) => ({ ...m, palavras: m.palavras + PASSO }))}
              >
                {t('Mostrar mais')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
