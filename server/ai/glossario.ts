/**
 * O GLOSSÁRIO PESSOAL DA TRADUÇÃO NUANCE (D3 da Fase D, 30/09/2026) — a política.
 *
 * A pessoa fixa "sempre traduzir assim" (a folha da palavra, a escolha entre as "Outras formas"), e a
 * tradução passa a usar aquela escolha quando o termo aparece. O que este arquivo decide:
 *
 *   O QUE É UMA ENTRADA VÁLIDA (`validarEntrada`): termo até 80 caracteres, tradução até 120, idiomas
 *   base (`en`, `pt` — a entrada fixada em pt vale para pt-BR e pt-PT), tudo SANEADO na gravação
 *   (`sanearDoGlossario`: sem controle, sem formatação invisível, sem `<` `>`). Até 500 por pessoa.
 *
 *   QUAIS VÃO A UM PEDIDO (`escolherDoGlossario`): só as do par (destino; origem, quando conhecida)
 *   cujo termo APARECE no texto, as mais longas primeiro (as mais específicas), no máximo 12. Um
 *   glossário de 500 entradas inteiro em cada legenda custaria mais que a tradução.
 *
 *   COMO VÃO (o prompt, `src/lib/traducao/promptComunicativo.ts`): como DADO — JSON numa linha,
 *   entre os delimitadores, na mensagem do usuário, com a regra no fim do `system`. O saneamento
 *   roda de novo na montagem: uma linha gravada antes de uma regra nova não escapa dela.
 *
 *   ONDE NÃO VÃO: o resultado de uma tradução com glossário NUNCA entra no cache de tradução (L1 nem
 *   L2). Os dois são COMPARTILHADOS entre usuários — a chave não tem dono —, e a escolha de uma
 *   pessoa serviria a frase de outra. Ver `mtProxy.ts`.
 *
 * A LEITURA POR PEDIDO tem memória curta por pessoa (`glossarioDoPedido`, 60 s), esquecida a cada
 * gravação ou exclusão neste processo (uma máquina só, ADR 0006): a legenda ao vivo pede uma tradução
 * por fala, e não precisa de uma consulta ao banco por fala. Falha do banco vira glossário vazio —
 * a tradução nunca cai por causa dele.
 */
import {
  type EntradaDoGlossarioNoPrompt,
  MAX_TERMO_DO_GLOSSARIO,
  MAX_TRADUCAO_DO_GLOSSARIO,
  sanearDoGlossario,
  semRegiao,
} from '../../src/lib/traducao/promptComunicativo'
import type { EntradaDoGlossario, glossarioRepo, NovaEntrada } from '../db/repositories/glossario'
import type { UserId } from '../lib/authContext'
import { log } from '../lib/logger'

/** Até quantas entradas uma pessoa guarda. */
export const MAX_ENTRADAS_DO_GLOSSARIO = 500
/** Até quantas entradas vão a UM pedido de tradução. */
export const MAX_GLOSSARIO_POR_PEDIDO = 12

/** Código de idioma base aceito numa entrada (`en`, `pt`, `yue`). */
const IDIOMA_BASE = /^[a-z]{2,3}$/

/** A forma do termo que decide se é "o mesmo" (a chave do UNIQUE) e se ele aparece no texto. */
export function normalizarTermo(s: string): string {
  return sanearDoGlossario(s, 10_000).toLowerCase()
}

export type EntradaValidada = { ok: true; entrada: NovaEntrada } | { ok: false; erro: string; code: string }

/**
 * Valida e saneia o que o cliente mandou gravar. O saneamento NÃO corta em silêncio: termo ou
 * tradução acima do teto é recusado, para a pessoa não descobrir depois que a entrada ficou pela
 * metade.
 */
export function validarEntrada(corpo: unknown): EntradaValidada {
  const o = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const termo = sanearDoGlossario(texto(o.termo), 10_000)
  const traducao = sanearDoGlossario(texto(o.traducao), 10_000)
  const origem = semRegiao(texto(o.origem).trim())
  const destino = semRegiao(texto(o.destino).trim())
  if (!termo || !traducao) return { ok: false, erro: 'termo e tradução são obrigatórios', code: 'entrada_vazia' }
  if (termo.length > MAX_TERMO_DO_GLOSSARIO || traducao.length > MAX_TRADUCAO_DO_GLOSSARIO)
    return {
      ok: false,
      erro: `o termo vai até ${MAX_TERMO_DO_GLOSSARIO} caracteres e a tradução até ${MAX_TRADUCAO_DO_GLOSSARIO}`,
      code: 'entrada_longa',
    }
  if (!IDIOMA_BASE.test(origem) || !IDIOMA_BASE.test(destino) || origem === destino)
    return { ok: false, erro: 'idiomas de origem e destino inválidos', code: 'idiomas_invalidos' }
  return { ok: true, entrada: { origem, destino, termo, termoNorm: normalizarTermo(termo), traducao } }
}

