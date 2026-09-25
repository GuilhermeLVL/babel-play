/**
 * `GET /api/flags` — PÚBLICA, montada ANTES do `authMiddleware` (Fase 6b).
 *
 * Pública porque quem mais precisa dela ainda não tem conta: o cliente anônimo (servidor em
 * memória, `src/data/efemero`) e o convidado da Fase 7. O token é OPCIONAL: se vier e for válido,
 * o plano sai da assinatura; se não vier — ou vier inválido —, a pessoa é `convidado`. Token
 * inválido aqui não responde 401 (não há o que proteger, e um 401 em rota pública só ensinaria a
 * adivinhar token): a resposta é a de quem não tem conta.
 *
 * O QUE SAI: `{ flags: { <chave>: { ligada, payload? } } }` — o resultado avaliado, nunca as regras,
 * as listas de ids, o percentual nem a descrição (`src/core/flags.ts`, `avaliarFlags`).
 *
 * CACHE: `private, max-age=30` (o TTL do servidor) e `ETag` do corpo; a revalidação com
 * `If-None-Match` responde 304 sem corpo (o Express compara no `res.json`). `Vary` nos cabeçalhos
 * que mudam o resultado, para nenhum cache intermediário servir a flag de um para outro.
 */
import { createHash } from 'node:crypto'

import type { Request, RequestHandler, Response } from 'express'

import type { UserId } from '../lib/authContext'
import {
  avaliarParaContexto,
  CABECALHO_DA_INSTALACAO,
  CABECALHO_DA_VERSAO_DO_CLIENTE,
  CABECALHO_DO_IDIOMA,
  contextoDoRequest,
} from '../lib/flags'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'

const BEARER = /^Bearer\s+(.+)$/i

/** `verificar` é o mesmo verificador do `authMiddleware` (injetável nos testes). */
export function criarRotaDeFlags(verificar: (token: string) => Promise<UserId>): RequestHandler {
  return async function rotaDeFlags(req: Request, res: Response): Promise<void> {
    try {
      let userId: string | null = null
      const m = BEARER.exec(req.header('authorization') ?? '')
      if (m) {
        try {
          userId = await verificar(m[1])
        } catch {
          userId = null // token inválido/expirado: responde como a quem não tem conta
        }
      }
      const flags = await avaliarParaContexto(await contextoDoRequest(req, userId))
      const corpo = { flags }
      const etag = `W/"${createHash('sha1').update(JSON.stringify(corpo)).digest('base64url').slice(0, 22)}"`
      res.setHeader('Cache-Control', 'private, max-age=30')
      res.setHeader(
        'Vary',
        ['Authorization', CABECALHO_DA_INSTALACAO, CABECALHO_DO_IDIOMA, CABECALHO_DA_VERSAO_DO_CLIENTE].join(', '),
      )
      res.setHeader('ETag', etag)
      res.json(corpo)
    } catch (err) {
      log('error', { event: 'flags_leitura_falhou', error: String((err as Error)?.message || err).slice(0, 160) })
      // 503: o cliente mantém o último valor conhecido (e, sem ele, trata tudo como desligado).
      responderErro(res, 503, 'flags indisponíveis', 'flags_indisponiveis')
    }
  }
}
