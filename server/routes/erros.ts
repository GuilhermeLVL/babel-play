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
import rateLimit from 'express-rate-limit'
import { z } from 'zod'

import { log } from '../lib/logger'
import { chaveDoRequest, createDbRateLimitStore, METRIC_RATELIMIT_ERROS } from '../lib/rateLimitStore'
import { parseOr400 } from '../validation'

export const errosRouter = Router()

/** Campos CURTOS de propósito: o diário é linha JSON, e stack inteira de bundle minificado é ruído. */
const relatorioSchema = z
  .object({
    /** Um id gerado no cliente e MOSTRADO ao usuário — é o que ele cita no suporte. */
    id: z.string().regex(/^[a-z0-9-]{6,40}$/),
    mensagem: z.string().min(1).max(300),
    /** Primeira linha útil da stack, se houver. */
    origem: z.string().max(200).optional(),
    /** Rota da SPA onde aconteceu (pathname, sem query — o cliente já poda). */
    tela: z.string().max(80).optional(),
    tipo: z.enum(['render', 'promise', 'erro-global']),
  })
  .strip()

/**
 * TETO POR USUÁRIO, CONTADO NO BANCO (Fase 5).
 *
 * Era um `Map` no heap com o comentário "estado por processo é suficiente: o objetivo é conter
 * avalanche, não contabilidade exata". A premissa não se sustenta desde que existem várias
 * instâncias: o `docker-compose.yml` permite réplicas e `CLUSTER_WORKERS` forka N processos na
 * mesma máquina. Cada um tinha o SEU `Map`, então o teto efetivo era 10 × N — com
 * `CLUSTER_WORKERS=3`, trinta relatórios por minuto do mesmo cliente em laço. E não é "quase
 * contido": o diário é o recurso que a avalanche consome, e ele é COMPARTILHADO (um arquivo por
 * processo, no mesmo volume, lidos juntos por `GET /api/admin/erros`).
 *
 * É o achado P1-3, o mesmo que já tinha tirado o `MemoryStore` dos outros limitadores, sobrevivendo
 * nesta rota. A regra da casa está escrita em `tests/integration/replica-sem-estado-local.test.ts`.
 *
 * REAPROVEITA O PADRÃO PRONTO em vez de contar à mão: `createDbRateLimitStore` conta em
 * `usage_counters` com `incrementAndGet` numa instrução só (sem a corrida de ler-decidir-escrever)
 * e já traz a poda dos baldes vencidos. Balde próprio (`METRIC_RATELIMIT_ERROS`) pelo achado A27 —
 * compartilhar métrica é compartilhar contador.
 *
 * `standardHeaders: false`, e isto é sobre não mentir: no modo público esta rota já passa pelo
 * `writeLimiter` (`server/http/app.ts`), que anuncia os cabeçalhos `RateLimit-*` do teto DELE (120
 * por minuto). Dois limitadores escrevendo os mesmos cabeçalhos deixam o cliente com o número de
 * um e o comportamento do outro.
 */
const tetoDeRelatorios = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: chaveDoRequest,
  store: createDbRateLimitStore(METRIC_RATELIMIT_ERROS),
  /* 202 no lugar do 429 padrão: o cliente NÃO deve reagir a isto — reagir a erro de reporte gera
     mais reporte. O contrato de resposta é o mesmo de antes da mudança. */
  handler: (_req, res) => {
    res.status(202).json({ ok: true })
  },
})

/* O teto passou a valer ANTES da validação de forma — como middleware, ele roda antes do handler,
   e antes o `Map` era consultado depois do `parseOr400`. A mudança é na direção certa: um cliente
   despejando payload inválido é a mesma avalanche, e agora ele também encontra teto. */

errosRouter.post('/', tetoDeRelatorios, (req, res) => {
  const r = parseOr400(relatorioSchema, req.body, res)
  if (!r) return
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
