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
import { timingSafeEqual } from 'node:crypto'

import { json, Router } from 'express'
import { z } from 'zod'

import { centavosParaReais, pacotePorSku } from '../../src/core/creditos'
import { autorizarGastoDeCredito, ehRecusa } from '../../src/core/economiaAutoridade'
import { ehPlanoDeAssinatura, PLAN_MATRIX } from '../../src/core/planos'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { creditsRepo } from '../db/repositories/credits'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { vinculosRepo } from '../db/repositories/vinculos'
import { MENSAGEM_CHECKOUT_DESLIGADO } from '../lib/abertura'
import {
  asaasConfigurado,
  criarAssinatura,
  criarCliente,
  criarCobrancaAvulsa,
  listarCobrancasDaAssinatura,
  primeiraCobranca,
  webhookToken,
} from '../lib/asaas'
import { authRequired } from '../lib/auth'
import { asUserId, type UserId } from '../lib/authContext'
import { aplicarEvento, eventoSchema, providerRefDoEvento, referenciaDoEvento } from '../lib/billingEventos'
import { checkoutLigado } from '../lib/config'
import { encerrarAssinatura } from '../lib/encerramentoDeAssinatura'
import { erroDeRota } from '../lib/erroDeRota'
import { ehAdultoDeclarado } from '../lib/idade'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'
import { parseOr400 } from '../validation'

/* ------------------------------------------------------------------ rotas do usuário (atrás do auth) */

export const billingRouter = Router()

/**
 * GASTO DE CRÉDITOS. `amount` continua no contrato para o cliente declarar o que a tela mostrou —
 * e o servidor recusa quando não bate, em vez de cobrar em silêncio um valor que a pessoa não viu.
 * Mesma decisão do gasto de Seeds.
 */
const gastarCreditoSchema = z
  .object({
    spendId: z.string().min(8).max(64),
    amount: z.number().int().min(1).max(100_000),
    reason: z.string().min(1).max(80),
    ref: z.string().max(120).optional(),
  })
  .strip()

const assinarSchema = z
  .object({
    plano: z.string(),
    /** Nome e CPF/CNPJ vão DIRETO ao Asaas (obrigação regulatória é dele); não guardamos CPF. */
    nome: z.string().min(2).max(120),
    cpfCnpj: z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11 dígitos) ou CNPJ (14), só números'),
    email: z.string().email().max(200).optional(),
    /** O RESPONSÁVEL paga pelo menor vinculado: a assinatura nasce na conta do menor. */
    paraUsuario: z.string().min(1).max(128).optional(),
  })
  .strip()

/**
 * QUEM PAGA E PARA QUEM (Fases 3 e 4 do lançamento) — a porta comum de `/assinar` e `/comprar`.
 *
 * 1. `CHECKOUT_ENABLED=0` fecha a venda com mensagem clara (503 `checkout_desligado`).
 * 2. Quem PAGA é adulto declarado (18+): menor não compra nada com dinheiro (ECA Digital art. 18,
 *    II), e sem data declarada também não — a configuração protetiva é a padrão.
 * 3. `paraUsuario` = o responsável pagando pelo menor. Só vale com vínculo ACEITO entre os dois;
 *    a assinatura/compra nasce na conta do menor (é para ela que o webhook concede).
 *
 * Self-host não passa pelas regras 2 e 3 (não há idade nem venda de verdade). Devolve o id de
 * quem RECEBE, ou `null` depois de já ter respondido o erro.
 */
async function autorizarPagamento(
  req: import('express').Request,
  res: import('express').Response,
  paraUsuario: string | undefined,
): Promise<UserId | null> {
  if (!checkoutLigado()) {
    responderErro(res, 503, MENSAGEM_CHECKOUT_DESLIGADO, 'checkout_desligado')
    return null
  }
  if (!authRequired()) return req.userId
  const pagador = await ehAdultoDeclarado(req.userId)
  if (!pagador.informado) {
    responderErro(res, 403, 'informe a sua data de nascimento antes de pagar', 'idade_nao_informada')
    return null
  }
  if (!pagador.adulto) {
    responderErro(
      res,
      403,
      'contas de menores de 18 anos não fazem compras: peça ao seu responsável para assinar por você',
      'menor_nao_compra',
    )
    return null
  }
  if (!paraUsuario || paraUsuario === req.userId) return req.userId
  const menor = asUserId(paraUsuario)
  if (!(await vinculosRepo.ehResponsavelDe(req.userId, menor))) {
    responderErro(res, 403, 'você não está vinculado como responsável por esta conta', 'sem_vinculo')
    return null
  }
  return menor
}

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
  paraUsuario: z.string().min(1).max(128).optional(),
})

