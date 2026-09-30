/**
 * AS ROTAS DO GLOSSÁRIO PESSOAL (D3 da Fase D) — montadas em `server/routes/ai.ts`:
 *
 *   GET    /api/ai/glossario        as entradas da pessoa (qualquer plano: quem deixou de pagar ainda
 *                                   vê e apaga o que é dela — é dado dela, LGPD art. 18);
 *   POST   /api/ai/glossario        grava "sempre traduzir assim" — só com `traducaoNuance`, pelo
 *                                   ENTITLEMENT e não pelo nome do plano (402 `exige_nuance`);
 *                                   teto de 500 (409 `glossario_cheio`);
 *   DELETE /api/ai/glossario/:id    apaga uma entrada DA PESSOA (404 para id alheio ou inexistente:
 *                                   a resposta não confirma que o id existe).
 *
 * Toda gravação esquece a memória curta da leitura por pedido (`glossarioDoPedido`), para a próxima
 * legenda já usar a escolha nova.
 */
import type { Request, Response } from 'express'

import { type EntradaDoGlossario, glossarioRepo } from '../db/repositories/glossario'
import { getEntitlements, getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'
import { idParamSchema } from '../validation'
import { esquecerGlossarioEmMemoria, MAX_ENTRADAS_DO_GLOSSARIO, validarEntrada } from './glossario'

/** O que sai para o cliente: sem a chave normalizada nem a data de criação (não servem à tela). */
function publica(e: EntradaDoGlossario) {
  return {
    id: e.id,
    termo: e.termo,
    traducao: e.traducao,
    origem: e.origem,
    destino: e.destino,
    atualizadoEm: e.atualizadoEm,
  }
}

export async function listarGlossario(req: Request, res: Response): Promise<void> {
  const entradas = await glossarioRepo.listar(req.userId, MAX_ENTRADAS_DO_GLOSSARIO)
  res.json({ entradas: entradas.map(publica), limite: MAX_ENTRADAS_DO_GLOSSARIO })
}

export async function gravarNoGlossario(req: Request, res: Response): Promise<void> {
  /* FAIL-CLOSED como o `/mt`: erro ao ler o plano é 502, nunca uma gravação que passou direto. */
  let nuance: boolean
  try {
    nuance = getEntitlements(await getPlanForUser(req.userId)).traducaoNuance === true
  } catch (err) {
    res.status(502).json({ error: `falha ao checar o plano: ${erroDeRota(err, { event: 'glossario_erro' })}` })
    return
  }
  if (!nuance) {
    res.status(402).json({
      error: 'o glossário pessoal é da Tradução Nuance',
      code: 'exige_nuance',
      entitlement: 'traducaoNuance',
    })
    return
  }
  const v = validarEntrada(req.body)
  if (v.ok === false) {
    responderErro(res, 400, v.erro, v.code)
    return
  }
  const r = await glossarioRepo.gravar(req.userId, v.entrada, MAX_ENTRADAS_DO_GLOSSARIO)
  if (r.ok === false) {
    res.status(409).json({
      error: `o glossário guarda até ${MAX_ENTRADAS_DO_GLOSSARIO} entradas; apague alguma para fixar outra`,
      code: 'glossario_cheio',
      limite: MAX_ENTRADAS_DO_GLOSSARIO,
    })
    return
  }
  esquecerGlossarioEmMemoria(req.userId)
  res.status(r.nova ? 201 : 200).json({ entrada: publica(r.entrada) })
}

export async function apagarDoGlossario(req: Request, res: Response): Promise<void> {
  const p = idParamSchema.safeParse(req.params)
  if (!p.success) {
    responderErro(res, 400, 'id inválido', 'id_invalido')
    return
  }
  const apagou = await glossarioRepo.apagar(req.userId, p.data.id)
  if (!apagou) {
    responderErro(res, 404, 'entrada não encontrada', 'nao_encontrada')
    return
  }
  esquecerGlossarioEmMemoria(req.userId)
  res.json({ ok: true })
}
