#!/usr/bin/env node
/**
 * ASAAS FALSO + PAINEL DA VITRINE (`npm run vitrine`).
 *
 * A vitrine sobe o app completo na máquina do dono para ele VER as telas de conta, plano e cobrança
 * sem depender de conta em serviço nenhum. O login é o Supabase falso dos testes
 * (`tests/e2e-publico/_supabase-falso.mjs`); a cobrança é este arquivo: a fatia da API do Asaas que
 * `server/lib/asaas.ts` usa, com fatura de mentira e webhook de verdade. O servidor do app não sabe a
 * diferença: `ASAAS_BASE_URL` aponta para cá e o webhook chega em `/api/billing/webhook/asaas` com o
 * token, como chegaria do Asaas.
 *
 * Três coisas num processo só:
 *   /            o painel: as contas prontas (um clique entra), as faturas e os eventos simuláveis
 *   /v3/*        a API falsa (clientes, assinaturas, cobranças, parcelamentos, estornos)
 *   /fatura/:id  a "página de pagamento" que o checkout abre numa aba
 *
 * Só escuta em 127.0.0.1 e nenhum dinheiro existe aqui. O estado fica em `VITRINE_ASAAS_ESTADO`
 * (JSON), para as assinaturas semeadas e as feitas pela tela sobreviverem a um reinício junto com o
 * banco da vitrine.
 *
 * O que este falso NÃO prova: o comportamento real do Asaas (quantos webhooks o 12x manda, prazos de
 * estorno, recusas). Isso é do sandbox, na lista de conferências do `docs/LANCAMENTO.md`.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, URLSearchParams } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const PORTA = Number(process.env.VITRINE_ASAAS_PORTA || 4361)
const BASE = `http://127.0.0.1:${PORTA}`
const APP = process.env.VITRINE_APP_URL || 'http://localhost:4360'
const SUPABASE = process.env.VITRINE_SUPABASE_URL || 'http://127.0.0.1:54360'
const TOKEN_DO_WEBHOOK = process.env.ASAAS_WEBHOOK_TOKEN || ''
const ARQUIVO_DE_ESTADO = process.env.VITRINE_ASAAS_ESTADO || ''
const CONTAS = JSON.parse(readFileSync(path.join(AQUI, 'contas.json'), 'utf8'))

/** @type {{clientes: Record<string, any>, assinaturas: Record<string, any>, pagamentos: Record<string, any>}} */
let estado = { clientes: {}, assinaturas: {}, pagamentos: {} }
if (ARQUIVO_DE_ESTADO && existsSync(ARQUIVO_DE_ESTADO)) {
  try {
    estado = { ...estado, ...JSON.parse(readFileSync(ARQUIVO_DE_ESTADO, 'utf8')) }
  } catch {
    console.warn('[asaas-falso] estado ilegível; começando vazio')
  }
}
const guardar = () => ARQUIVO_DE_ESTADO && writeFileSync(ARQUIVO_DE_ESTADO, JSON.stringify(estado, null, 2))

const hoje = () => new Date().toISOString().slice(0, 10)
const somarDias = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
const reais = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`
const escapar = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** O Asaas trunca a divisão e joga a diferença na última parcela (179 em 12x = 11 × 14,91 + 14,99). */
function valoresDasParcelas(total, n) {
  const base = Math.floor((total * 100) / n) / 100
  const ultima = Math.round((total - base * (n - 1)) * 100) / 100
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? ultima : base))
}

function novoPagamento(campos) {
  const id = campos.id || `pay_${randomUUID().slice(0, 12)}`
  const p = {
    status: 'PENDING',
    billingType: 'UNDEFINED',
    dueDate: hoje(),
    invoiceUrl: `${BASE}/fatura/${id}`,
    ...campos,
    id,
  }
  estado.pagamentos[id] = p
  return p
}

const pagamentosDe = (filtro) =>
  Object.values(estado.pagamentos)
    .filter(filtro)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))

/** Entrega um evento ao app, do jeito que o Asaas entrega: POST com o token no cabeçalho. */
async function webhook(evento, corpo) {
  const payload = { id: `evt_vitrine_${randomUUID()}`, event: evento, ...corpo }
  try {
    const r = await fetch(`${APP}/api/billing/webhook/asaas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN_DO_WEBHOOK },
      body: JSON.stringify(payload),
    })
    const texto = (await r.text()).slice(0, 200)
    console.log(`[asaas-falso] webhook ${evento} → ${r.status} ${texto}`)
    return { status: r.status, texto }
  } catch (err) {
    console.warn(`[asaas-falso] webhook ${evento} não entregue: ${err?.message || err}`)
    return { status: 0, texto: String(err?.message || err) }
  }
}

