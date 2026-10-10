/**
 * CLIENTE DO ASAAS — a fatia mínima da API que a cobrança usa (E3).
 *
 * Por que Asaas, e não Stripe: decisão do dono (2026-08-31), sustentada em
 * `docs/auditoria/decisao-infraestrutura-v1.md` — num ticket de R$ 9,90/19,90 a taxa fixa pesa
 * mais que o percentual (Asaas 1,99% + R$ 0,49 contra ~6,6% efetivos da Stripe), o Pix recorrente
 * existe desde jan/2026, e o Asaas notifica o pagador sozinho (cobrança, atraso) — o que dispensa
 * e-mail transacional de billing no lançamento.
 *
 * SANDBOX POR PADRÃO, produção por env explícita. Errar para o lado do sandbox custa um teste;
 * errar para o lado da produção custa uma cobrança real.
 *
 * O `externalReference` de cliente e assinatura carrega o NOSSO userId — é como o webhook, que
 * chega sem JWT, descobre de quem é o evento.
 */
import type { CicloDeCobranca } from '../../src/core/planos'
import type { UserId } from './authContext'
import { lerAppUrl } from './config'
import { log } from './logger'

const base = (): string => process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3'

export const asaasConfigurado = (): boolean => Boolean(process.env.ASAAS_API_KEY)

/**
 * O segredo do webhook, lido em TEMPO DE CHAMADA como as outras envs deste módulo (o teste troca
 * a env entre casos). Morar aqui — e não no handler — é o que a regra `env-fora-de-config` exige:
 * este arquivo é o inventário de tudo que o Asaas requer do ambiente.
 */
export const webhookToken = (): string | undefined => process.env.ASAAS_WEBHOOK_TOKEN

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const chave = process.env.ASAAS_API_KEY
  if (!chave) throw new Error('ASAAS_API_KEY ausente')
  const r = await fetch(`${base()}${caminho}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // O nome do header é do Asaas; o valor NUNCA aparece em log (o logger tem allowlist).
      access_token: chave,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 300)
    throw new Error(`Asaas ${caminho} → HTTP ${r.status}: ${corpo}`)
  }
  return (await r.json()) as T
}

export interface ClienteAsaas {
  id: string
}
export interface AssinaturaAsaas {
  id: string
}
export interface CobrancaAsaas {
  id: string
  invoiceUrl?: string
}

/**
 * Garante um cliente no Asaas para este usuário. O Asaas exige nome e CPF/CNPJ do pagador; eles
 * vêm do formulário de assinatura (não guardamos CPF no nosso banco — ele segue direto para o
 * processador, que é quem tem obrigação regulatória de tê-lo).
 */
export async function criarCliente(
  userId: UserId,
  nome: string,
  cpfCnpj: string,
  email?: string,
): Promise<ClienteAsaas> {
  return chamar<ClienteAsaas>('/customers', {
    method: 'POST',
    body: JSON.stringify({ name: nome, cpfCnpj, email, externalReference: String(userId) }),
  })
}

/** Uma cobrança como a listagem do Asaas a devolve — só os campos que a tela de faturas lê. */
export interface CobrancaListadaAsaas {
  id: string
  status: string
  value: number
  billingType?: string
  dueDate?: string
  paymentDate?: string
  clientPaymentDate?: string
  /** Quando o cartão foi confirmado (antes de o dinheiro cair) — o marco do arrependimento. */
  confirmedDate?: string
  invoiceUrl?: string
  transactionReceiptUrl?: string
}

/**
 * AS COBRANÇAS DE UMA ASSINATURA — só LEITURA (tela "Sua assinatura", lista de faturas).
 *
 * É o mesmo endpoint de `primeiraCobranca`, com mais linhas. Quem escolhe QUAL assinatura é o
 * chamador, e ele lê o id do nosso banco (a assinatura do próprio usuário), nunca do cliente.
 */
export async function listarCobrancasDaAssinatura(assinaturaId: string, limite = 24): Promise<CobrancaListadaAsaas[]> {
  const r = await chamar<{ data?: CobrancaListadaAsaas[] }>(
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments?limit=${limite}`,
  )
  return r.data ?? []
}

