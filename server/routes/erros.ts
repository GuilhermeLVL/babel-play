/**
 * ERROS DO CLIENTE — a metade que faltava do laço de observabilidade (E4).
 *
 * O QUE ISTO FECHA. O servidor sempre teve logger com allowlist, requestId ponta a ponta e diário
 * em disco. O NAVEGADOR não tinha nada: erro de render ia para o console do usuário e morria lá
 * (`ErroDaTela.tsx` admitia isso em comentário), e rejeição de promise nem isso. O dono ficava
 * sabendo dos erros de produção por reclamação — o pior canal possível.
 *
 * O QUE ELE NÃO É. Não é analytics nem telemetria de uso: a postura documentada do projeto
 * (`Settings.tsx` — "não existe nenhuma telemetria implementada") continua valendo. Só ERRO chega
 * aqui, com campos em allowlist e truncados — nada de payload do usuário, nada de texto de fala.
 *
 * O relatório entra no MESMO funil dos erros do servidor (logger → diário em disco), então o mesmo
 * `GET /api/admin/erros` lê os dois lados.
 */
import { Router } from 'express'
import { z } from 'zod'

import { log } from '../lib/logger'
import { parseOr400 } from '../validation'

export const errosRouter = Router()

/** Campos CURTOS de propósito: o diário é linha JSON, e stack inteira de bundle minificado é ruído. */
const relatorioSchema = z.object({
  /** Um id gerado no cliente e MOSTRADO ao usuário — é o que ele cita no suporte. */
  id: z.string().regex(/^[a-z0-9-]{6,40}$/),
  mensagem: z.string().min(1).max(300),
  /** Primeira linha útil da stack, se houver. */
  origem: z.string().max(200).optional(),
  /** Rota da SPA onde aconteceu (pathname, sem query — o cliente já poda). */
  tela: z.string().max(80).optional(),
  tipo: z.enum(['render', 'promise', 'erro-global']),
}).strip()

/**
 * Teto simples por usuário em memória: um cliente em laço de erro (render que quebra, conserta e
 * quebra de novo) reportaria centenas por minuto — e o diário viraria o próprio incidente.
 * Estado por processo é suficiente: o objetivo é conter avalanche, não contabilidade exata.
 */
const janelaMs = 60_000
const maxPorJanela = 10
const janelas = new Map<string, { inicio: number; n: number }>()
function dentroDoTeto(chave: string): boolean {
  const agora = Date.now()
  const j = janelas.get(chave)
  if (!j || agora - j.inicio > janelaMs) {
    janelas.set(chave, { inicio: agora, n: 1 })
    if (janelas.size > 5_000) janelas.clear() // nunca cresce sem limite
    return true
  }
  j.n += 1
  return j.n <= maxPorJanela
}

errosRouter.post('/', (req, res) => {
  const r = parseOr400(relatorioSchema, req.body, res)
  if (!r) return
  if (!dentroDoTeto(String(req.userId))) {
    // 202 mesmo assim: o cliente não deve reagir a isto — reagir a erro de reporte gera mais reporte.
    res.status(202).json({ ok: true })
    return
  }
  /* O relatório vira uma linha do MESMO logger dos erros de servidor. `error` carrega mensagem +
     origem (o formato compacto que cabe na allowlist); `route` carrega a tela da SPA. */
  log('error', {
    event: 'erro_do_cliente',
    route: r.tela ?? '',
    provider: r.tipo,
    error: `${r.id} · ${r.mensagem}${r.origem ? ` · ${r.origem}` : ''}`.slice(0, 400),
    requestId: req.requestId,
  })
  res.status(202).json({ ok: true })
})