const doPagamento = (p) => ({
  payment: {
    id: p.id,
    subscription: p.subscription,
    installment: p.installment,
    installmentNumber: p.installmentNumber,
    value: p.value,
    dueDate: p.dueDate,
    billingType: p.billingType,
    externalReference: p.externalReference,
  },
})

/** Paga uma fatura: confirma, avança a assinatura e avisa o app. No 12x, as doze parcelas confirmam. */
async function pagar(p) {
  const confirmar = (x) => {
    x.status = 'CONFIRMED'
    x.billingType = 'CREDIT_CARD'
    x.confirmedDate = hoje()
    x.paymentDate = hoje()
  }
  const parcelas = p.installment
    ? pagamentosDe((x) => x.installment === p.installment).sort((a, b) => a.installmentNumber - b.installmentNumber)
    : [p]
  for (const x of parcelas) confirmar(x)
  const sub = p.subscription ? estado.assinaturas[p.subscription] : null
  if (sub) sub.nextDueDate = somarDias(p.dueDate, sub.cycle === 'YEARLY' ? 365 : 30)
  guardar()
  const entregas = []
  for (const x of parcelas) entregas.push(await webhook('PAYMENT_CONFIRMED', doPagamento(x)))
  return entregas
}

/** Os eventos que o painel deixa simular numa cobrança, para ver a reação do app. */
const EVENTOS = {
  async atraso(p) {
    p.status = 'OVERDUE'
    guardar()
    return webhook('PAYMENT_OVERDUE', doPagamento(p))
  },
  async estorno(p) {
    p.status = 'REFUNDED'
    guardar()
    return webhook('PAYMENT_REFUNDED', doPagamento(p))
  },
  async chargeback(p) {
    p.status = 'CHARGEBACK_REQUESTED'
    guardar()
    return webhook('PAYMENT_CHARGEBACK_REQUESTED', doPagamento(p))
  },
  /** A cobrança seguinte da assinatura nasce e é paga: a renovação. */
  async renovacao(p) {
    const sub = p.subscription ? estado.assinaturas[p.subscription] : null
    if (!sub) return { status: 0, texto: 'só assinatura renova' }
    const novo = novoPagamento({
      customer: p.customer,
      subscription: sub.id,
      value: sub.value,
      dueDate: sub.nextDueDate,
      externalReference: sub.externalReference,
    })
    return (await pagar(novo))[0]
  },
}

/* ------------------------------------------------------------------ HTTP */

async function lerCorpo(req) {
  const partes = []
  for await (const parte of req) partes.push(parte)
  const texto = Buffer.concat(partes).toString('utf8')
  if (!texto) return {}
  try {
    return JSON.parse(texto)
  } catch {
    return Object.fromEntries(new URLSearchParams(texto))
  }
}

const json = (res, status, corpo) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(corpo))
}
const html = (res, status, corpo) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(corpo)
}
const naoAchei = (res) =>
  json(res, 404, { errors: [{ code: 'not_found', description: 'não encontrado (Asaas falso)' }] })

