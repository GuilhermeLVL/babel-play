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
import { DIAS_DO_TESTE_PREMIUM, normalizarPlano, PARCELAS_DO_ANUAL, PLAN_MATRIX } from '../../src/core/planos'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { creditsRepo } from '../db/repositories/credits'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { type TestePremium, testesPremiumRepo } from '../db/repositories/testesPremium'
import { vinculosRepo } from '../db/repositories/vinculos'
import { MENSAGEM_CHECKOUT_DESLIGADO } from '../lib/abertura'
import {
  asaasConfigurado,
  buscarAssinatura,
  criarAssinatura,
  criarCliente,
  criarCobrancaAvulsa,
  criarParcelamento,
  listarCobrancasDaAssinatura,
  listarCobrancasDoParcelamento,
  primeiraCobranca,
  webhookToken,
} from '../lib/asaas'
import { authRequired, emailDaRequisicao } from '../lib/auth'
import { asUserId, type UserId } from '../lib/authContext'
import { aplicarEvento, eventoSchema, providerRefDoEvento, referenciaDoEvento } from '../lib/billingEventos'
import { checkoutLigado } from '../lib/config'
import { encerrarAssinatura } from '../lib/encerramentoDeAssinatura'
import { erroDeRota } from '../lib/erroDeRota'
import { ehAdultoDeclarado } from '../lib/idade'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'
import {
  DURACAO_DO_TESTE_MS,
  marcaDoTeste,
  type OrigemDaMarca,
  type SituacaoDoTeste,
  situacaoDoTeste,
  testeAtivo,
} from '../lib/testePremium'
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
    /* C5 — O CICLO E O MEIO. Ausentes = o mensal recorrente de sempre (a aba aberta com o bundle
       anterior continua assinando como antes). `parcelamento` é o anual em 12x no cartão;
       `pix_automatico` é a API de autorização à parte, ainda não integrada (501). */
    ciclo: z.enum(['mensal', 'anual']).default('mensal'),
    meio: z.enum(['assinatura', 'parcelamento', 'pix_automatico']).default('assinatura'),
  })
  .strip()

/**
 * A linha JÁ É PAGA no Asaas? Ativa (ou atrasada, ainda na graça) com um id de cobrança do provedor.
 * Quem está assim não abre uma SEGUNDA cobrança por `/assinar`: a assinatura antiga continuaria
 * cobrando junto (dois débitos por mês, ou o mensal por cima do anual), e a troca de ciclo é um
 * fluxo próprio da tela de Planos (C7). A fatura atrasada se paga pelo link dela, não assinando de
 * novo. A linha do admin (sem provedor) e a cancelada podem assinar.
 */
function jaPagaNoAsaas(sub: Awaited<ReturnType<typeof subscriptionsRepo.getActive>>): boolean {
  if (!sub || sub.provider !== 'asaas') return false
  if (sub.status !== 'active' && sub.status !== 'past_due') return false
  return Boolean(sub.providerSubscriptionId || sub.providerInstallmentId)
}

/**
 * PERFIL PROTEGIDO NÃO COMPRA — a régua do servidor, igual à `perfilProtegido()` do cliente
 * (`src/lib/protecaoDoMenor.ts`): menor de 18, ou quem ainda não declarou a data (a configuração
 * mais protetiva é a padrão, ECA Digital; compra sob controle do responsável, art. 18). Vale para
 * pagar em dinheiro (`/assinar`, `/comprar`) e para gastar Créditos (`/gastar`). Self-host não tem
 * idade: passa. Devolve `true` depois de já ter respondido o 403.
 */