/**
 * PARA ONDE O ASAAS DEVOLVE O PAGADOR (funil de venda, 2026-09-29): `APP_URL/plano/assinado`, que
 * pergunta ao servidor se o pagamento confirmou (nada ali confia no redirecionamento). SÓ com https
 * num domínio de verdade: o Asaas recusa localhost e domínio que não esteja cadastrado na conta, e
 * em desenvolvimento a aba do checkout já espera a confirmação sozinha. `null` = não pedir a volta.
 */
export function urlDeVoltaDoPagamento(): string | null {
  const base = lerAppUrl()
  if (!base) return null
  try {
    const u = new URL(base)
    const host = u.hostname.toLowerCase()
    const local = host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]'
    return u.protocol === 'https:' && !local ? `${base}/plano/assinado` : null
  } catch {
    return null
  }
}

/**
 * Cria o pedido COM a URL de volta (`callback`) e, se o Asaas recusar o pedido por causa dela (400 —
 * domínio não cadastrado, por exemplo), cria de novo sem: a volta automática é conforto, a venda não
 * é. Um 400 não cria nada no Asaas, então a segunda tentativa não duplica a cobrança.
 */
async function criarComVolta<T>(caminho: string, corpo: object): Promise<T> {
  const criar = (b: object) => chamar<T>(caminho, { method: 'POST', body: JSON.stringify(b) })
  const volta = urlDeVoltaDoPagamento()
  if (!volta) return criar(corpo)
  try {
    return await criar({ ...corpo, callback: { successUrl: volta, autoRedirect: true } })
  } catch (err) {
    if (!String(err).includes('HTTP 400')) throw err
    log('warn', { event: 'asaas_callback_recusado' })
    return criar(corpo)
  }
}

const amanha = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

/**
 * Cria a assinatura recorrente: `MONTHLY` no mensal, `YEARLY` no ANUAL em uma vez (C5, sondagem de
 * 29/09/2026: `cycle: 'YEARLY'` a R$ 179 é aceito, a 1ª cobrança nasce na hora e o `nextDueDate` já
 * pula um ano — é a renovação que `/status` mostra). `billingType: 'UNDEFINED'` deixa o pagador
 * escolher Pix, boleto ou cartão na página do Asaas, nos dois ciclos.
 */
export async function criarAssinatura(
  userId: UserId,
  clienteId: string,
  valorBrl: number,
  descricao: string,
  ciclo: CicloDeCobranca = 'mensal',
): Promise<AssinaturaAsaas> {
  return criarComVolta<AssinaturaAsaas>('/subscriptions', {
    customer: clienteId,
    billingType: 'UNDEFINED',
    value: valorBrl,
    nextDueDate: amanha(),
    cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
    description: descricao,
    externalReference: String(userId),
  })
}

/** A 1ª parcela, como `POST /payments` com `installmentCount` a devolve. */
export interface ParcelaCriadaAsaas {
  id: string
  /** O id do PARCELAMENTO — é ele que a nossa linha guarda e que o webhook reconhece. */
  installment?: string
  invoiceUrl?: string
}

/**
 * O ANUAL EM 12x — o recurso de PARCELAMENTO da API, não uma assinatura (C5; sondagem de 29/09/2026).
 *
 * `totalValue` + `installmentCount`, e não `value`: o Asaas TRUNCA a divisão e joga a diferença na
 * última (179 em 12x = 11 × R$ 14,91 + R$ 14,99), e é essa conta que `valoresDasParcelas` reproduz
 * para o webhook reconhecer a parcela.
 *
 * SÓ NO CARTÃO (`CREDIT_CARD`, sem dados de cartão: o pagador digita na fatura do Asaas). Com
 * `UNDEFINED`, Pix ou boleto o Asaas também aceita — mas cada parcela vira uma COBRANÇA À PARTE (um
 * carnê) que a pessoa pode deixar de pagar depois da 1ª, e o ano de acesso sairia por R$ 14,91. No
 * cartão, o compromisso do ano inteiro é da operadora.
 *
 * SEM RENOVAÇÃO AUTOMÁTICA: o parcelamento acaba na 12ª parcela. Um ano depois a pessoa escolhe de
 * novo — nada é cobrado sozinho.
 */
