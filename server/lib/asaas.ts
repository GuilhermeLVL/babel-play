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
import type { UserId } from './authContext'

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

/** Cria a assinatura mensal. `billingType: 'UNDEFINED'` deixa o pagador escolher Pix ou cartão. */
export async function criarAssinatura(
  userId: UserId,
  clienteId: string,
  valorBrl: number,
  descricao: string,
): Promise<AssinaturaAsaas> {
  const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  return chamar<AssinaturaAsaas>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: clienteId,
      billingType: 'UNDEFINED',
      value: valorBrl,
      nextDueDate: amanha,
      cycle: 'MONTHLY',
      description: descricao,
      externalReference: String(userId),
    }),
  })
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
  status?: string
}

export async function buscarAssinatura(assinaturaId: string): Promise<AssinaturaDetalhadaAsaas> {
  return chamar<AssinaturaDetalhadaAsaas>(`/subscriptions/${encodeURIComponent(assinaturaId)}`)
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
