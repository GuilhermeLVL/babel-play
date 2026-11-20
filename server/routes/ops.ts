import { timingSafeEqual } from 'node:crypto'

import { type Request, type Response, Router } from 'express'

import { coletarSaude } from '../lib/saudeDoNegocio'

/**
 * OPERAÇÃO — rotas do vigia, não do usuário. Montadas ANTES do login (como o webhook do Asaas): quem chama é o
 * workflow agendado `saude-do-negocio.yml`, que não tem JWT de ninguém. A autenticação é própria: o segredo
 * `OPS_SAUDE_TOKEN` em `Authorization: Bearer`, comparado em tempo constante. Sem o segredo configurado, 501; com o
 * errado, 401. A resposta é só checagens e contagens, nunca dado de uma pessoa.
 */
export const opsRouter = Router()

function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function saudeHandler(req: Request, res: Response): Promise<void> {
  const esperado = process.env.OPS_SAUDE_TOKEN?.trim()
  if (!esperado) {
    res.status(501).json({ error: 'vigilância não configurada', code: 'ops_nao_configurado' })
    return
  }
  const recebido = /^Bearer (.+)$/.exec(req.header('authorization') ?? '')?.[1]
  if (!tokenConfere(recebido, esperado)) {
    res.status(401).json({ error: 'não autorizado', code: 'nao_autorizado' })
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.json(await coletarSaude())
}

opsRouter.get('/saude', saudeHandler)