export async function criarParcelamento(
  userId: UserId,
  clienteId: string,
  totalBrl: number,
  parcelas: number,
  descricao: string,
): Promise<ParcelaCriadaAsaas> {
  return criarComVolta<ParcelaCriadaAsaas>('/payments', {
    customer: clienteId,
    billingType: 'CREDIT_CARD',
    totalValue: totalBrl,
    installmentCount: parcelas,
    dueDate: amanha(),
    description: descricao,
    externalReference: String(userId),
  })
}

/** As parcelas de um parcelamento — a lista de faturas do 12x e o marco do arrependimento. */
export async function listarCobrancasDoParcelamento(
  parcelamentoId: string,
  limite = 24,
): Promise<CobrancaListadaAsaas[]> {
  const r = await chamar<{ data?: CobrancaListadaAsaas[] }>(
    `/installments/${encodeURIComponent(parcelamentoId)}/payments?limit=${limite}`,
  )
  return r.data ?? []
}

/**
 * ESTORNO INTEGRAL do parcelamento (arrependimento do 12x, CDC art. 49): `POST
 * /v3/installments/{id}/refund` sem `value` estorna o parcelamento INTEIRO no cartão
 * (docs.asaas.com/reference/estornar-parcelamento, conferido em 30/09/2026) — uma chamada só, e não
 * uma por parcela. Recusa sobe como exceção, e quem chama manda o pedido para a fila do admin.
 */
export async function estornarParcelamento(parcelamentoId: string, descricao: string): Promise<void> {
  await chamar(`/installments/${encodeURIComponent(parcelamentoId)}/refund`, {
    method: 'POST',
    body: JSON.stringify({ description: descricao.slice(0, 200) }),
  })
}

/**
 * Remove as parcelas ainda PENDENTES de um parcelamento (`DELETE /v3/installments/{id}`). Na
 * sondagem a remoção devolveu 500 na 1ª tentativa e 200 na 2ª — por isso ela é REPETIDA uma vez. 404
 * = já não existe lá, o mesmo resultado para quem pediu.
 */
export async function removerParcelamento(parcelamentoId: string): Promise<void> {
  const remover = () => chamar(`/installments/${encodeURIComponent(parcelamentoId)}`, { method: 'DELETE' })
  try {
    await remover()
  } catch (err) {
    if (String(err).includes('HTTP 404')) return
    if (!/HTTP 5\d\d/.test(String(err))) throw err
    await remover()
  }
}

/**
 * COBRANÇA AVULSA — pagamento único, não assinatura (créditos e Passe de Temporada).
 *
 * Irmã de `criarAssinatura` e igual em tudo que importa: mesmo `chamar`, mesmo `billingType:
 * 'UNDEFINED'` (o Asaas oferece Pix, boleto e cartão e o pagador escolhe), mesmo
 * `externalReference` com o userId — é por ele que o webhook sabe de quem é o pagamento.
 *
 * A diferença que o webhook enxerga: a cobrança avulsa NÃO tem `subscription`, e é assim que
 * `billing.ts` distingue "comprou moeda" de "pagou a mensalidade" antes de conceder qualquer
 * coisa. Sem essa distinção, uma compra de créditos promoveria o comprador a assinante.
 */
export async function criarCobrancaAvulsa(
  userId: UserId,
  clienteId: string,
  valorBrl: number,
  descricao: string,
): Promise<CobrancaAsaas> {
  // Vencimento em 3 dias: boleto e Pix precisam de janela; o crédito só entra na confirmação.
  const vence = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  return chamar<CobrancaAsaas>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: clienteId,
      billingType: 'UNDEFINED',
      value: valorBrl,
      dueDate: vence,
      description: descricao,
      externalReference: String(userId),
    }),
  })
}

/** A primeira cobrança da assinatura — é dela que sai o link de pagamento (`invoiceUrl`). */
export async function primeiraCobranca(assinaturaId: string): Promise<CobrancaAsaas | null> {
  const r = await chamar<{ data?: CobrancaAsaas[] }>(`/subscriptions/${assinaturaId}/payments?limit=1`)
  return r.data?.[0] ?? null
}

