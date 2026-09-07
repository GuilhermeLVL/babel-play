/**
 * COBRANÇA (E3) — Asaas: assinar, cancelar, e o webhook que é a fonte da verdade do plano.
 *
 * O DESENHO EM UMA FRASE: o cliente só INICIA (`/assinar` devolve o link de pagamento do Asaas);
 * quem PROMOVE o plano é exclusivamente o webhook, quando o dinheiro de fato entra. Nenhuma
 * resposta ao cliente muda `subscriptions` — senão bastaria chamar a rota para virar Pro.
 *
 * O webhook chega SEM JWT (o Asaas não tem a sessão de ninguém): é montado FORA do authMiddleware
 * e autenticado pelo header `asaas-access-token`, comparado ao nosso segredo. O usuário do evento
 * vem do `externalReference` que NÓS gravamos ao criar a assinatura.
 *
 * Idempotência: entrega *at-least-once* → `billingEventsRepo.marcarSeNovo` (INSERT com PK do
 * evento) decide e marca numa instrução. Evento repetido = 200 sem efeito.
 */
import { Router, json } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PLAN_MATRIX, ehPlanoDeAssinatura } from '../../src/core/planos'
import { creditsRepo } from '../db/repositories/credits'
import { pacotePorSku, centavosParaReais } from '../../src/core/creditos'
import { autorizarGastoDeCredito, ehRecusa } from '../../src/core/economiaAutoridade'
import { premiumDoNivel, passeNivel, TEMPORADA_ATUAL } from '../../src/core/passe'
import { economiaDoUsuario } from '../db/repositories/metrics'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { aplicarEvento, eventoSchema, providerRefDoEvento, referenciaDoEvento } from '../lib/billingEventos'
import { asaasConfigurado, cancelarAssinatura, criarAssinatura,
  criarCobrancaAvulsa, criarCliente, primeiraCobranca, webhookToken } from '../lib/asaas'
import { parseOr400 } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'

/* ------------------------------------------------------------------ rotas do usuário (atrás do auth) */

export const billingRouter = Router()

/**
 * GASTO DE CRÉDITOS. `amount` continua no contrato para o cliente declarar o que a tela mostrou —
 * e o servidor recusa quando não bate, em vez de cobrar em silêncio um valor que a pessoa não viu.
 * Mesma decisão do gasto de Seeds.
 */
const gastarCreditoSchema = z.object({
  spendId: z.string().min(8).max(64),
  amount: z.number().int().min(1).max(100_000),
  reason: z.string().min(1).max(80),
  ref: z.string().max(120).optional(),
}).strip()

const assinarSchema = z.object({
  plano: z.string(),
  /** Nome e CPF/CNPJ vão DIRETO ao Asaas (obrigação regulatória é dele); não guardamos CPF. */
  nome: z.string().min(2).max(120),
  cpfCnpj: z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11 dígitos) ou CNPJ (14), só números'),
  email: z.string().email().max(200).optional(),
}).strip()

/**
 * COMPRAR CRÉDITOS OU O PASSE — cobrança avulsa (mudança economia-legivel-e-moedas).
 *
 * Espelha `/assinar` de propósito, inclusive no que NÃO faz: devolve o link e grava a compra
 * como `pendente`. Quem concede é o webhook, quando o pagamento confirmar. Conceder aqui seria
 * dar crédito a quem abandonou o checkout — e o crédito é dinheiro.
 */
const comprarSchema = z.object({
  sku: z.string().min(2).max(24),
  nome: z.string().min(2).max(120),
  cpfCnpj: z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11) ou CNPJ (14) dígitos'),
  email: z.string().email().max(160).optional(),
})

