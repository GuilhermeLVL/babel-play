/**
 * CLIENTE DA BIBLIOTECA DE BARALHOS ANKI (`/api/anki/*`).
 *
 * Arquivo IRMÃO de `src/data/api.ts` — mesmo padrão de `apiFetch` (timeout, header de auth) e
 * mesma postura defensiva: quem lê aqui já sabe distinguir "carregando" de "erro" de "vazio", e
 * por isso as funções de LEITURA aqui **lançam** em vez de engolir em `[]`/`null`. Silenciar o
 * erro faria "baralho vazio" e "servidor fora do ar" parecerem a mesma coisa outra vez — o mesmo
 * defeito que `CatalogoDePalavras.tsx` documenta ter corrigido no vocabulário.
 *
 * As rotas em si são de outro agente (`server/routes/anki.ts` e afins); este arquivo só fala o
 * contrato combinado, sem tocar nelas.
 */
import type { EstadoDeNotaAnki, FiltroDeNotaAnki } from '@core'

import { type NotaAnki, TETOS_DA_NOTA as TETOS } from '../core/anki'
import { apiFetch, IMPORT_TIMEOUT_MS, lerErro } from './api'

// ───────────────────────────── tipos do contrato ─────────────────────────────

export type EstadoBaralho = 'ativo' | 'desativado'

export interface BaralhoAnkiResumo {
  id: string
  nome: string
  arquivoOrigem: string
  estado: EstadoBaralho
  idiomaOrigem: string | null
  idiomaAlvo: string | null
  createdAt: number
  /** Total de notas que o import leu do arquivo. */
  total: number
  /** Já ativadas no vocabulário — entraram nas rodadas. */
  ativas: number
  /**
   * A régua de qualidade RECUSOU. É acionável: quem importou pode corrigir o mapeamento e tentar
   * de novo. NUNCA some com `ausentes` — são causas diferentes e pedem reações diferentes.
   */
  descartadas: number
  /**
   * A nota SUMIU do arquivo no último reimport. É história do baralho (a pessoa editou o Anki),
   * não defeito daqui — não há nada para "consertar".
   */
  ausentes: number
}

/**
 * O ESTADO VEM DO CONTRATO, nao de uma copia local (auditoria de 2026-09-07, achado A21).
 *
 * Esta linha declarava `'ativa' | 'arquivada' | 'descartada'` enquanto o servidor guardava
 * `'ativa' | 'arquivada' | 'ausente_no_arquivo'`: filtrar por "Descartadas" respondia 400 e
 * "ausente no arquivo" nao existia para a tela. `descartada` continua sendo oferecida como
 * FILTRO — ela e o recorte de quem tem motivo de descarte, e a distincao entre "a regua recusou"
 * e "sumiu do arquivo" e a que a tela precisa mostrar.
 */
export type EstadoNota = EstadoDeNotaAnki
export type FiltroDeEstado = FiltroDeNotaAnki

export interface NotaAnkiDetalhe {
  id: string
  guid: string
  frente: string
  verso: string
  exemplo: string | null
  tags: string[]
  estado: EstadoNota
  motivoDescarte: string | null
  notetype: string | null
}

export interface PaginaDeNotas {
  itens: NotaAnkiDetalhe[]
  proximoCursor: string | null
  total: number
}

export interface ResultadoAtivar {
  ativadas: number
  restantes: number
}


// ───────────────────────────── leitura ─────────────────────────────

/** Lista os baralhos importados. Lança em falha — a tela decide o que fazer (erro com retry). */
export async function listarBaralhosAnki(): Promise<BaralhoAnkiResumo[]> {
  const res = await apiFetch('/api/anki/decks')
  if (!res.ok) throw new Error(`não consegui carregar os baralhos (HTTP ${res.status})`)
  return (await res.json()) as BaralhoAnkiResumo[]
}

export interface FiltroNotas {
  cursor?: string | null
  estado?: FiltroDeEstado
  busca?: string
  limite?: number
}