async function recusouPerfilProtegido(
  req: import('express').Request,
  res: import('express').Response,
): Promise<boolean> {
  if (!authRequired()) return false
  const quem = await ehAdultoDeclarado(req.userId)
  if (!quem.informado) {
    responderErro(res, 403, 'informe a sua data de nascimento antes de pagar', 'idade_nao_informada')
    return true
  }
  if (!quem.adulto) {
    responderErro(
      res,
      403,
      'contas de menores de 18 anos não fazem compras: peça ao seu responsável para assinar por você',
      'menor_nao_compra',
    )
    return true
  }
  return false
}

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
  if (await recusouPerfilProtegido(req, res)) return null
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
    /* LOJA COM CRÉDITOS (recompensas v2, onda 6): perfil protegido não gasta — nem o saldo que o
       responsável comprou para ele, nem reenviando um `spendId` antigo. O 403 vem ANTES do motivo
       e da idempotência: a tela dele nem mostra a vitrine, então qualquer pedido daqui é recusa. */
    if (await recusouPerfilProtegido(req, res)) return
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
  /* O nome antigo (`essencial`/`pro`) de uma aba aberta com o bundle anterior é lido como o atual:
     quem clicou "Assinar o Pro" antes do deploy assina o Premium agora, em vez de receber um 400. */
  const plano = normalizarPlano(dados.plano)
  if (!plano || PLAN_MATRIX[plano].precoMensalBrl === null) {
    res.status(400).json({ error: 'este plano não é vendável' })
    return
  }
  const { ciclo, meio } = dados
  /* O PIX AUTOMÁTICO é uma API de autorização à parte, e em produção exige conta PJ com CNPJ ativo há
     seis meses ou mais (sondagem do C5, `openspec/changes/planos-v2/design.md`). Enquanto a conta do
     serviço não for elegível, ele não é oferecido — e o servidor diz isso, em vez de cair noutro meio. */
  if (meio === 'pix_automatico') {
    responderErro(
      res,
      501,
      'o Pix Automático ainda não está disponível; escolha outra forma de pagamento',
      'pix_automatico_indisponivel',
    )
    return
  }
  // O 12x parcela o ANO; parcelar a mensalidade não é um produto.
  if (meio === 'parcelamento' && ciclo !== 'anual') {
    res.status(400).json({ error: 'o parcelamento em 12x é só do plano anual' })
    return
  }
  const preco = ciclo === 'anual' ? PLAN_MATRIX[plano].precoAnualBrl : PLAN_MATRIX[plano].precoMensalBrl
  if (preco === null) {
    res.status(400).json({ error: 'este plano não é vendável neste ciclo' })
    return
  }

  try {
    // Reusa o cliente Asaas já criado numa tentativa anterior — recomeçar o checkout não duplica.
    const atual = await subscriptionsRepo.getActive(destino)
    if (jaPagaNoAsaas(atual)) {
      responderErro(
        res,
        409,
        'esta conta já tem o Premium pago; para trocar de ciclo, use Planos → Sua assinatura',
        'ja_assinante',
      )
      return
    }
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(destino, dados.nome, dados.cpfCnpj, dados.email)).id
    const descricao = `Babel Play ${PLAN_MATRIX[plano].rotulo}${ciclo === 'anual' ? ' anual' : ''}`

    /* A COBRANÇA NO ASAAS: a assinatura recorrente (mensal ou `YEARLY`) ou o parcelamento do 12x no
       cartão. Cada uma devolve o link da 1ª fatura por um caminho — e a linha guarda SÓ o id do fluxo
       desta tentativa (o outro fica nulo), para o cancelamento e as faturas saberem onde perguntar. */
    let ids: { providerSubscriptionId: string | null; providerInstallmentId: string | null }
    let link: string | null
    if (meio === 'parcelamento') {
      const parcela = await criarParcelamento(destino, clienteId, preco, PARCELAS_DO_ANUAL, descricao)
      if (!parcela.installment) throw new Error('o Asaas não devolveu o id do parcelamento')
      ids = { providerSubscriptionId: null, providerInstallmentId: parcela.installment }
      link = parcela.invoiceUrl ?? null
    } else {
      const assinatura = await criarAssinatura(destino, clienteId, preco, descricao, ciclo)
      ids = { providerSubscriptionId: assinatura.id, providerInstallmentId: null }
      link = (await primeiraCobranca(assinatura.id))?.invoiceUrl ?? null
    }

    /* NÃO conceder aqui (GAP-001, auditoria 2026-09-13): a promoção é EXCLUSIVA do webhook, quando o
       pagamento confirmar. O webhook decide o plano E O CICLO pelo VALOR pago (billingEventos.ts),
       então iniciar o checkout nunca pode dar plano (nem o ano) de graça.
       - Assinatura NOVA: grava a INTENÇÃO em `trialing`, que NÃO concede (entitlements.subConcede) e
         serve de fallback ao webhook quando o evento vier sem valor.
       - Assinatura JÁ existente (cancelada, ou tentativa anterior não paga): só atualiza os ids da
         nova tentativa de cobrança; NÃO toca em plan/status/ciclo. Sobrescrever `plan` promoveria
         sem pagar (a escalada que o GAP-001 fechou); baixar para `trialing` revogaria o período que
         a cancelada ainda tem. O `meio` diz só qual fluxo do Asaas cobra esta tentativa. */
    await subscriptionsRepo.upsert(
      destino,
      atual
        ? { provider: 'asaas', providerCustomerId: clienteId, ...ids, meio }
        : { provider: 'asaas', providerCustomerId: clienteId, ...ids, meio, ciclo, plan: plano, status: 'trialing' },
    )

    log('info', { event: 'billing_assinatura_criada', route: '/api/billing/assinar', requestId: req.requestId })
    res.json({
      linkDePagamento: link,
      ...(ids.providerSubscriptionId ? { assinatura: ids.providerSubscriptionId } : {}),
      ...(ids.providerInstallmentId ? { parcelamento: ids.providerInstallmentId } : {}),
      ciclo,
      meio,
    })
  } catch (err) {
    res.status(502).json({ error: `falha ao criar assinatura: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/**
 * A PRÓXIMA COBRANÇA — o `nextDueDate` da assinatura no Asaas, que é a data que a tela promete
 * ("Próxima cobrança em 30/10"). NÃO é o `valeAte`: esse é o vencimento mais a graça de atraso,
 * até quando o acesso vale — mostrar um no lugar do outro dizia "renova em 04/11" para uma
 * cobrança do dia 30.
 *
 * Cache em memória de 10 min por assinatura: a tela de Planos e a espera do checkout perguntam o
 * status várias vezes, e o Asaas não precisa ouvir cada uma. Falha é silenciosa (o campo some,
 * o status continua): nenhuma data é melhor que a tela de Planos quebrada.
 */
const CACHE_DA_PROXIMA_COBRANCA_MS = 10 * 60_000
const proximasCobrancas = new Map<string, { data: string | null; ate: number }>()

async function proximaCobranca(assinaturaId: string): Promise<string | null> {
  const agora = Date.now()
  const guardada = proximasCobrancas.get(assinaturaId)
  if (guardada && guardada.ate > agora) return guardada.data
  try {
    const a = await buscarAssinatura(assinaturaId)
    const data = typeof a.nextDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.nextDueDate) ? a.nextDueDate : null
    proximasCobrancas.set(assinaturaId, { data, ate: agora + CACHE_DA_PROXIMA_COBRANCA_MS })
    return data
  } catch (err) {
    log('warn', { event: 'billing_proxima_cobranca_falhou', error: String(err).slice(0, 120) })
    return null
  }
}

/* ------------------------------------------------------------------ o teste de 14 dias (C6) */

/**
 * A conta já teve o Premium PAGO? Ativa, atrasada ou cancelada — qualquer linha do Premium que não
 * seja só o checkout iniciado (`trialing`). O teste é para quem ainda não conhece o Premium: quem já
 * assinou e cancelou não ganha mais 14 dias por isso.
 */
function jaAssinou(sub: Awaited<ReturnType<typeof subscriptionsRepo.getActive>>): boolean {
  return !!sub && sub.status !== 'trialing' && normalizarPlano(sub.plan) === 'premium'
}

/** A situação do teste para a tela (`/status`). Falha de leitura não derruba o status: some o campo. */
async function situacaoParaATela(req: import('express').Request): Promise<SituacaoDoTeste | null> {
  const dias = DIAS_DO_TESTE_PREMIUM
  if (!authRequired()) return { estado: 'indisponivel', dias, motivo: 'selfhost' }
  if (req.convidado) return { estado: 'indisponivel', dias, motivo: 'convidado' }
  try {
    const [sub, idade] = await Promise.all([subscriptionsRepo.getActive(req.userId), ehAdultoDeclarado(req.userId)])
    return await situacaoDoTeste(req.userId, { email: emailDaRequisicao(req), jaAssinou: jaAssinou(sub), idade })
  } catch (err) {
    log('warn', { event: 'billing_teste_situacao_falhou', error: String(err).slice(0, 120) })
    return null
  }
}

const testeSchema = z
  .object({
    /** O RESPONSÁVEL ativa o teste para o menor vinculado — o mesmo `paraUsuario` do checkout. */
    paraUsuario: z.string().min(1).max(128).optional(),
  })
  .strip()

/**
 * COMEÇAR O TESTE DE 14 DIAS — um toque, sem cartão (C6, padrão do dono).
 *
 * NADA AQUI FALA COM O ASAAS: não há cartão para pedir, cobrança para criar nem renovação para
 * agendar. No fim a conta volta ao Grátis sozinha (`resolverPlano` deixa de ver o teste ativo).
 *
 * A ORDEM DAS RECUSAS: self-host (já tem tudo) → convidado (sem conta) → venda pausada (depois do
 * teste não haveria como assinar) → quem ativa é adulto declarado, e o menor não ativa sozinho
 * ("peça ao seu responsável"; o responsável vinculado ativa pelo `paraUsuario`) → a conta já testou
 * (o 2º toque devolve o MESMO teste; vencido, 409) → já assinou → sem e-mail não há marca → a marca
 * do e-mail já testou noutra conta (inclusive numa apagada). Só então a marca e o teste são gravados,
 * juntos (`testesPremiumRepo.iniciar`).
 */
billingRouter.post('/teste', async (req, res) => {
  const dados = parseOr400(testeSchema, req.body ?? {}, res)
  if (!dados) return
  if (!authRequired()) {
    responderErro(res, 409, 'no self-host o app já está todo liberado', 'teste_indisponivel')
    return
  }
  if (req.convidado) {
    responderErro(res, 403, 'crie uma conta para testar o Premium', 'exige_conta')
    return
  }
  if (!checkoutLigado()) {
    responderErro(res, 503, MENSAGEM_CHECKOUT_DESLIGADO, 'checkout_desligado')
    return
  }

  /* QUEM ATIVA é adulto declarado; QUEM RECEBE é a própria conta ou o menor vinculado. */
  const quem = await ehAdultoDeclarado(req.userId)
  if (!quem.informado) {
    responderErro(res, 403, 'informe a sua data de nascimento antes de começar o teste', 'idade_nao_informada')
    return
  }
  if (!quem.adulto) {
    responderErro(
      res,
      403,
      'contas de menores de 18 anos não começam o teste sozinhas: peça ao seu responsável — pela conta dele, vinculada à sua, ele ativa o teste para você',
      'teste_pelo_responsavel',
    )
    return
  }
  let destino: UserId = req.userId
  let origem: OrigemDaMarca = 'conta'
  if (dados.paraUsuario && dados.paraUsuario !== req.userId) {
    const menor = asUserId(dados.paraUsuario)
    if (!(await vinculosRepo.ehResponsavelDe(req.userId, menor))) {
      responderErro(res, 403, 'você não está vinculado como responsável por esta conta', 'sem_vinculo')
      return
    }
    destino = menor
    origem = 'responsavel'
  }

  try {
    const jaAtivo = (t: TestePremium) =>
      res.json({
        teste: { iniciadoEm: t.iniciadoEm, terminaEm: t.terminaEm, dias: DIAS_DO_TESTE_PREMIUM },
        jaEstavaAtivo: true,
      })
    const usado = () => responderErro(res, 409, 'o teste do Premium já foi usado por esta pessoa', 'teste_ja_usado')

    const existente = await testesPremiumRepo.doUsuario(destino)
    if (existente) {
      if (testeAtivo(existente)) jaAtivo(existente)
      else usado()
      return
    }
    if (jaAssinou(await subscriptionsRepo.getActive(destino))) {
      responderErro(res, 409, 'esta conta já tem (ou já teve) o Premium', 'ja_assinante')
      return
    }
    const email = emailDaRequisicao(req)
    const marca = email ? await marcaDoTeste(email, origem) : null
    if (!marca) {
      responderErro(res, 409, 'o teste precisa de uma conta com e-mail', 'teste_sem_email')
      return
    }

    const agora = Date.now()
    const r = await testesPremiumRepo.iniciar(destino, marca, agora, agora + DURACAO_DO_TESTE_MS)
    if (r.tipo === 'iniciado') {
      log('info', { event: 'billing_teste_iniciado', route: '/api/billing/teste', requestId: req.requestId })
      res.json({ teste: { iniciadoEm: r.teste.iniciadoEm, terminaEm: r.teste.terminaEm, dias: DIAS_DO_TESTE_PREMIUM } })
      return
    }
    /* `ja_existia`, ou a marca já estava gravada: pode ser o 2º toque que perdeu a corrida para o 1º
       (a mesma conta, o mesmo e-mail) — relido, o teste ativo desta conta é a resposta certa. */
    const agoraExiste = r.tipo === 'ja_existia' ? r.teste : await testesPremiumRepo.doUsuario(destino)
    if (agoraExiste && testeAtivo(agoraExiste)) jaAtivo(agoraExiste)
    else usado()
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'billing_teste_error' }) })
  }
})

/** O que a tela de Planos mostra: existe assinatura? em que estado? até quando vale? quando cobra? */
billingRouter.get('/status', async (req, res) => {
  const sub = await subscriptionsRepo.getActive(req.userId)
  const proxima =
    sub?.status === 'active' && sub.provider === 'asaas' && sub.providerSubscriptionId && asaasConfigurado()
      ? await proximaCobranca(sub.providerSubscriptionId)
      : null
  /* C6: a situação do teste de 14 dias — a tela de Planos (C7) oferece o toque só a quem o servidor
     deixaria começar, e diz por que não quando não. */
  const teste = await situacaoParaATela(req)
  res.json({
    ...(teste ? { teste } : {}),
    configurado: asaasConfigurado(),
    /* O plano no nome ATUAL (a linha pode ser de antes da 0041) e, desde a matriz v2, o ciclo e o
       meio — a tela de conta do C7 fala de "renova todo mês" ou "vale até <data> (anual)".
       `renovacaoAutomatica` é a promessa que a tela faz: só a ASSINATURA ativa renova sozinha
       (mensal ou `YEARLY`); o 12x acaba na 12ª parcela e a cancelada não renova mais. */
    assinatura: sub
      ? {
          plano: normalizarPlano(sub.plan) ?? sub.plan,
          status: sub.status,
          valeAte: sub.currentPeriodEnd,
          provedor: sub.provider,
          ciclo: sub.ciclo === 'anual' ? 'anual' : 'mensal',
          meio: sub.meio ?? null,
          renovacaoAutomatica: sub.status === 'active' && sub.meio === 'assinatura' && !!sub.providerSubscriptionId,
        }
      : null,
    ...(proxima ? { proximaCobranca: proxima } : {}),
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
  /* O 12x não tem assinatura: as faturas são as PARCELAS do parcelamento (C5). */
  const parcelado = sub?.meio === 'parcelamento' && !!sub.providerInstallmentId
  if (!sub || (!parcelado && !sub.providerSubscriptionId)) {
    res.json({ faturas: [] })
    return
  }
  try {
    const plano = normalizarPlano(sub.plan)
    const ciclo = parcelado ? 'anual em 12x' : sub.ciclo === 'anual' ? 'anual' : 'mensal'
    const descricao = plano ? `${PLAN_MATRIX[plano].rotulo} · ${ciclo}` : 'Assinatura'
    const cobrancas = parcelado
      ? await listarCobrancasDoParcelamento(sub.providerInstallmentId as string)
      : await listarCobrancasDaAssinatura(sub.providerSubscriptionId as string)
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
 * vale até o próximo vencimento informado pelo Asaas. O anual e o 12x (C5) seguem a mesma regra: o
 * arrependimento estorna o ano inteiro (o 12x, o parcelamento inteiro); depois dos 7 dias não há
 * reembolso proporcional e o acesso vale até o fim do ano pago (a validar com o jurídico).
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
