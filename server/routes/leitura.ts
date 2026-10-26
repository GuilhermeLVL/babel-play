/**
 * AS ANOTAÇÕES DO LEITOR (montadas em `/api/leitura`; L2 de `docs/specs/2026-10-26-livros-e-leitura.md`).
 * Grátis em todo plano: grifos, notas e palavras são dado de estudo, como o deck.
 *
 *   GET    /anotacoes?livroId=&desde=   as da pessoa (com lápides), mudadas depois de `desde` (ms)
 *   POST   /anotacoes/lote { anotacoes } grava até 200 (última escrita vence); devolve as que valem
 *   DELETE /anotacoes/:id                lápide numa anotação DA PESSOA (404 para id alheio ou inexistente)
 *
 * O cliente não é confiável: cada anotação passa por `validarAnotacao(..., { estrito: true })` — a mesma
 * regra do cliente, com a citação recusada acima de 500 caracteres (o servidor não vira cópia da obra).
 * O arquivo do livro nunca chega aqui. Sem conta (modo efêmero), o cliente não chama a rota: as
 * anotações ficam no aparelho.
 */
import { Router } from 'express'
import { z } from 'zod'

import { type AnotacaoDeLeitura, ehLivroId, validarAnotacao } from '../../src/core/leitura/anotacao'
import { anotacoesDeLeituraRepo, TETOS_DAS_ANOTACOES } from '../db/repositories/anotacoesDeLeitura'
import { responderErro } from '../lib/respostaDeErro'
import { idParamSchema } from '../validation'

/** Quantas anotações num lote. A tela manda uma por gesto; a fila de quem ficou sem rede, até isto. */
export const MAX_POR_LOTE = 200

const consultaSchema = z
  .object({
    livroId: z.string().max(120).optional(),
    desde: z.coerce.number().int().min(0).optional(),
  })
  .strip()

export const leituraRouter = Router()

leituraRouter.get('/anotacoes', async (req, res) => {
  const q = consultaSchema.safeParse(req.query)
  if (!q.success || (q.data.livroId != null && !ehLivroId(q.data.livroId))) {
    responderErro(res, 400, 'consulta inválida', 'consulta_invalida')
    return
  }
  const agora = Date.now()
  const anotacoes = await anotacoesDeLeituraRepo.listar(req.userId, q.data)
  res.json({ anotacoes, agora })
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
  const validas: AnotacaoDeLeitura[] = []
  const ids = new Set<string>()
  for (const [i, bruta] of lista.entries()) {
    const v = validarAnotacao(bruta, { estrito: true })
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