billingRouter.post('/comprar', async (req, res) => {
  const dados = parseOr400(comprarSchema, req.body, res)
  if (!dados) return
  if (!asaasConfigurado()) {
    res.status(501).json({ error: 'cobrança não configurada no servidor (ASAAS_API_KEY ausente)' })
    return
  }
  const pacote = pacotePorSku(dados.sku)
  if (!pacote) {
    res.status(400).json({ error: 'pacote inexistente' })
    return
  }

  try {
    // Mesmo cliente Asaas da assinatura, quando já existe: um CPF, um cadastro no provedor.
    const atual = await subscriptionsRepo.getActive(req.userId)
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(req.userId, dados.nome, dados.cpfCnpj, dados.email)).id

    const cobranca = await criarCobrancaAvulsa(
      req.userId, clienteId, centavosParaReais(pacote.precoCentavos), `Babel Play — ${pacote.nome}`,
    )
    await creditsRepo.registrarCompra(req.userId, {
      sku: pacote.sku as import('../db/repositories/credits').SkuDeCredito,
      creditos: pacote.creditos,
      valorCentavos: pacote.precoCentavos,
      providerPaymentId: cobranca.id,
    })
    log('info', { event: 'billing_compra_criada', route: '/api/billing/comprar', requestId: req.requestId })
    res.json({ linkDePagamento: cobranca.invoiceUrl ?? null, cobranca: cobranca.id })
  } catch (err) {
    res.status(502).json({ error: `falha ao criar cobrança: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/** Saldo e histórico — derivados do razão, nunca de um campo mutável. */
billingRouter.get('/creditos', async (req, res) => {
  try {
    const [saldo, compras, itensPremium] = await Promise.all([
      creditsRepo.saldo(req.userId),
      creditsRepo.comprasDoUsuario(req.userId, 10),
      creditsRepo.itensPremium(req.userId),
    ])
    res.json({
      saldo,
      temPasse: compras.some((c) => c.sku === 'passe-t1' && c.status === 'pago'),
      /* A posse do que se pagou vem do SERVIDOR, sempre: nada comprado com dinheiro vive em
         localStorage (spec economia-de-creditos). O cliente só espelha. */
      itensPremium,
      compras: compras.map((c) => ({ sku: c.sku, status: c.status, creditos: c.creditos, em: c.createdAt })),
    })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'billing_error' }) })
  }
})

/**
 * GASTA CRÉDITOS — a rota que faltava para a moeda comprada existir de verdade.
 *
 * `creditsRepo.debitar` estava escrito, testado e NUNCA CHAMADO: dava para comprar Créditos e não
 * havia onde gastá-los. Quem pagasse R$ 49,90 pelos 700 recebia um número que aparecia no
 * cabeçalho e não comprava nada — pior do que não vender, porque é vender uma promessa que o
 * código não cumpre.
 *
 * A régua é a mesma da Fase 1, e com mais razão: esta moeda custou dinheiro. Motivo em formato
 * fechado, preço do catálogo, saldo conferido. E a conferência de saldo só roda quando o gasto
 * ainda não foi cobrado, senão o reenvio de uma compra já paga viraria 402.
 */
billingRouter.post('/gastar', async (req, res) => {
  const payload = parseOr400(gastarCreditoSchema, req.body, res)
  if (!payload) return
  try {
    const autorizacao = autorizarGastoDeCredito(payload.reason)
    if (ehRecusa(autorizacao)) {
      res.status(400).json({ error: autorizacao.erro })
      return
    }
    if (payload.amount !== autorizacao.preco) {
      res.status(400).json({ error: 'preço divergente do catálogo', preco: autorizacao.preco })
      return
    }
    if (!(await creditsRepo.jaGastou(req.userId, payload.spendId))) {
      const saldo = await creditsRepo.saldo(req.userId)
      if (saldo < autorizacao.preco) {
        res.status(402).json({ error: 'saldo de Créditos insuficiente', falta: autorizacao.preco - saldo, saldo })
        return
      }
    }
    /* `conferirSaldo` faz o SQLite avaliar `compras pagas - gastos >= amount` DENTRO do INSERT.
       A conferência acima continua, e não é redundante: ela é quem sabe dizer quanto falta. Esta
       é quem garante que duas compras simultâneas não passem as duas. */
    const { jaExistia, linha, recusadoPorSaldo } = await creditsRepo.debitar(
      req.userId,
      { ...payload, amount: autorizacao.preco },
      { conferirSaldo: true },
    )
    if (recusadoPorSaldo || !linha) {
      res.status(402).json({ error: 'saldo de Créditos insuficiente', falta: autorizacao.preco, saldo: await creditsRepo.saldo(req.userId) })
      return
    }
    res.json({ jaExistia, gasto: autorizacao.preco, saldo: await creditsRepo.saldo(req.userId) })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'billing_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * OS CRÉDITOS DA TRILHA PAGA — a promessa que a tela fazia e nenhum código cumpria.
 *
 * `ComprarCreditos` e o CTA do Passe anunciam "1.134 Créditos ao longo da trilha"
 * (`core/creditos.ts`, `PasseDeTemporada.tsx`), e a fileira premium era `role="img"` sem handler:
 * ninguém creditava nada. Quem pagasse R$ 14,90 recebia uma fileira trancada que continuava
 * trancada.
 *
 * O DESENHO É O DAS SEEDS DO PASSE, que já funciona: o servidor decide QUAIS casas foram
 * alcançadas (do nível que ele mesmo calcula, não do que o cliente diz), e credita cada uma UMA
 * vez, idempotente por `passe:<temporada>:premium-<n>`. Reabrir a tela nunca credita duas vezes.
 *
 * SEM O PASSE, NADA. A fileira continua sendo vitrine honesta — mostra o que viria, sem entregar.
 */
billingRouter.post('/creditar-passe', async (req, res) => {
  try {
    const compras = await creditsRepo.comprasDoUsuario(req.userId, 50)
    const temPasse = compras.some((c) => c.sku === 'passe-t1' && c.status === 'pago')
    if (!temPasse) {
      res.json({ creditado: 0, temPasse: false })
      return
    }
    const { nivel } = await economiaDoUsuario(req.userId)
    // A casa alcançada vem do NÍVEL do servidor. `pct: 0` é o piso: só casa inteira conta.
    const ate = passeNivel(nivel, 0)
    let creditado = 0
    for (let casa = 1; casa <= ate; casa++) {
      const slot = premiumDoNivel(casa)
      if (slot.tipo !== 'creditos') continue
      const r = await creditsRepo.registrarConcessao(req.userId, {
        concessaoId: `passe:${TEMPORADA_ATUAL}:premium-${casa}`,
        creditos: slot.quantidade,
      })
      if (!r.jaExistia) creditado += slot.quantidade
    }
    res.json({ creditado, temPasse: true, saldo: await creditsRepo.saldo(req.userId) })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'billing_error', route: req.path, requestId: req.requestId }) })
  }
})

billingRouter.post('/assinar', async (req, res) => {
  const dados = parseOr400(assinarSchema, req.body, res)
  if (!dados) return
  if (!asaasConfigurado()) {
    res.status(501).json({ error: 'cobrança não configurada no servidor (ASAAS_API_KEY ausente)' })
    return
  }
  const plano = dados.plano
  if (!ehPlanoDeAssinatura(plano) || PLAN_MATRIX[plano].precoMensalBrl === null) {
    res.status(400).json({ error: 'este plano não é vendável' })
    return
  }
  const preco = PLAN_MATRIX[plano].precoMensalBrl

  try {
    // Reusa o cliente Asaas já criado numa tentativa anterior — recomeçar o checkout não duplica.
    const atual = await subscriptionsRepo.getActive(req.userId)
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(req.userId, dados.nome, dados.cpfCnpj, dados.email)).id

    const assinatura = await criarAssinatura(req.userId, clienteId, preco, `Babel Play ${PLAN_MATRIX[plano].rotulo}`)
    /* Guarda os ids do provedor JÁ, mas NÃO muda plan/status: a promoção é do webhook, quando o
       pagamento confirmar. `plan` aqui registra a INTENÇÃO para o webhook saber o que conceder. */
    await subscriptionsRepo.upsert(req.userId, {
      provider: 'asaas',
      providerCustomerId: clienteId,
      providerSubscriptionId: assinatura.id,
      plan: plano,
      status: (atual?.status as import('../db/repositories/subscriptions').SubStatus | undefined) ?? 'trialing',
    })

    const cobranca = await primeiraCobranca(assinatura.id)
    log('info', { event: 'billing_assinatura_criada', route: '/api/billing/assinar', requestId: req.requestId })
    res.json({ linkDePagamento: cobranca?.invoiceUrl ?? null, assinatura: assinatura.id })
  } catch (err) {
    res.status(502).json({ error: `falha ao criar assinatura: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/** O que a tela de Planos mostra: existe assinatura? em que estado? até quando vale? */
billingRouter.get('/status', async (req, res) => {
  const sub = await subscriptionsRepo.getActive(req.userId)
  res.json({
    configurado: asaasConfigurado(),
    assinatura: sub
      ? { plano: sub.plan, status: sub.status, valeAte: sub.currentPeriodEnd, provedor: sub.provider }
      : null,
  })
})

billingRouter.post('/cancelar', async (req, res) => {
  const atual = await subscriptionsRepo.getActive(req.userId)
  if (!atual?.providerSubscriptionId) {
    res.status(404).json({ error: 'nenhuma assinatura ativa para cancelar' })
    return
  }
  try {
    await cancelarAssinatura(atual.providerSubscriptionId)
    /* Cancelou = para de RENOVAR; o que já foi pago vale até o fim do período (a graça de
       `subConcede` em entitlements.ts cuida do resto). Rebaixar na hora puniria quem pagou. */
    await subscriptionsRepo.upsert(req.userId, { status: 'canceled', cancelAtPeriodEnd: 1 })
    log('info', { event: 'billing_cancelada', route: '/api/billing/cancelar', requestId: req.requestId })
    res.json({ ok: true, valeAte: atual.currentPeriodEnd })
  } catch (err) {
    res.status(502).json({ error: `falha ao cancelar: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/* ------------------------------------------------------------------ webhook (FORA do auth) */

/* O schema do evento e o EFEITO dele vivem em `server/lib/billingEventos.ts`, porque a rota
   administrativa de reprocessamento aplica o mesmo efeito ao payload guardado (A05). */

/** Comparação em tempo constante — igualdade de string vaza o tamanho do prefixo certo. */
function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const asaasWebhookRouter = Router()
asaasWebhookRouter.use(json({ limit: '100kb' }))

asaasWebhookRouter.post('/', async (req, res) => {
  const segredo = webhookToken()
  if (!segredo) {
    // Sem segredo configurado o webhook NÃO processa nada: aceitar evento sem autenticar seria
    // deixar qualquer POST da internet promover plano.
    res.status(501).json({ error: 'webhook não configurado (ASAAS_WEBHOOK_TOKEN ausente)' })
    return
  }
  if (!tokenConfere(req.header('asaas-access-token'), segredo)) {
    log('warn', { event: 'billing_webhook_token_invalido', route: '/api/billing/webhook/asaas' })
    res.status(401).json({ error: 'token inválido' })
    return
  }

  const parsed = eventoSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    // 200 de propósito: corpo estranho não é motivo para o Asaas ficar reentregando para sempre.
    res.status(200).json({ ok: false, motivo: 'corpo fora da forma' })
    return
  }
  const ev = parsed.data
  const referencia = referenciaDoEvento(ev)
  const providerRef = providerRefDoEvento(ev)

  // Idempotência ANTES de qualquer efeito: decidir e marcar são a mesma instrução. O payload
  // bruto vai junto: é ele que um administrador reaplica se o evento terminar `nao-aplicado`.
  const novo = await billingEventsRepo.marcarSeNovo(ev.id, 'asaas', ev.event, referencia, providerRef, req.body)
  if (!novo) {
    res.status(200).json({ ok: true, repetido: true })
    return
  }

  try {
    /* O efeito e o estado vivem em `aplicarEvento`. Antes, dois caminhos caíam num `break` e
       respondiam 200 — assinatura divergente e avulso desconhecido — e o Asaas não reentrega um
       200: o pagante ficava sem o plano e ninguém tinha como reprocessar (A05). Agora todo evento
       termina com estado gravado; `nao-aplicado` vira log de erro e entra na fila do admin. */
    const r = await aplicarEvento(ev, req.requestId)
    await billingEventsRepo.registrarResultado(ev.id, r.estado, r.motivo)
    if (r.estado === 'nao-aplicado') {
      log('error', { event: 'billing_evento_nao_aplicado', provider: 'asaas', error: `${ev.id}: ${r.motivo}`, requestId: req.requestId })
    }
    log('info', { event: 'billing_webhook_ok', provider: 'asaas', error: `${ev.event} → ${r.estado}` })
    res.status(200).json({
      ok: true,
      estado: r.estado,
      ...(r.motivo ? { motivo: r.motivo } : {}),
      ...(r.semUsuario ? { semUsuario: true } : {}),
    })
  } catch (err) {
    /* FALHA NOSSA depois da marca: desmarca e responde 500, para o Asaas REENTREGAR — senão a
       promoção do assinante se perderia para sempre (o evento repetido seria "já processado").
       Se nem desmarcar der, loga ALTO: é o único caso em que um pagamento pode ficar sem efeito. */
    try {
      await billingEventsRepo.desmarcar(ev.id)
    } catch {
      log('error', { event: 'billing_webhook_marca_presa', provider: 'asaas', error: ev.id })
    }
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'billing_webhook_error' }) })
  }
})