billingRouter.post('/comprar', async (req, res) => {
  const dados = parseOr400(comprarSchema, req.body, res)
  if (!dados) return
  const destino = await autorizarPagamento(req, res, dados.paraUsuario)
  if (!destino) return
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
    const atual = await subscriptionsRepo.getActive(destino)
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(destino, dados.nome, dados.cpfCnpj, dados.email)).id

    const cobranca = await criarCobrancaAvulsa(
      destino,
      clienteId,
      centavosParaReais(pacote.precoCentavos),
      `Babel Play — ${pacote.nome}`,
    )
    await creditsRepo.registrarCompra(destino, {
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
      res.status(402).json({
        error: 'saldo de Créditos insuficiente',
        falta: autorizacao.preco,
        saldo: await creditsRepo.saldo(req.userId),
      })
      return
    }
    res.json({ jaExistia, gasto: autorizacao.preco, saldo: await creditsRepo.saldo(req.userId) })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'billing_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * DEPRECIADA (recompensas v2, onda 5): os Créditos da trilha paga do Passe de 100 casas.
 *
 * O Passe saiu — a trilha paga agora é a de ASSINANTE da temporada (`core/temporada.ts`), que
 * entrega item e nunca Créditos. A rota fica, sem efeito, porque uma aba aberta com o bundle
 * anterior (ou um rollback) ainda a chama, e a política da API é depreciar antes de remover
 * (`tests/contratos/api-depreciacoes.json`). A resposta é a honesta de quem não tem o que receber.
 */
billingRouter.post('/creditar-passe', (_req, res) => {
  res.json({ creditado: 0, temPasse: false })
})

billingRouter.post('/assinar', async (req, res) => {
  const dados = parseOr400(assinarSchema, req.body, res)
  if (!dados) return
  const destino = await autorizarPagamento(req, res, dados.paraUsuario)
  if (!destino) return
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
    const atual = await subscriptionsRepo.getActive(destino)
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(destino, dados.nome, dados.cpfCnpj, dados.email)).id

    const assinatura = await criarAssinatura(destino, clienteId, preco, `Babel Play ${PLAN_MATRIX[plano].rotulo}`)
    /* NÃO conceder aqui (GAP-001, auditoria 2026-09-13): a promoção é EXCLUSIVA do webhook, quando o
       pagamento confirmar. O webhook decide o plano pelo VALOR pago (billingEventos.ts), então
       iniciar o checkout nunca pode dar plano de graça.
       - Assinatura NOVA: grava a INTENÇÃO em `trialing`, que NÃO concede (entitlements.subConcede) e
         serve de fallback ao webhook quando o evento vier sem valor.
       - Assinatura JÁ existente: só atualiza os ids da nova tentativa de cobrança; NÃO toca em
         plan/status. Sobrescrever `plan` de um assinante ativo o promoveria sem pagar (escalada
         essencial→pro); baixá-lo para `trialing` revogaria o que ele já paga. */
    await subscriptionsRepo.upsert(
      destino,
      atual
        ? { provider: 'asaas', providerCustomerId: clienteId, providerSubscriptionId: assinatura.id }
        : {
            provider: 'asaas',
            providerCustomerId: clienteId,
            providerSubscriptionId: assinatura.id,
            plan: plano,
            status: 'trialing',
          },
    )

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

/* ------------------------------------------------------------------ faturas (só leitura) */

type StatusDeFatura = 'paga' | 'pendente' | 'falhou' | 'estornada'

/** O status do Asaas na língua da tela. O que não se conhece fica `pendente`: não promete "paga". */
function statusDaFatura(s: string): StatusDeFatura {
  if (s === 'RECEIVED' || s === 'CONFIRMED' || s === 'RECEIVED_IN_CASH') return 'paga'
  if (s === 'OVERDUE' || s.startsWith('DUNNING')) return 'falhou'
  if (s.startsWith('REFUND') || s.startsWith('CHARGEBACK') || s === 'AWAITING_CHARGEBACK_REVERSAL') return 'estornada'
  return 'pendente'
}

const METODO: Record<string, 'cartao' | 'pix' | 'boleto'> = { CREDIT_CARD: 'cartao', PIX: 'pix', BOLETO: 'boleto' }

/**
 * Link que o cliente vai ABRIR: só https num domínio do Asaas. A resposta do provedor é confiável,
 * mas o botão "Baixar recibo" faz `window.open` do valor — um `javascript:` ali seria execução.
 */
function linkDoAsaas(u: string | undefined): string | null {
  if (!u) return null
  try {
    const url = new URL(u)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (host === 'asaas.com' || host.endsWith('.asaas.com')) ? url.href : null
  } catch {
    return null
  }
}

/**
 * AS FATURAS DA ASSINATURA — o que a aba "Sua assinatura" lista.
 *
 * Só LEITURA e só da PRÓPRIA conta: o id da assinatura sai de `subscriptions` pelo `req.userId`,
 * e a rota não aceita parâmetro nenhum que aponte para outra. Nada aqui muda plano, status ou
 * período — quem muda é o webhook.
 */
billingRouter.get('/faturas', async (req, res) => {
  if (!asaasConfigurado()) {
    res.status(501).json({ error: 'cobrança não configurada no servidor (ASAAS_API_KEY ausente)' })
    return
  }
  const sub = await subscriptionsRepo.getActive(req.userId)
  if (!sub?.providerSubscriptionId) {
    res.json({ faturas: [] })
    return
  }
  try {
    const descricao = ehPlanoDeAssinatura(sub.plan) ? `${PLAN_MATRIX[sub.plan].rotulo} · mensal` : 'Assinatura'
    const cobrancas = await listarCobrancasDaAssinatura(sub.providerSubscriptionId)
    res.json({
      faturas: cobrancas.map((c) => ({
        id: c.id,
        data: c.paymentDate ?? c.clientPaymentDate ?? c.dueDate ?? null,
        descricao,
        valor: c.value,
        metodo: (c.billingType && METODO[c.billingType]) || null,
        status: statusDaFatura(c.status),
        recibo: linkDoAsaas(c.transactionReceiptUrl),
        link: linkDoAsaas(c.invoiceUrl),
      })),
    })
  } catch (err) {
    res.status(502).json({ error: `falha ao buscar faturas: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/**
 * CANCELAR — o mesmo canal da assinatura, em poucos cliques (Decreto 11.034/2022).
 *
 * Toda a regra mora em `encerrarAssinatura` (server/lib/encerramentoDeAssinatura.ts), que a
 * exclusão de conta também usa: dentro de 7 dias do primeiro pagamento é ARREPENDIMENTO (cancela,
 * estorna tudo e o acesso acaba agora, com protocolo); depois, para a renovação e o período pago
 * vale até o próximo vencimento informado pelo Asaas.
 */
billingRouter.post('/cancelar', async (req, res) => {
  if (!asaasConfigurado()) {
    res.status(501).json({ error: 'cobrança não configurada no servidor (ASAAS_API_KEY ausente)' })
    return
  }
  try {
    const r = await encerrarAssinatura(req.userId, { requestId: req.requestId })
    if (r.semAssinatura) {
      res.status(404).json({ error: 'nenhuma assinatura ativa para cancelar' })
      return
    }
    log('info', { event: 'billing_cancelada', route: '/api/billing/cancelar', requestId: req.requestId })
    res.json({ ok: true, valeAte: r.valeAte, arrependimento: r.arrependimento })
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
      log('error', {
        event: 'billing_evento_nao_aplicado',
        provider: 'asaas',
        error: `${ev.id}: ${r.motivo}`,
        requestId: req.requestId,
      })
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
