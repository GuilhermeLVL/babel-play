import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Library, Loader2, AlertTriangle, RotateCw, Inbox, Search,
  PlusCircle, PowerOff, Trash2, ChevronRight, X, Play,
} from 'lucide-react'
import {
  listarBaralhosAnki, listarNotasDoBaralho, ativarNotasDoBaralho, desativarBaralho, purgarBaralho,
  type BaralhoAnkiResumo, type NotaAnkiDetalhe, type EstadoNota,
} from '../../data/apiAnki'
import { data } from '../../lib/i18n';

/**
 * BIBLIOTECA › BARALHOS — o que já foi trazido do Anki, e o que fazer com cada um.
 *
 * IRMÃ do `CatalogoDePalavras` (mesmo molde: busca com debounce resolvida no servidor, paginação
 * por cursor, filtros em pills, três estados explícitos) e vizinha do `BaralhoAnki.tsx`, que cuida
 * só do PASSO de trazer/levar um arquivo. Esta tela cuida do que acontece DEPOIS: o baralho já
 * está gravado no servidor, e o saldo — quanto entrou, quanto não entrou e por quê — precisa ficar
 * visível sem exigir que a pessoa abra o arquivo de novo.
 *
 * A DISTINÇÃO QUE NÃO PODE SUMIR: `descartadas` é a régua de qualidade recusando (acionável — dá
 * pra corrigir o mapeamento e reimportar) e `ausentes` é a nota tendo sumido do arquivo desde o
 * último import (histórico do baralho, não defeito). Somar as duas, ou dar a mesma cor às duas,
 * mandaria a pessoa procurar conserto onde não há nada quebrado — por isso elas vêm em blocos e
 * cores separadas em toda a tela, nunca um total combinado.
 *
 * PAGINAÇÃO: optei por "carregar mais" simples em vez da lista virtualizada do `CatalogoDePalavras`.
 * Lá a virtualização foi decisão de VOLUME medido (2.116 itens). O detalhe de um baralho de Anki
 * tende a ficar na casa das centenas por página de uso real, e "carregar mais" já resolve sem o
 * custo de manter a janela de scroll sincronizada — se um baralho medido no futuro provar precisar
 * de mais, a troca é local a este componente.
 */

export interface BaralhosAnkiProps {
  /** Chamado ao voltar para a tela anterior (menu/jogos). */
  onVoltar: () => void
  /** Porta para importar um novo baralho — a tela de upload já existe em `BaralhoAnki.tsx`. */
  onImportar: () => void
  /**
   * "Jogar só com este" — o recorte da rodada. Fica aqui, e não no lobby, porque é aqui que a
   * pessoa está olhando os baralhos e sabe qual quer; obrigá-la a voltar e procurar um seletor
   * seria pedir que ela guardasse o nome na cabeça no caminho.
   */
  onJogarCom?: (deckId: string, nome: string, lang?: string) => void
  /** Ativar cria cartões: quem montou esta tela precisa reler o baralho depois. */
  onAtivou?: () => void
}

const FILTROS_ESTADO: Array<{ id: EstadoNota | 'todas'; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'ativa', rotulo: 'Ativas' },
  { id: 'arquivada', rotulo: 'Arquivadas' },
  { id: 'descartada', rotulo: 'Descartadas' },
]

function fmtData(ts: number): string {
  return data(new Date(ts))
}

// ───────────────────────────── lista ─────────────────────────────

