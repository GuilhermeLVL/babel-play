/**
 * O CACHE COMPARTILHADO DO PARCEIRO DE LEITURA (L4 de Livros & Leitura; tabela `cache_do_parceiro`, migração 0014).
 *
 * SÓ LIVRO DO CATÁLOGO (domínio público) e NUNCA a pergunta livre: o que entra aqui é a resposta sobre um texto que é de
 * todos, e a primeira pessoa paga a chamada para as outras. Livro trazido pela pessoa e pergunta digitada por ela não
 * são guardados (retenção zero: é texto dela).
 *
 * A CHAVE é o SHA-256 de TUDO que vai ao prompt e muda a resposta: a versão do prompt, o livro, o hash do texto do
 * capítulo enviado, o modo, o hash da seleção, o nível, os dois idiomas, o público (adulto ou menor: o prompt do menor
 * é outro) e a ficha que foi junto. Por isso não há como envenenar: quem manda outro texto cai noutra chave, e a linha
 * só serve a quem manda exatamente o mesmo pedido — e a resposta guardada é a do NOSSO prompt, lida e validada.
 *
 * TTL de 90 dias contado da criação; teto de linhas com poda diária das menos usadas (`podarCacheDoParceiro`, job
 * `podaDoCacheDoParceiro`). Falha do banco no cache nunca derruba o pedido: ler que falha é "não está", gravar que
 * falha só loga.
 */
import { createHash } from 'node:crypto'

import type { ModoDoParceiro, RespostaDoParceiro, TrechoDoCapitulo } from '../../../src/lib/estudo/promptDoParceiro'
import type { cacheDoParceiroRepo } from '../../db/repositories/cacheDoParceiro'
import { log } from '../../lib/logger'

const DIA_MS = 86_400_000
export const TTL_DO_CACHE_DO_PARCEIRO_MS = 90 * DIA_MS
export const MAX_LINHAS_DO_CACHE_DO_PARCEIRO = 50_000

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export interface PartesDaChave {
  versaoDoPrompt: string
  livroId: string
  modo: ModoDoParceiro
  trechos: readonly TrechoDoCapitulo[]
  selecao: string
  nivel: string
  idiomaDoLivro: string
  idiomaDaPessoa: string
  menor: boolean
  ficha: string
  tituloDoCapitulo: string
}

/** A chave do cache: o hash do capítulo e o da seleção entram como hash (a chave não guarda texto). */
export function chaveDoParceiro(p: PartesDaChave): string {
  const capitulo = sha(p.trechos.map((t) => `${t.id}\u0001${t.texto}`).join('\u0002'))
  return sha(
    [
      p.versaoDoPrompt,
      p.livroId,
      capitulo,
      p.modo,
      sha(p.selecao),
      p.nivel,
      p.idiomaDoLivro.toLowerCase(),
      p.idiomaDaPessoa.toLowerCase(),
      p.menor ? 'menor' : 'adulto',
      sha(p.ficha),
      sha(p.tituloDoCapitulo),
    ].join('\u0000'),
  )
}

let repo: typeof cacheDoParceiroRepo | null = null
const repositorio = async () => (repo ??= (await import('../../db/repositories/cacheDoParceiro')).cacheDoParceiroRepo)
const mensagem = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 120)

/** A resposta guardada (e o modelo que a deu), ou `null`. */
export async function lerDoCache(
  chave: string,
  agora = Date.now(),
): Promise<{ resposta: RespostaDoParceiro; modelo: string } | null> {
  try {
    const r = repositorio()
    const linha = await (await r).ler(chave, agora - TTL_DO_CACHE_DO_PARCEIRO_MS)
    if (!linha) return null
    const resposta = JSON.parse(linha.resposta) as RespostaDoParceiro
    await (await r).marcarAcerto(chave, agora)
    return { resposta, modelo: linha.modelo }
  } catch (err) {
    log('warn', { event: 'parceiro_cache_leitura_falhou', error: mensagem(err) })
    return null
  }
}

export async function gravarNoCache(
  chave: string,
  l: { livroId: string; modo: ModoDoParceiro; modelo: string; versaoPrompt: string; resposta: RespostaDoParceiro },
  agora = Date.now(),
): Promise<void> {
  try {
    await (
      await repositorio()
    ).gravar({ chave, ...l, resposta: JSON.stringify(l.resposta), criadoEm: agora, usadoEm: agora })
  } catch (err) {
    log('warn', { event: 'parceiro_cache_gravacao_falhou', error: mensagem(err) })
  }
}

/** Uma passada de poda: vencidas (90 dias) e, acima do teto, as menos usadas. */
export async function podarCacheDoParceiro(
  o: { agora?: number; maxLinhas?: number } = {},
): Promise<{ vencidas: number; excedentes: number }> {
  const r = await repositorio()
  const vencidas = await r.apagarVencidas((o.agora ?? Date.now()) - TTL_DO_CACHE_DO_PARCEIRO_MS)
  const excedentes = await r.apagarExcedentes(o.maxLinhas ?? MAX_LINHAS_DO_CACHE_DO_PARCEIRO)
  if (vencidas + excedentes > 0) log('info', { event: 'parceiro_cache_poda', total: vencidas + excedentes })
  return { vencidas, excedentes }
}