/* Escritas sem espaço entre as palavras: ali "fronteira de palavra" não existe, e o termo vale onde
   aparecer. Nas outras, o termo só casa inteiro — "art" não pode trocar dentro de "party". */
const SEM_ESPACO =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}]/u
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O termo (normalizado) aparece no texto (normalizado)? */
export function termoAparece(textoNorm: string, termoNorm: string): boolean {
  if (!termoNorm) return false
  if (SEM_ESPACO.test(termoNorm)) return textoNorm.includes(termoNorm)
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapar(termoNorm)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(textoNorm)
}

export interface PedidoAoGlossario {
  texto: string
  src?: string | null
  tgt: string
}

/** As entradas que vão ao pedido: do par, presentes no texto, as mais longas primeiro, até 12. */
export function escolherDoGlossario(
  entradas: ReadonlyArray<Pick<EntradaDoGlossario, 'origem' | 'destino' | 'termo' | 'termoNorm' | 'traducao'>>,
  p: PedidoAoGlossario,
  max = MAX_GLOSSARIO_POR_PEDIDO,
): EntradaDoGlossarioNoPrompt[] {
  const destino = semRegiao(p.tgt)
  const origem = p.src ? semRegiao(p.src) : null
  const texto = normalizarTermo(p.texto)
  return entradas
    .filter((e) => e.destino === destino && (origem === null || e.origem === origem))
    .filter((e) => termoAparece(texto, e.termoNorm || normalizarTermo(e.termo)))
    .sort((a, b) => b.termoNorm.length - a.termoNorm.length)
    .slice(0, Math.max(0, max))
    .map((e) => ({ termo: e.termo, traducao: e.traducao }))
}

/* ── a leitura por pedido ─────────────────────────────────────────────────────────────────────── */

type Repo = typeof glossarioRepo
let repo: Repo | null = null
/* Preguiçoso, como o L2 do cache (`cacheDeTraducao.ts`): testes puros importam este módulo antes de
   apontar o banco efêmero, e importar o repositório aqui ligaria o processo ao banco errado. */
async function repositorio(): Promise<Repo> {
  repo ??= (await import('../db/repositories/glossario')).glossarioRepo
  return repo
}

const MEMORIA_MS = 60_000
const MAX_PESSOAS_NA_MEMORIA = 2_000
const memoria = new Map<string, { expira: number; entradas: EntradaDoGlossario[] }>()

/** Esquece a memória de uma pessoa (depois de gravar ou apagar) — ou de todas (testes). */
export function esquecerGlossarioEmMemoria(userId?: string): void {
  if (userId === undefined) memoria.clear()
  else memoria.delete(userId)
}

/** As entradas do glossário da pessoa que vão a ESTE pedido. Nunca lança: falha do banco = nenhuma. */
export async function glossarioDoPedido(userId: UserId, p: PedidoAoGlossario): Promise<EntradaDoGlossarioNoPrompt[]> {
  try {
    const agora = Date.now()
    let guardada = memoria.get(userId)
    if (!guardada || guardada.expira <= agora) {
      const entradas = await (await repositorio()).listar(userId, MAX_ENTRADAS_DO_GLOSSARIO)
      guardada = { expira: agora + MEMORIA_MS, entradas }
      memoria.delete(userId)
      memoria.set(userId, guardada)
      while (memoria.size > MAX_PESSOAS_NA_MEMORIA) {
        const maisAntiga = memoria.keys().next().value
        if (maisAntiga === undefined) break
        memoria.delete(maisAntiga)
      }
    }
    return guardada.entradas.length ? escolherDoGlossario(guardada.entradas, p) : []
  } catch (err) {
    log('warn', { event: 'glossario_leitura_falhou', error: String((err as Error)?.message ?? err).slice(0, 200) })
    return []
  }
}