/**
 * Cancela a assinatura no Asaas (para de gerar cobranças). 404 = já não existe lá, o que para
 * quem pediu o cancelamento é o mesmo resultado — cancelar de novo não pode virar erro.
 */
export async function cancelarAssinatura(assinaturaId: string): Promise<void> {
  try {
    await chamar(`/subscriptions/${encodeURIComponent(assinaturaId)}`, { method: 'DELETE' })
  } catch (err) {
    if (String(err).includes('HTTP 404')) return
    throw err
  }
}

/** O que a assinatura diz de si mesma — só o que o cancelamento precisa. */
export interface AssinaturaDetalhadaAsaas {
  id: string
  /** O próximo vencimento: até lá o mês pago vale. `YYYY-MM-DD`. */
  nextDueDate?: string
  /** `ACTIVE`, `INACTIVE` ou `EXPIRED`. */
  status?: string
  /** Removida (o Asaas não apaga o registro: marca). É o que confirma um `SUBSCRIPTION_DELETED`. */
  deleted?: boolean
  /** O NOSSO userId, gravado ao criar — é o que prova de quem a assinatura é. */
  externalReference?: string
  /** O valor que a assinatura cobra a cada ciclo — é o que confirma uma troca de plano. */
  value?: number
}

export async function buscarAssinatura(assinaturaId: string): Promise<AssinaturaDetalhadaAsaas> {
  return chamar<AssinaturaDetalhadaAsaas>(`/subscriptions/${encodeURIComponent(assinaturaId)}`)
}

/**
 * TROCA DE PLANO — altera o VALOR (e a descrição) de uma assinatura que já existe: `PUT
 * /v3/subscriptions/{id}` (docs.asaas.com/reference/atualizar-assinatura-existente e
 * docs.asaas.com/docs/faq-assinaturas, conferidos em 09/10/2026).
 *
 * O QUE A DOCUMENTAÇÃO DIZ, e por que o corpo é este:
 *  - "Por padrão, as alterações são aplicadas às próximas cobranças da recorrência" — as que ainda
 *    vão ser geradas. Só que o Asaas gera cada cobrança 40 dias ANTES do vencimento (padrão da conta;
 *    configurável para 14 ou 7): numa assinatura mensal, a fatura do mês que vem quase sempre já
 *    existe quando a pessoa pede a troca. Sem `updatePendingPayments: true` ela sairia no valor
 *    antigo, e a troca "do próximo ciclo" só chegaria no seguinte.
 *  - `updatePendingPayments: true` "atualiza as propriedades possíveis de cobranças pendentes já
 *    existentes". Cobrança PAGA não é pendente: o que a pessoa já pagou não é tocado, e não há
 *    pro-rata — a regra da troca (`design.md` §11, item 11).
 *  - `nextDueDate` NÃO vai: a troca não mexe no vencimento.
 *
 * NÃO VERIFICADO NO SANDBOX: a página de referência lista os campos do corpo sem `value` (o guia de
 * perguntas frequentes diz que o valor é alterável por este PUT), e nenhuma das duas diz QUAIS
 * propriedades de uma cobrança pendente são "possíveis" de atualizar. Por isso a resposta é CONFERIDA:
 * se o Asaas devolver 200 sem o valor novo na assinatura, isto LANÇA, e quem chama não grava uma troca
 * que não aconteceu. E se a fatura pendente não for atualizada, ninguém recebe plano errado: o webhook
 * concede pelo valor PAGO, então ela mantém o plano atual e a troca chega na cobrança seguinte.
 *
 * IDEMPOTENTE por natureza: o PUT diz o estado final ("a assinatura vale X"), então repetir a chamada
 * — a pessoa tocou duas vezes, o tempo limite estourou depois de o Asaas aplicar — não cobra nada a
 * mais nem muda nada. Erro (rede, 4xx, 5xx, 404 da assinatura que não existe mais) sobe como exceção.
 */