async function api(req, res, caminho, url) {
  const m = req.method
  const corpo = m === 'POST' ? await lerCorpo(req) : {}

  if (caminho === '/customers' && m === 'POST') {
    const id = `cus_${randomUUID().slice(0, 12)}`
    estado.clientes[id] = { id, externalReference: corpo.externalReference }
    guardar()
    return json(res, 200, { id })
  }

  if (caminho === '/subscriptions' && m === 'POST') {
    const id = `sub_${randomUUID().slice(0, 12)}`
    const sub = {
      id,
      customer: corpo.customer,
      value: corpo.value,
      cycle: corpo.cycle,
      nextDueDate: corpo.nextDueDate,
      status: 'ACTIVE',
      externalReference: corpo.externalReference,
    }
    estado.assinaturas[id] = sub
    novoPagamento({
      customer: sub.customer,
      subscription: id,
      value: sub.value,
      dueDate: sub.nextDueDate,
      externalReference: sub.externalReference,
    })
    guardar()
    return json(res, 200, { id })
  }

  let r = /^\/subscriptions\/([^/]+)(\/payments)?$/.exec(caminho)
  if (r) {
    const sub = estado.assinaturas[decodeURIComponent(r[1])]
    if (!sub || sub.deleted) return naoAchei(res)
    if (r[2] && m === 'GET') {
      const limite = Number(url.searchParams.get('limit') || 24)
      return json(res, 200, { data: pagamentosDe((p) => p.subscription === sub.id).slice(0, limite) })
    }
    if (!r[2] && m === 'GET') return json(res, 200, { id: sub.id, nextDueDate: sub.nextDueDate, status: sub.status })
    if (!r[2] && m === 'DELETE') {
      sub.deleted = true
      sub.status = 'INACTIVE'
      guardar()
      return json(res, 200, { deleted: true, id: sub.id })
    }
  }

  if (caminho === '/payments' && m === 'POST') {
    if (corpo.installmentCount) {
      const parcelamento = `ins_${randomUUID().slice(0, 12)}`
      const valores = valoresDasParcelas(Number(corpo.totalValue), Number(corpo.installmentCount))
      const parcelas = valores.map((value, i) =>
        novoPagamento({
          customer: corpo.customer,
          installment: parcelamento,
          installmentNumber: i + 1,
          value,
          billingType: 'CREDIT_CARD',
          dueDate: somarDias(corpo.dueDate, i * 30),
          externalReference: corpo.externalReference,
        }),
      )
      guardar()
      return json(res, 200, { id: parcelas[0].id, installment: parcelamento, invoiceUrl: parcelas[0].invoiceUrl })
    }
    const p = novoPagamento({
      customer: corpo.customer,
      value: corpo.value,
      dueDate: corpo.dueDate,
      externalReference: corpo.externalReference,
    })
    guardar()
    return json(res, 200, { id: p.id, invoiceUrl: p.invoiceUrl })
  }

  r = /^\/payments\/([^/]+)(\/refund)?$/.exec(caminho)
  if (r) {
    const p = estado.pagamentos[decodeURIComponent(r[1])]
    if (!p) return naoAchei(res)
    if (!r[2] && m === 'GET') return json(res, 200, p)
    if (r[2] && m === 'POST') {
      p.status = 'REFUNDED'
      guardar()
      return json(res, 200, p)
    }
  }

  r = /^\/installments\/([^/]+)(\/payments|\/refund)?$/.exec(caminho)
  if (r) {
    const id = decodeURIComponent(r[1])
    const parcelas = pagamentosDe((p) => p.installment === id)
    if (!parcelas.length) return naoAchei(res)
    if (r[2] === '/payments' && m === 'GET') return json(res, 200, { data: parcelas })
    if (r[2] === '/refund' && m === 'POST') {
      for (const p of parcelas) if (p.status === 'CONFIRMED' || p.status === 'RECEIVED') p.status = 'REFUNDED'
      guardar()
      return json(res, 200, { id })
    }
    if (!r[2] && m === 'DELETE') {
      for (const p of parcelas) if (p.status === 'PENDING') delete estado.pagamentos[p.id]
      guardar()
      return json(res, 200, { deleted: true, id })
    }
  }

  return naoAchei(res)
}

/* ------------------------------------------------------------------ páginas */

const ESTILO = `
  :root { --fundo:#f6f5f1; --papel:#fff; --tinta:#1c1b19; --suave:#6b675f; --linha:#e3e0d8; --acento:#3b5bdb; --aviso:#8a5a00; --avisoFundo:#fff4d6; }
  @media (prefers-color-scheme: dark) { :root { --fundo:#141412; --papel:#1e1d1a; --tinta:#f1efe9; --suave:#a8a398; --linha:#34322d; --acento:#8ea2ff; --aviso:#ffd27a; --avisoFundo:#3a2f12; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--fundo); color:var(--tinta); font:15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 64px; display:grid; gap:28px; }
  h1 { font-size: 26px; margin:0; letter-spacing:-0.01em; }
  h2 { font-size: 17px; margin:0 0 10px; }
  p { margin:0; color:var(--suave); max-width: 70ch; }
  .aviso { background:var(--avisoFundo); color:var(--aviso); border-radius:10px; padding:10px 14px; font-size:14px; }
  .lista { display:grid; gap:8px; }
  .linha { background:var(--papel); border:1px solid var(--linha); border-radius:12px; padding:12px 14px; display:grid; grid-template-columns: minmax(0,1fr) auto; gap:6px 16px; align-items:center; }
  .linha b { font-weight:600; }
  .linha small { color:var(--suave); display:block; }
  .linha code { font: 13px ui-monospace, Consolas, monospace; color:var(--suave); }
  .acoes { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  a.botao, button { font: inherit; border:1px solid var(--linha); background:var(--papel); color:var(--tinta); border-radius:9px; padding:7px 12px; cursor:pointer; text-decoration:none; white-space:nowrap; }
  a.botao.pri, button.pri { background:var(--acento); border-color:var(--acento); color:#fff; }
  @media (prefers-color-scheme: dark) { a.botao.pri, button.pri { color:#10131f; } }
  .etiqueta { font-size:12px; border:1px solid var(--linha); border-radius:99px; padding:1px 8px; color:var(--suave); }
  form { display:inline; }
  .cartao { background:var(--papel); border:1px solid var(--linha); border-radius:14px; padding:24px; display:grid; gap:14px; max-width:460px; margin: 10vh auto 0; }
  .valor { font-size:30px; font-weight:650; font-variant-numeric: tabular-nums; }
  @media (max-width: 640px) { .linha { grid-template-columns: 1fr; } .acoes { justify-content:flex-start; } }
`