export default function BaralhosAnki({ onVoltar, onImportar, onJogarCom, onAtivou }: BaralhosAnkiProps) {
  const [baralhos, setBaralhos] = useState<BaralhoAnkiResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ativando, setAtivando] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmarPurga, setConfirmarPurga] = useState<BaralhoAnkiResumo | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro(null)
    setCarregando(true)
    try {
      setBaralhos(await listarBaralhosAnki())
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const ativarMais = async (deck: BaralhoAnkiResumo) => {
    setAtivando(deck.id)
    try {
      const r = await ativarNotasDoBaralho(deck.id)
      setBaralhos((antes) => antes.map((b) => (b.id === deck.id
        ? { ...b, ativas: b.ativas + r.ativadas }
        : b)))
      // Cartões novos existem agora: quem montou esta tela precisa reler o baralho.
      onAtivou?.()
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setAtivando(null)
    }
  }

  const desativar = async (deck: BaralhoAnkiResumo) => {
    setOcupado(deck.id)
    try {
      await desativarBaralho(deck.id)
      setBaralhos((antes) => antes.map((b) => (b.id === deck.id ? { ...b, estado: 'desativado' } : b)))
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setOcupado(null)
    }
  }

  const purgar = async (deck: BaralhoAnkiResumo) => {
    setOcupado(deck.id)
    try {
      await purgarBaralho(deck.id)
      setBaralhos((antes) => antes.filter((b) => b.id !== deck.id))
      if (aberto === deck.id) setAberto(null)
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setOcupado(null)
      setConfirmarPurga(null)
    }
  }

  const deckAberto = baralhos.find((b) => b.id === aberto) ?? null

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pb-28 animate-in fade-in duration-200">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <button onClick={onVoltar} className="flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink mb-3 py-1 cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <h1 className="font-display font-black text-2xl text-ink tracking-tight flex items-center gap-2">
            <Library className="w-6 h-6 text-accent" aria-hidden /> Baralhos do Anki
          </h1>
          <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">
            O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.
          </p>
        </div>
        <button
          onClick={onImportar}
          className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2 shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Trazer baralho
        </button>
      </header>

      {erro && (
        <div className="card-panel border border-error/30 bg-error-soft/10 p-4 text-[13px] mb-4">
          <div className="flex items-start gap-2 text-error font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>Não consegui carregar seus baralhos.</p>
              <p className="font-normal text-ink-muted text-[12px] mt-0.5">{erro}</p>
            </div>
          </div>
          <button onClick={() => void carregar()} className="btn-solid mt-2 px-3 py-1.5 text-[12px] flex items-center gap-1.5 cursor-pointer">
            <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      {!erro && carregando && (
        // Esqueleto, não zeros — "0 baralhos" durante o carregamento seria um número falso.
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[92px] rounded-xl bg-canvas animate-pulse" />
          ))}
        </div>
      )}

      {!erro && !carregando && baralhos.length === 0 && (
        <div className="card-panel flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Inbox className="w-7 h-7 text-ink-muted" />
          <p className="text-[14px] font-semibold text-ink">Nenhum baralho importado ainda</p>
          <p className="text-[12px] text-ink-muted max-w-xs">
            Traga um baralho pronto do Anki para começar sem depender de captura.
          </p>
          <button
            onClick={onImportar}
            className="py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn cursor-pointer flex items-center gap-2 mt-1"
          >
            <PlusCircle className="w-4 h-4" /> Trazer meu primeiro baralho
          </button>
        </div>
      )}

      {!erro && !carregando && baralhos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {baralhos.map((deck) => (
            <li key={deck.id}>
              <CartaoDeBaralho
                deck={deck}
                ativando={ativando === deck.id}
                ocupado={ocupado === deck.id}
                aberto={aberto === deck.id}
                onAbrir={() => setAberto((a) => (a === deck.id ? null : deck.id))}
                onAtivarMais={() => void ativarMais(deck)}
                onDesativar={() => void desativar(deck)}
                onPedirPurga={() => setConfirmarPurga(deck)}
                onJogarCom={onJogarCom}
              />
            </li>
          ))}
        </ul>
      )}

      {deckAberto && (
        <DetalheDoBaralho deck={deckAberto} onFechar={() => setAberto(null)} />
      )}

      {confirmarPurga && (
        <DialogoDePurga
          deck={confirmarPurga}
          ocupado={ocupado === confirmarPurga.id}
          onCancelar={() => setConfirmarPurga(null)}
          onConfirmar={() => void purgar(confirmarPurga)}
        />
      )}
    </div>
  )
}

// ───────────────────────────── cartão de baralho ─────────────────────────────

