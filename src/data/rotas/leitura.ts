/**
 * AS ANOTAÇÕES DO LEITOR NO SERVIDOR (`server/routes/leitura.ts`, L2 de Livros & Leitura).
 *
 * SÓ COM CONTA: sem conta (e na conta de menor à espera do responsável) as anotações ficam no aparelho
 * (`src/lib/livros/armazem.ts`) e estas funções NEM são chamadas — `podeSincronizarAnotacoes()` decide antes
 * (`tests/contratos/rotas-espelhadas.test.ts` registra o motivo). O erro volta com o `code` do servidor.
 */
import type { AnotacaoDeLeitura } from '../../core/leitura/anotacao'
import { edicaoEstatica } from '../../lib/edicaoEstatica'
import { aguardarIdentidade } from '../../lib/identidade'
import { aguardarProtecao } from '../../lib/protecaoDoMenor'
import { apiFetch, lerErro } from '../funil'

export type FalhaDaLeitura = { ok: false; status: number; error: string; code?: string }

/** Há conta liberada para guardar as anotações no servidor? */
export async function podeSincronizarAnotacoes(): Promise<boolean> {
  if (edicaoEstatica()) return false
  const id = await aguardarIdentidade()
  if (id !== 'conta' && id !== 'selfhost') return false
  if (id === 'conta' && (await aguardarProtecao())?.restrita) return false
  return true
}

async function falha(r: Response): Promise<FalhaDaLeitura> {
  const e = await lerErro(r)
  return { ok: false, status: e.status, error: e.error, code: e.code }
}
const semRede = (): FalhaDaLeitura => ({ ok: false, status: 0, error: 'não consegui falar com o servidor' })

export interface PaginaDoServidor {
  anotacoes: AnotacaoDeLeitura[]
  /** Onde a próxima página começa (`<sincronizado_em>:<id>`, o relógio do SERVIDOR). */
  cursor: string | null
  temMais: boolean
}

/** Uma página das anotações (com lápides) de um livro escritas no servidor depois do `cursor`. */
export async function lerAnotacoesDoServidor(
  livroId: string,
  cursor?: string,
): Promise<({ ok: true } & PaginaDoServidor) | FalhaDaLeitura> {
  try {
    const q = new URLSearchParams({ livroId })
    if (cursor) q.set('cursor', cursor)
    const r = await apiFetch(`/api/leitura/anotacoes?${q}`)
    if (!r.ok) return falha(r)
    const c = (await r.json()) as PaginaDoServidor
    return { ok: true, anotacoes: c.anotacoes ?? [], cursor: c.cursor ?? null, temMais: c.temMais === true }
  } catch {
    return semRede()
  }
}

/** A chave da pessoa para o id do livro trazido (`arq:`), derivada no servidor. */
export async function lerChaveDoLivro(): Promise<{ ok: true; chave: string } | FalhaDaLeitura> {
  try {
    const r = await apiFetch('/api/leitura/chave')
    if (!r.ok) return falha(r)
    const c = (await r.json()) as { chave?: unknown }
    if (typeof c.chave !== 'string' || !/^[0-9a-f]{64}$/.test(c.chave)) {
      return { ok: false, status: 502, error: 'chave inválida' }
    }
    return { ok: true, chave: c.chave }
  } catch {
    return semRede()
  }
}

export interface RespostaDoLote {
  gravadas: AnotacaoDeLeitura[]
  recusadas: Array<{ id: string; motivo: string }>
  ignoradas: string[]
}

/** Envia um lote (até 200, abaixo de 90 KB): o servidor devolve a versão que ficou valendo de cada uma. */
export async function enviarAnotacoes(lista: readonly AnotacaoDeLeitura[]): Promise<({ ok: true } & RespostaDoLote) | FalhaDaLeitura> {
  try {
    const r = await apiFetch('/api/leitura/anotacoes/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anotacoes: lista }),
    })
    if (!r.ok) return falha(r)
    return { ok: true, ...((await r.json()) as RespostaDoLote) }
  } catch {
    return semRede()
  }
}

/** Apaga (lápide) uma anotação. 404 = já não existia lá, o que para quem apaga dá no mesmo. */
export async function apagarAnotacaoNoServidor(id: string): Promise<{ ok: true } | FalhaDaLeitura> {
  try {
    const r = await apiFetch(`/api/leitura/anotacoes/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok && r.status !== 404) return falha(r)
    return { ok: true }
  } catch {
    return semRede()
  }
}