const pagina = (titulo, corpo) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(titulo)}</title><style>${ESTILO}</style></head><body>${corpo}</body></html>`

const ROTULO_DO_STATUS = {
  PENDING: 'aguardando pagamento',
  CONFIRMED: 'paga',
  RECEIVED: 'paga',
  OVERDUE: 'atrasada',
  REFUNDED: 'estornada',
  CHARGEBACK_REQUESTED: 'em contestação',
}

function painel() {
  /* O "entrar como" sempre cai na RAIZ do app: a sessão chega no fragmento da URL, e numa rota
     interna o roteador reescreve o endereço antes de o cliente de login ler o fragmento. A tela do
     rótulo fica num segundo botão, para depois de entrar. */
  const entrar = (c) =>
    `${SUPABASE}/vitrine/entrar?email=${encodeURIComponent(c.email)}&para=${encodeURIComponent(`${APP}/`)}`
  const contas = CONTAS.map(
    (c) => `<div class="linha">
      <div><b>${escapar(c.rotulo)}</b> <code>${escapar(c.email)}</code><small>${escapar(c.oQueVer)}</small></div>
      <div class="acoes">
        <a class="botao pri" href="${escapar(entrar(c))}" target="babel-vitrine">Entrar</a>
        ${c.rota && c.rota !== '/' ? `<a class="botao" href="${escapar(APP + c.rota)}" target="babel-vitrine">Abrir ${escapar(c.rota)}</a>` : ''}
      </div>
    </div>`,
  ).join('')

  const dono = (ref) => CONTAS.find((c) => c.id === ref)?.email || ref || 'sem dono'
  const cobrancas = pagamentosDe(() => true)
    .filter((p) => !p.installment || p.installmentNumber === 1)
    .slice(0, 40)
    .map((p) => {
      const tipo = p.subscription ? 'assinatura' : p.installment ? 'anual em 12x (parcela 1)' : 'avulsa'
      const botao = (ev, texto) =>
        `<form method="post" action="/vitrine/evento"><input type="hidden" name="pagamento" value="${escapar(p.id)}"><input type="hidden" name="tipo" value="${ev}"><button>${texto}</button></form>`
      const paga = p.status === 'CONFIRMED' || p.status === 'RECEIVED'
      return `<div class="linha">
        <div><b>${reais(p.value)}</b> <span class="etiqueta">${escapar(ROTULO_DO_STATUS[p.status] || p.status)}</span> <code>${escapar(dono(p.externalReference))}</code><small>${tipo} · vence ${escapar(p.dueDate)}</small></div>
        <div class="acoes">
          ${p.status === 'PENDING' ? `<a class="botao" href="/fatura/${escapar(p.id)}" target="_blank">Abrir fatura</a>${botao('atraso', 'Deixar atrasar')}` : ''}
          ${paga && p.subscription ? botao('renovacao', 'Renovar') : ''}
          ${paga ? botao('estorno', 'Estornar') + botao('chargeback', 'Contestar') : ''}
        </div>
      </div>`
    })
    .join('')

  return pagina(
    'Vitrine do Babel Play',
    `<main>
      <header style="display:grid;gap:8px">
        <h1>Vitrine do Babel Play</h1>
        <p>O app completo rodando nesta máquina, com login e cobrança de mentira. Cada conta abaixo está num estado diferente de plano; um clique entra nela. Nada aqui fala com Supabase, Asaas ou e-mail de verdade.</p>
        <div class="aviso">App em <a href="${escapar(APP)}" target="babel-vitrine">${escapar(APP)}</a>. Clique em Entrar e, com a conta aberta, no segundo botão para ir direto à tela do rótulo. Para trocar de conta, entre em outra: a sessão anterior é substituída. Criar conta pela tela de login também funciona (qualquer e-mail, sem confirmação).</div>
      </header>
      <section><h2>Contas prontas</h2><div class="lista">${contas}</div></section>
      <section><h2>Cobranças</h2>
        <p style="margin-bottom:10px">As faturas que o checkout cria aparecem aqui. Os botões simulam o que o Asaas avisaria ao app (pagamento atrasado, estorno, contestação no cartão, renovação).</p>
        <div class="lista">${cobrancas || '<p>Nenhuma cobrança ainda. Assine pelo app com a conta Grátis para criar a primeira.</p>'}</div>
      </section>
    </main>`,
  )
}

function fatura(p, mensagem) {
  const paga = p.status === 'CONFIRMED' || p.status === 'RECEIVED'
  const descricao = p.subscription
    ? 'Assinatura do Babel Play'
    : p.installment
      ? 'Babel Play anual em 12x no cartão'
      : 'Compra avulsa no Babel Play'
  return pagina(
    'Fatura de mentira',
    `<div class="cartao">
      <span class="etiqueta" style="justify-self:start">Fatura de mentira · vitrine local</span>
      <div><div class="valor">${reais(p.value)}</div><p>${descricao} · vence ${escapar(p.dueDate)}</p></div>
      ${mensagem ? `<div class="aviso">${escapar(mensagem)}</div>` : ''}
      ${
        paga
          ? '<p>Paga. Pode fechar esta aba: o Babel Play já foi avisado.</p>'
          : p.status === 'PENDING'
            ? `<form method="post" action="/fatura/${escapar(p.id)}/pagar"><button class="pri" style="width:100%;padding:12px">Pagar com cartão de teste</button></form>
               <p>Nenhum dinheiro existe aqui. O botão confirma a cobrança e manda ao app o mesmo aviso que o Asaas mandaria.</p>`
            : `<p>Esta cobrança está ${escapar(ROTULO_DO_STATUS[p.status] || p.status)}.</p>`
      }
    </div>`,
  )
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  const p = url.pathname
  try {
    if (p.startsWith('/v3/')) return await api(req, res, p.slice(3), url)

    if (p === '/' && req.method === 'GET') return html(res, 200, painel())

    const f = /^\/fatura\/([^/]+)(\/pagar)?$/.exec(p)
    if (f) {
      const pagamento = estado.pagamentos[decodeURIComponent(f[1])]
      if (!pagamento) return html(res, 404, pagina('Fatura', '<div class="cartao"><p>Fatura não encontrada.</p></div>'))
      if (f[2] && req.method === 'POST') {
        if (pagamento.status !== 'PENDING') return html(res, 200, fatura(pagamento))
        const entregas = await pagar(pagamento)
        const falhou = entregas.find((e) => e.status !== 200)
        return html(
          res,
          200,
          fatura(pagamento, falhou ? `O app não aceitou o aviso (${falhou.status}): ${falhou.texto}` : ''),
        )
      }
      return html(res, 200, fatura(pagamento))
    }

    if (p === '/vitrine/evento' && req.method === 'POST') {
      const corpo = await lerCorpo(req)
      const pagamento = estado.pagamentos[corpo.pagamento]
      const acao = EVENTOS[corpo.tipo]
      if (pagamento && acao) await acao(pagamento)
      res.writeHead(303, { location: '/' })
      return res.end()
    }

    /* O semeador (`scripts/vitrine/semear.ts`) registra aqui as assinaturas das contas prontas, com
       os mesmos ids que gravou no banco do app: sem isso, "Sua assinatura" pediria ao Asaas uma
       assinatura que ele não conhece. Substitui pelo id, então rodar de novo não duplica. */
    if (p === '/vitrine/registrar' && req.method === 'POST') {
      const corpo = await lerCorpo(req)
      for (const c of corpo.clientes || []) estado.clientes[c.id] = c
      for (const ref of corpo.limpar || []) {
        for (const x of Object.values(estado.pagamentos))
          if (x.externalReference === ref) delete estado.pagamentos[x.id]
        for (const x of Object.values(estado.assinaturas))
          if (x.externalReference === ref) delete estado.assinaturas[x.id]
      }
      for (const s of corpo.assinaturas || []) estado.assinaturas[s.id] = s
      for (const x of corpo.pagamentos || []) novoPagamento(x)
      guardar()
      return json(res, 200, { ok: true })
    }

    if (p === '/vitrine/saude') return json(res, 200, { ok: true })
    return naoAchei(res)
  } catch (err) {
    console.error('[asaas-falso] erro', err)
    return json(res, 500, { errors: [{ description: String(err?.message || err) }] })
  }
})

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`[asaas-falso] painel e API em ${BASE}`)
})