/** Página de notas de um baralho, filtrável e paginada por cursor — mesmo formato do `CatalogoDePalavras`. */
export async function listarNotasDoBaralho(deckId: string, filtro: FiltroNotas = {}): Promise<PaginaDeNotas> {
  const p = new URLSearchParams()
  if (filtro.cursor) p.set('cursor', filtro.cursor)
  if (filtro.estado) p.set('estado', filtro.estado)
  if (filtro.busca?.trim()) p.set('busca', filtro.busca.trim())
  p.set('limite', String(filtro.limite ?? 50))
  const qs = p.toString()
  const res = await apiFetch(`/api/anki/decks/${deckId}/notas${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`não consegui carregar as notas (HTTP ${res.status})`)
  return (await res.json()) as PaginaDeNotas
}


// ───────────────────────────── ações ─────────────────────────────

/** Ativa até `limite` notas pendentes do baralho. Sem `limite`, o servidor decide o teto padrão. */
export async function ativarNotasDoBaralho(deckId: string, limite?: number): Promise<ResultadoAtivar> {
  const res = await apiFetch(`/api/anki/decks/${deckId}/ativar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limite != null ? { limite } : {}),
  })
  if (!res.ok) throw new Error(`não consegui ativar as notas (HTTP ${res.status})`)
  return (await res.json()) as ResultadoAtivar
}

/** Tira o baralho das rodadas sem apagar nada — ação padrão, reversível. */
export async function desativarBaralho(deckId: string): Promise<void> {
  const res = await apiFetch(`/api/anki/decks/${deckId}/desativar`, { method: 'POST' })
  if (!res.ok) throw new Error(`não consegui desativar o baralho (HTTP ${res.status})`)
}

/**
 * PURGA — destrutiva. Exige `confirmar: true` explícito: é a mesma trava que `excluirConta` usa
 * em `data/api.ts`, para que um DELETE nunca saia por engano com corpo vazio.
 */
