/**
 * OS MANIFESTOS DOS LIVROS PD NO SERVIDOR (`public/catalogo/manifestos/<id>.json`, `src/core/livros/manifesto.ts`):
 * o parceiro de leitura confere que TODO trecho do pedido é um parágrafo do livro do catálogo antes de dar o teto do
 * catálogo e o cache compartilhado. Sem manifesto (Wikisource, livro sem arquivo local na geração), ou com um trecho
 * que não casa, o texto vale como "não conferido" — o teto do livro trazido, sem cache.
 *
 * ESTÁTICOS, FORA DO BUNDLE (~4,5 MB somados): no Worker, pelo binding `ASSETS` (ligado pelo `worker.ts`, como o R2);
 * no Node, do disco (`dist/` do build, senão `public/`). Lidos sob demanda, com um LRU pequeno em memória; falha de
 * leitura é "sem manifesto" (nunca derruba o pedido — só tira o teto maior e o cache).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { hashDoTrecho, lerManifesto, normalizarParaManifesto } from '../../../src/core/livros/manifesto'
import { ehWorker } from '../../lib/runtime'

interface Assets {
  fetch(request: Request): Promise<Response>
}

let assets: Assets | null = null
/** Liga o binding `ASSETS` do Worker (idempotente). No Node ninguém liga e vale o disco. */
export function ligarAssetsDoParceiro(a: Assets | null): void {
  assets = a
}

const MAX_EM_MEMORIA = 24
const lidos = new Map<string, Promise<ReadonlySet<string> | null>>()
let deTeste: Map<string, ReadonlySet<string>> | null = null

async function buscar(livroId: string): Promise<ReadonlySet<string> | null> {
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(livroId)) return null
  const caminho = `catalogo/manifestos/${livroId}.json`
  try {
    if (assets) {
      const r = await assets.fetch(new Request(`https://assets.local/${caminho}`))
      return r.ok ? lerManifesto(await r.json(), livroId) : null
    }
    if (ehWorker()) return null
    for (const base of ['dist', 'public']) {
      const texto = await readFile(join(process.cwd(), base, caminho), 'utf8').catch(() => null)
      if (texto) return lerManifesto(JSON.parse(texto), livroId)
    }
    return null
  } catch {
    return null
  }
}

async function manifesto(livroId: string): Promise<ReadonlySet<string> | null> {
  if (deTeste) return deTeste.get(livroId) ?? null
  let p = lidos.get(livroId)
  if (!p) {
    p = buscar(livroId)
    lidos.set(livroId, p)
    while (lidos.size > MAX_EM_MEMORIA) lidos.delete(lidos.keys().next().value as string)
  }
  return p
}

/**
 * O texto do pedido é do livro? Todo trecho tem de ser um parágrafo do manifesto, e a seleção tem de estar dentro de
 * um dos trechos (ou ser ela mesma um parágrafo). Sem trecho nenhum, só a seleção inteira como parágrafo conta.
 */
export async function textoConferido(
  livroId: string,
  trechos: readonly { texto: string }[],
  selecao: string,
): Promise<boolean> {
  const m = await manifesto(livroId)
  if (!m) return false
  for (const t of trechos) if (!m.has(await hashDoTrecho(t.texto))) return false
  if (!selecao) return trechos.length > 0
  const s = normalizarParaManifesto(selecao)
  return trechos.some((t) => normalizarParaManifesto(t.texto).includes(s)) || m.has(await hashDoTrecho(selecao))
}

/** SÓ PARA TESTES: os manifestos por id (`null` volta ao estático). */
export function trocarManifestosParaTeste(m: Record<string, readonly string[]> | null): void {
  deTeste = m ? new Map(Object.entries(m).map(([id, hashes]) => [id, new Set(hashes)])) : null
  lidos.clear()
}
