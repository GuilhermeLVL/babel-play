/**
 * AS ANOTAÇÕES DO LEITOR (montadas em `/api/leitura`; L2 de `docs/specs/2026-10-26-livros-e-leitura.md`).
 * Grátis em todo plano: grifos, notas e palavras são dado de estudo, como o deck.
 *
 *   GET    /anotacoes?livroId=&cursor=  uma página (até 2000) das da pessoa, com lápides, escritas no servidor
 *                                        depois do `cursor` (`<sincronizado_em>:<id>`); devolve `cursor` e `temMais`
 *   POST   /anotacoes/lote { anotacoes } grava até 200 (última escrita vence); devolve as que valem
 *   DELETE /anotacoes/:id                lápide numa anotação DA PESSOA (404 para id alheio ou inexistente)
 *   GET    /chave                        a chave da pessoa para o id do livro TRAZIDO (`arq:`), ver abaixo
 *
 * O cliente não é confiável: cada anotação passa por `validarAnotacao(..., { estrito: true })` — a mesma
 * regra do cliente, com a citação recusada acima de 500 caracteres (o servidor não vira cópia da obra).
 * O arquivo do livro nunca chega aqui. Sem conta (modo efêmero), o cliente não chama a rota: as
 * anotações ficam no aparelho.
 */
import { createHmac } from 'node:crypto'

import { Router } from 'express'
import { z } from 'zod'

import { type AnotacaoDeLeitura, ehLivroId, validarAnotacao } from '../../src/core/leitura/anotacao'
import {
  anotacoesDeLeituraRepo,
  cursorDoTexto,
  cursorParaTexto,
  TETOS_DAS_ANOTACOES,
} from '../db/repositories/anotacoesDeLeitura'
import { responderErro } from '../lib/respostaDeErro'
import { idParamSchema } from '../validation'

/** Quantas anotações num lote. A tela manda uma por gesto; a fila de quem ficou sem rede, até isto. */
export const MAX_POR_LOTE = 200

const consultaSchema = z
  .object({
    livroId: z.string().max(120).optional(),
    cursor: z.string().max(100).optional(),
  })
  .strip()

export const leituraRouter = Router()

leituraRouter.get('/anotacoes', async (req, res) => {
  const q = consultaSchema.safeParse(req.query)
  const cursor = q.success && q.data.cursor ? cursorDoTexto(q.data.cursor) : null
  if (!q.success || (q.data.livroId != null && !ehLivroId(q.data.livroId)) || (q.data.cursor != null && !cursor)) {
    responderErro(res, 400, 'consulta inválida', 'consulta_invalida')
    return
  }
  const pagina = await anotacoesDeLeituraRepo.listar(req.userId, { livroId: q.data.livroId, cursor })
  res.json({
    anotacoes: pagina.anotacoes,
    cursor: pagina.cursor ? cursorParaTexto(pagina.cursor) : null,
    temMais: pagina.temMais,
  })
})

/**
 * A CHAVE DO ID DO LIVRO TRAZIDO. O id local de um arquivo da pessoa é o hash do conteúdo (`arq:<sha-256>`):
 * mandado assim, o banco ligaria a pessoa a um arquivo conhecido (o hash de um EPUB que circula por aí). O
 * cliente manda `arq:<HMAC-SHA256(chave, sha)>`, e a chave é DERIVADA AQUI, por pessoa, da chave de hash do
 * servidor (`obterChaveDeHash`, de `SECRET_KEY`): a mesma em todo aparelho da pessoa (as anotações se encontram)
 * e fora do banco (um vazamento do banco não revela o hash). Escolha registrada em
 * `docs/specs/2026-10-26-livros-e-leitura.md` (notas da L2).
 */
leituraRouter.get('/chave', async (req, res) => {
  const { obterChaveDeHash } = await import('../crypto')
  const chave = createHmac('sha256', obterChaveDeHash()).update(`leitura:livro:${req.userId}`).digest('hex')
  res.setHeader('Cache-Control', 'private, no-store')
  res.json({ chave })
})

leituraRouter.post('/anotacoes/lote', async (req, res) => {
  const lista = (req.body as { anotacoes?: unknown } | undefined)?.anotacoes
  if (!Array.isArray(lista) || lista.length === 0) {
    responderErro(res, 400, 'lote vazio', 'lote_vazio')
    return
  }
  if (lista.length > MAX_POR_LOTE) {
    responderErro(res, 413, `no máximo ${MAX_POR_LOTE} anotações por lote`, 'lote_grande')
    return
  }
  const agora = Date.now()
  const validas: AnotacaoDeLeitura[] = []
  const ids = new Set<string>()
  for (const [i, bruta] of lista.entries()) {
    const v = validarAnotacao(bruta, { estrito: true, agora })
    if (v.ok === false) {
      responderErro(res, 400, `anotação ${i}: ${v.erro}`, v.code, { indice: i })
      return
    }
    // Duas versões da mesma anotação no mesmo lote: vale a mais nova (a ordem do lote não decide).
    if (ids.has(v.anotacao.id)) {
      const j = validas.findIndex((a) => a.id === v.anotacao.id)
      if (
        Math.max(v.anotacao.atualizadoEm, v.anotacao.apagadoEm ?? 0) >
        Math.max(validas[j].atualizadoEm, validas[j].apagadoEm ?? 0)
      ) {
        validas[j] = v.anotacao
      }
      continue
    }
    ids.add(v.anotacao.id)
    validas.push(v.anotacao)
  }
  const r = await anotacoesDeLeituraRepo.gravarLote(req.userId, validas)
  res.json({ ...r, tetos: TETOS_DAS_ANOTACOES })
})

leituraRouter.delete('/anotacoes/:id', async (req, res) => {
  const p = idParamSchema.safeParse(req.params)
  if (!p.success) {
    responderErro(res, 400, 'id inválido', 'id_invalido')
    return
  }
  const apagou = await anotacoesDeLeituraRepo.apagar(req.userId, p.data.id)
  if (!apagou) {
    responderErro(res, 404, 'anotação não encontrada', 'nao_encontrada')
    return
  }
  res.json({ ok: true })
})