function CartaoDeBaralho({
  deck, ativando, ocupado, aberto, onAbrir, onAtivarMais, onDesativar, onPedirPurga, onJogarCom,
}: {
  deck: BaralhoAnkiResumo
  ativando: boolean
  ocupado: boolean
  aberto: boolean
  onAbrir: () => void
  onAtivarMais: () => void
  onDesativar: () => void
  onPedirPurga: () => void
  onJogarCom?: (deckId: string, nome: string, lang?: string) => void
}) {
  // Quantas dá pra ativar agora: o que não está ativo, nem descartado, nem ausente.
  const restantes = Math.max(0, deck.total - deck.ativas - deck.descartadas - deck.ausentes)

  return (
    <div className="card-panel p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onAbrir} className="flex-1 text-left flex items-start gap-2 cursor-pointer group">
          <ChevronRight className={`w-4 h-4 mt-0.5 text-ink-muted shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} />
          <div>
            <p className="font-semibold text-[14px] text-ink group-hover:text-accent">{deck.nome}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">
              {deck.idiomaOrigem && deck.idiomaAlvo
                ? (deck.idiomaOrigem === deck.idiomaAlvo
                    ? `${deck.idiomaOrigem} · ensina por definição`
                    : `${deck.idiomaOrigem} → ${deck.idiomaAlvo}`)
                : deck.arquivoOrigem}
              {' · '}{fmtData(deck.createdAt)}
              {deck.estado === 'desativado' && <span className="badge-tag warn ml-1.5">desativado</span>}
            </p>
          </div>
        </button>
      </div>

      {/* O SALDO: ativadas de total, e as duas pilhas separadas — nunca somadas, nunca a mesma cor. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
        <span title="Notas do arquivo do Anki. Uma nota pode virar mais de um cartão na sua fila.">
          <b className="text-ink">{deck.ativas}</b> de <b className="text-ink">{deck.total}</b> notas ativadas
        </span>
        {deck.descartadas > 0 && (
          <span className="badge-tag err" title="A régua de qualidade recusou estas notas. Dá pra corrigir o mapeamento e reimportar.">
            {deck.descartadas} descartadas
          </span>
        )}
        {deck.ausentes > 0 && (
          <span className="badge-tag acc" title="Estas notas sumiram do arquivo no último import. É histórico do baralho, não defeito.">
            {deck.ausentes} ausentes
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Botão morto é pior que botão ausente — se não há mais nada a ativar, ele simplesmente some. */}
        {restantes > 0 && (
          <button
            onClick={onAtivarMais}
            disabled={ativando}
            className="py-1.5 px-3 bg-accent hover:bg-accent-ink text-white rounded-lg font-bold text-[12px] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {ativando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {ativando ? 'ativando…' : `Ativar mais ${Math.min(restantes, 300)}`}
          </button>
        )}
        {/* JOGAR SÓ COM ESTE — a porta existe aqui porque é aqui que a pessoa está olhando os
            baralhos e sabe qual quer. Só aparece com nota ativa: um baralho sem nada ativado não
            tem com que jogar, e o botão levaria a uma rodada vazia. */}
        {onJogarCom && deck.estado === 'ativo' && deck.ativas > 0 && (
          <button
            onClick={() => onJogarCom(deck.id, deck.nome, deck.idiomaOrigem ?? undefined)}
            className="py-1.5 px-3 bg-canvas border border-border-subtle hover:border-accent text-ink rounded-lg font-semibold text-[12px] cursor-pointer flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" /> Jogar só com este
          </button>
        )}
        {deck.estado === 'ativo' && (
          <button
            onClick={onDesativar}
            disabled={ocupado}
            className="py-1.5 px-3 bg-canvas border border-border-subtle hover:border-ink-muted text-ink rounded-lg font-semibold text-[12px] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <PowerOff className="w-3.5 h-3.5" /> Desativar
          </button>
        )}
        <button
          onClick={onPedirPurga}
          disabled={ocupado}
          className="py-1.5 px-3 text-error-ink hover:bg-error-soft rounded-lg font-semibold text-[12px] disabled:opacity-50 cursor-pointer flex items-center gap-1.5 ml-auto"
        >
          <Trash2 className="w-3.5 h-3.5" /> Purgar
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────── detalhe: notas paginadas ─────────────────────────────

function DetalheDoBaralho({ deck, onFechar }: { deck: BaralhoAnkiResumo; onFechar: () => void }) {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [estado, setEstado] = useState<EstadoNota | 'todas'>('todas')
  const [itens, setItens] = useState<NotaAnkiDetalhe[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300)
    return () => clearTimeout(t)
  }, [busca])

  const carregar = useCallback(async (proximo: boolean, cursorAtual: string | null) => {
    setErro(null)
    if (proximo) setCarregandoMais(true); else setCarregando(true)
    try {
      const pagina = await listarNotasDoBaralho(deck.id, {
        cursor: proximo ? cursorAtual : null,
        estado: estado === 'todas' ? undefined : estado,
        busca: buscaAplicada.trim() || undefined,
        limite: 50,
      })
      setItens((antes) => (proximo ? [...antes, ...pagina.itens] : pagina.itens))
      setTotal(pagina.total)
      setCursor(pagina.proximoCursor)
    } catch (e) {
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setCarregando(false)
      setCarregandoMais(false)
    }
  }, [deck.id, estado, buscaAplicada])

  useEffect(() => { void carregar(false, null) }, [carregar])

  const temFiltro = !!busca || estado !== 'todas'

  return (
    <div className="card-panel p-4 mt-2 space-y-3 border-l-4 border-accent">
      <div className="flex items-center justify-between">
        <span className="label-mono">notas de "{deck.nome}"</span>
        <button onClick={onFechar} className="text-ink-muted hover:text-ink cursor-pointer" aria-label="Fechar detalhe">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            className="field-input pl-8 w-full"
            placeholder="Buscar nota…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar nota no baralho"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS_ESTADO.map((f) => (
          <button
            key={f.id}
            onClick={() => setEstado(f.id)}
            className={`kpi-pill ${estado === f.id ? 'active' : ''}`}
            aria-pressed={estado === f.id}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-ink-muted">
        {carregando ? 'carregando…' : `mostrando ${itens.length} de ${total}`}
      </div>

      {erro && (
        <div className="rounded-xl border border-error/30 bg-error-soft/10 p-3 text-[13px]">
          <div className="flex items-start gap-2 text-error font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{erro}</p>
          </div>
          <button onClick={() => void carregar(false, null)} className="btn-solid mt-2 px-3 py-1.5 text-[12px] flex items-center gap-1.5 cursor-pointer">
            <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      {!erro && carregando && (
        <div className="space-y-1.5" aria-busy>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[40px] rounded-lg bg-canvas animate-pulse" />
          ))}
        </div>
      )}

      {!erro && !carregando && itens.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Inbox className="w-5 h-5 text-ink-muted" />
          <p className="text-[13px] font-semibold text-ink">{temFiltro ? 'Nada com esses filtros' : 'Este baralho não tem notas'}</p>
        </div>
      )}

      {!erro && !carregando && itens.length > 0 && (
        <div className="custom-scrollbar overflow-y-auto max-h-[360px] rounded-lg border border-border-subtle">
          <ul>
            {itens.map((n) => <LinhaDeNota key={n.id} nota={n} />)}
          </ul>
          {cursor && (
            <div className="flex items-center justify-center py-2">
              <button
                onClick={() => void carregar(true, cursor)}
                disabled={carregandoMais}
                className="text-[12px] text-accent hover:underline disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {carregandoMais && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {carregandoMais ? 'carregando…' : 'carregar mais'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LinhaDeNota({ nota }: { nota: NotaAnkiDetalhe }) {
  const selo = nota.estado === 'descartada'
    ? <span className="badge-tag err" title={nota.motivoDescarte ?? undefined}>descartada</span>
    : nota.estado === 'arquivada'
      ? <span className="badge-tag warn">arquivada</span>
      : <span className="badge-tag ok">ativa</span>
  return (
    <li className="px-3 py-2 flex items-center gap-3 text-left border-b border-border-subtle last:border-0">
      <span className="font-semibold text-[13px] text-ink truncate w-[26%]">{nota.frente}</span>
      <span className="text-[12px] text-ink-muted truncate flex-1">{nota.verso || <span className="opacity-60">sem tradução</span>}</span>
      {selo}
    </li>
  )
}

// ───────────────────────────── purga: confirmação explícita ─────────────────────────────

function DialogoDePurga({
  deck, ocupado, onCancelar, onConfirmar,
}: {
  deck: BaralhoAnkiResumo
  ocupado: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  // A trava não é decorativa: `purgarBaralho` só manda `confirmar: true` quando esta tela chamou
  // `onConfirmar` — o próprio clique aqui É a confirmação explícita que o servidor exige.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="card-panel bg-surface p-5 max-w-sm w-full space-y-3">
        <div className="flex items-start gap-2 text-error font-semibold text-[14px]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Apagar "{deck.nome}"?</p>
        </div>
        <p className="text-[12px] text-ink-muted leading-relaxed">
          As {deck.total} notas deste baralho saem do seu vocabulário e não voltam. O histórico de
          revisão que você já fez com elas <b>não é apagado</b> — só o baralho.
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancelar} disabled={ocupado} className="py-1.5 px-3 text-ink-muted hover:text-ink text-[12px] font-semibold cursor-pointer disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={ocupado}
            className="py-1.5 px-3 bg-error text-white hover:opacity-90 rounded-lg font-bold text-[12px] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {ocupado ? 'apagando…' : 'Apagar de vez'}
          </button>
        </div>
      </div>
    </div>
  )
}