export async function purgarBaralho(deckId: string): Promise<{ notasApagadas: number }> {
  const res = await apiFetch(`/api/anki/decks/${deckId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmar: true }),
  })
  if (!res.ok) throw new Error(`não consegui apagar o baralho (HTTP ${res.status})`)
  return (await res.json()) as { ok: true; notasApagadas: number }
}


// ───────────────────────────── importação em lotes (`/api/anki/imports`) ─────────────────────────────
// Espelha `abrirImportAnkiSchema` / `notaRecebidaSchema` de `server/validation.ts`. Quem lê o arquivo é o
// navegador; o servidor recebe as notas em lotes (abrir → notas × N → fechar).

export interface AberturaDeImport {
  arquivo: string
  bytes: number
  formato: string
  nomeNoArquivo?: string | null
  baralhos?: string[]
  campos: string[]
  totalNoArquivo: number
  truncado: boolean
  idiomaOrigem?: string | null
  idiomaAlvo?: string | null
  /** Até 200 notas para o servidor conferir o idioma e detectar baralho monolíngue. */
  amostra: Array<{ frente: string; verso: string }>
}

export interface ImportAberto {
  importId: string
  deckId: string
  idiomaOrigem: string | null
  /** Só quando o idioma declarado e a escrita da amostra se contradisseram. */
  avisoIdioma?: string
}

export interface ResumoDoLote {
  novas: number
  atualizadas: number
  iguais: number
  descartadas: number
  porMotivo: Record<string, number>
}

export interface FechamentoDeImport {
  importId: string
  deckId: string
  resumo: ResumoDoLote & { ativadas: number; notas: number }
  /** A primeira leva não virou cartão jogável; o import em si NÃO foi desfeito. */
  erroDeAtivacao?: string
  code?: string
}

/** 429 do limitador de lotes: `segundos` vem do `Retry-After` (ou `null` se o cabeçalho faltou). */
export class LimiteDeLotes extends Error {
  constructor(
    mensagem: string,
    readonly segundos: number | null,
  ) {
    super(mensagem)
    this.name = 'LimiteDeLotes'
  }
}

async function jsonOuErro<T>(res: Response, padrao: string): Promise<T> {
  if (res.ok) return (await res.json()) as T
  const e = await lerErro(res)
  const mensagem = e.error || padrao
  if (res.status === 429) {
    const s = Number(res.headers?.get?.('Retry-After'))
    throw new LimiteDeLotes(mensagem, Number.isFinite(s) && s > 0 ? s : null)
  }
  throw new Error(mensagem)
}

/** Marca de corte de um campo bruto — conta DENTRO do teto, para o valor final caber nele. */
const MARCA_DE_CORTE = '…[cortado]'

function cortarBruto(valor: string): string {
  return valor.length <= TETOS.campoBruto ? valor : valor.slice(0, TETOS.campoBruto - MARCA_DE_CORTE.length) + MARCA_DE_CORTE
}

/**
 * A nota como o schema do servidor a quer: `campos` e `camposBrutos` obrigatórios, `guid` só quando há.
 *
 * O CLIENTE CORTA NOS TETOS (`TETOS_DA_NOTA`, a mesma fonte do `notaRecebidaSchema`): `montarNota`
 * nunca corta, e um baralho real tem verso de 2.600 caracteres ou campo bruto de 21 KB. Sem o corte o
 * lote voltava 400 e o import morria no meio, preso em `gravando` — a importação nunca pode morrer
 * por tamanho. O servidor continua RECUSANDO acima dos tetos porque o cliente não é confiável.
 */
export function notaParaOFio(n: NotaAnki): Record<string, unknown> {
  const camposBrutos: Record<string, string> = {}
  for (const [nome, valor] of Object.entries(n.camposBrutos ?? {}).slice(0, TETOS.chavesDeCamposBrutos)) {
    camposBrutos[nome.slice(0, TETOS.nomeDeCampo)] = cortarBruto(valor ?? '')
  }
  const guid = n.guid ? n.guid.slice(0, TETOS.guid) : ''
  return {
    ...(guid ? { guid } : {}),
    ...(n.notetype !== undefined ? { notetype: n.notetype.slice(0, TETOS.notetype) } : {}),
    campos: (n.campos ?? []).slice(0, TETOS.campos).map((c) => c.slice(0, TETOS.nomeDeCampo)),
    camposBrutos,
    frente: n.frente.slice(0, TETOS.frente),
    verso: n.verso.slice(0, TETOS.verso),
    ...(n.exemplo !== undefined ? { exemplo: n.exemplo.slice(0, TETOS.exemplo) } : {}),
    tags: n.tags.slice(0, TETOS.tags).map((t) => t.slice(0, TETOS.tag)),
    ...(n.midia
      ? {
          midia: {
            sons: n.midia.sons.slice(0, TETOS.midia).map((m) => m.slice(0, TETOS.nomeDeMidia)),
            imagens: n.midia.imagens.slice(0, TETOS.midia).map((m) => m.slice(0, TETOS.nomeDeMidia)),
          },
        }
      : {}),
    ...(n.lacunas
      ? {
          lacunas: n.lacunas.slice(0, TETOS.lacunas).map((l) => ({
            ordinal: l.ordinal,
            resposta: l.resposta.slice(0, TETOS.lacuna),
            ...(l.dica !== undefined ? { dica: l.dica.slice(0, TETOS.lacuna) } : {}),
          })),
        }
      : {}),
  }
}

const comoJson = (corpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corpo),
})

export async function abrirImportAnki(dados: AberturaDeImport): Promise<ImportAberto> {
  const res = await apiFetch('/api/anki/imports', { ...comoJson(dados), timeoutMs: IMPORT_TIMEOUT_MS })
  return jsonOuErro<ImportAberto>(res, 'não consegui abrir a importação')
}

export async function enviarNotasDoImport(importId: string, notas: NotaAnki[]): Promise<ResumoDoLote> {
  const res = await apiFetch(`/api/anki/imports/${encodeURIComponent(importId)}/notas`, {
    ...comoJson({ notas: notas.map(notaParaOFio) }),
    timeoutMs: IMPORT_TIMEOUT_MS,
  })
  return jsonOuErro<ResumoDoLote>(res, 'não consegui enviar as notas')
}

export async function fecharImportAnki(importId: string): Promise<FechamentoDeImport> {
  const res = await apiFetch(`/api/anki/imports/${encodeURIComponent(importId)}/fechar`, {
    method: 'POST',
    timeoutMs: IMPORT_TIMEOUT_MS,
  })
  return jsonOuErro<FechamentoDeImport>(res, 'não consegui concluir a importação')
}