export async function alterarValorDaAssinatura(
  assinaturaId: string,
  valorBrl: number,
  descricao: string,
): Promise<AssinaturaDetalhadaAsaas> {
  const a = await chamar<AssinaturaDetalhadaAsaas>(`/subscriptions/${encodeURIComponent(assinaturaId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value: valorBrl, description: descricao, updatePendingPayments: true }),
  })
  // Meio centavo, como em `planoPeloPagamento`: o Asaas devolve o valor em ponto flutuante.
  if (typeof a.value !== 'number' || Math.abs(a.value - valorBrl) >= 0.005) {
    throw new Error(`Asaas /subscriptions (PUT) não confirmou o valor novo: pedido ${valorBrl}, devolvido ${a.value}`)
  }
  return a
}

/**
 * A assinatura para o webhook CONFERIR um `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` antes de
 * parar a renovação de alguém (o par de `buscarPagamento`, e pelo mesmo motivo: o payload chega
 * autenticado só por um token estático). 404 → `null`: a assinatura não existe (mais) no Asaas —
 * quem chama decide o que isso prova. Erro real (rede/5xx) sobe, o webhook responde 500 e o Asaas
 * reentrega.
 */
export async function conferirAssinatura(assinaturaId: string): Promise<AssinaturaDetalhadaAsaas | null> {
  try {
    return await buscarAssinatura(assinaturaId)
  } catch (err) {
    if (String(err).includes('HTTP 404')) return null
    throw err
  }
}

/**
 * ESTORNO INTEGRAL de uma cobrança (arrependimento, CDC art. 49).
 *
 * `POST /v3/payments/{id}/refund` sem `value` estorna o valor inteiro
 * (docs.asaas.com/reference/estornar-cobranca, conferido em 24/09/2026). Vale para cartão
 * (confirmado ou recebido; a fatura do pagador mostra em até 10 dias úteis) e Pix. Boleto NÃO se
 * estorna pela API, e Pix recém-recebido pode esbarrar em saldo insuficiente (400): nos dois
 * casos a exceção sobe, e quem chama manda o pedido para a fila do admin — nunca some.
 */
export async function estornarCobranca(pagamentoId: string, descricao: string): Promise<void> {
  await chamar(`/payments/${encodeURIComponent(pagamentoId)}/refund`, {
    method: 'POST',
    body: JSON.stringify({ description: descricao.slice(0, 200) }),
  })
}

/** O pagamento como o ASAAS o conhece — a verdade autoritativa, não o payload do webhook. */
export interface PagamentoAsaas {
  id: string
  status: string
  value: number
  subscription?: string
  externalReference?: string
  /** Vencimento autoritativo: o payload forjado com data distante estenderia o período pago. */
  dueDate?: string
  /** O PARCELAMENTO a que a parcela pertence (12x) — presente só em parcela, sem `subscription`. */
  installment?: string
  /** Qual das parcelas (1 a 12): é o que ancora o ano no vencimento da PRIMEIRA. */
  installmentNumber?: number
  /** `CREDIT_CARD`, `PIX`, `BOLETO`… — o 12x só concede o ano no cartão. */
  billingType?: string
  /** Cobrança REMOVIDA (o Asaas marca, não apaga). É o que confirma um `PAYMENT_DELETED`. */
  deleted?: boolean
}

/**
 * GAP-011 (auditoria 2026-09-13): busca o pagamento na API do Asaas para o webhook CONFERIR o que o
 * payload afirma. O webhook chega autenticado só por um token estático; se ele vazar, um atacante
 * forja `value`/`status`/`subscription` e concede a si mesmo um plano. A API, autenticada pela nossa
 * `ASAAS_API_KEY`, é a fonte da verdade: aqui `value` e `status` vêm do provedor, não do atacante.
 *
 * 404 → `null` (pagamento inexistente = evento forjado ou ainda não propagado): o chamador trata como
 * não-aplicado, sem 500. Erro real (rede/5xx) sobe, o webhook responde 500 e o Asaas reentrega.
 */
export async function buscarPagamento(id: string): Promise<PagamentoAsaas | null> {
  try {
    return await chamar<PagamentoAsaas>(`/payments/${encodeURIComponent(id)}`)
  } catch (err) {
    if (String(err).includes('HTTP 404')) return null
    throw err
  }
}
