/**
 * O ALERTA POR E-MAIL (Fase 1 do plano de garantias): no Worker, nada do que o servidor registra chegava a alguém.
 * Aqui o `log()` real entrega a linha saneada ao destino de e-mail, com Resend falso. Prova:
 *   - o que alerta: todo `error` e os `warn` de `AVISOS_QUE_ALERTAM` (inclusive a cobrança divergente);
 *   - o que NÃO alerta: `warn` comum, e os eventos do próprio envio (sem laço);
 *   - ruído: um e-mail por evento por hora, com `Idempotency-Key`, e teto por hora;
 *   - saneamento: e-mail, `Bearer` e chave no texto do erro não chegam ao corpo;
 *   - sem configuração, nada liga; falha do Resend nunca lança.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { desligarAlertaDoWorkerParaTeste, ligarAlertaDoWorker } from '../../server/boot/alertaDoWorker'
import { sinkDeAlertaPorEmail } from '../../server/lib/alertaPorEmail'
import { configDoAlertaPorEmail } from '../../server/lib/config'
import { AVISOS_QUE_ALERTAM, log, registrarSinkDeErro } from '../../server/lib/logger'

interface Pedido {
  url: string
  headers: Record<string, string>
  corpo: { from: string; to: string[]; subject: string; text: string }
}

function resendFalso(status = 200) {
  const pedidos: Pedido[] = []
  const buscar = (async (url: string, init: RequestInit) => {
    pedidos.push({
      url,
      headers: init.headers as Record<string, string>,
      corpo: JSON.parse(String(init.body)),
    })
    return new Response('{}', { status })
  }) as unknown as typeof fetch
  return { pedidos, buscar }
}

const opcoes = (buscar: typeof fetch, extra: object = {}) => ({
  chave: 're_chave_secreta',
  remetente: 'Frasy <nao-responda@frasy.com.br>',
  destino: 'dono@exemplo.com',
  ambiente: 'production',
  buscar,
  ...extra,
})
const solta = () => new Promise((r) => setTimeout(r, 0))

let desregistrar: (() => void) | null = null
afterEach(() => {
  desregistrar?.()
  desregistrar = null
  desligarAlertaDoWorkerParaTeste()
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('o que vira e-mail', () => {
  it('todo log de erro vira um e-mail para o destino, com o evento no assunto', async () => {
    const { pedidos, buscar } = resendFalso()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar)))
    log('error', { event: 'job_falhou', route: 'retencaoDeAudio', error: 'falhou ao podar' })
    await solta()
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].url).toBe('https://api.resend.com/emails')
    expect(pedidos[0].corpo.to).toEqual(['dono@exemplo.com'])
    expect(pedidos[0].corpo.subject).toContain('job_falhou')
    expect(pedidos[0].corpo.text).toContain('falhou ao podar')
    expect(pedidos[0].headers.Authorization).toBe('Bearer re_chave_secreta')
  })

  it('cobrança divergente (warn) alerta; warn comum não', async () => {
    const { pedidos, buscar } = resendFalso()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar)))
    for (const e of [
      'billing_assinatura_divergente',
      'billing_plano_divergente',
      'billing_parcelamento_divergente',
      'billing_parcela_ambigua',
      'billing_valor_ambiguo',
      'billing_webhook_sem_referencia',
    ]) {
      expect(AVISOS_QUE_ALERTAM.has(e), e).toBe(true)
      log('warn', { event: e })
    }
    log('warn', { event: 'um_aviso_qualquer_sem_importancia' })
    await solta()
    expect(pedidos).toHaveLength(6)
    expect(pedidos.map((p) => p.corpo.subject).join(' ')).not.toContain('sem_importancia')
  })
})

describe('ruído controlado', () => {
  it('um e-mail por evento por hora, com Idempotency-Key; a hora seguinte recomeça', async () => {
    const { pedidos, buscar } = resendFalso()
    let agora = Date.UTC(2026, 10, 3, 10, 5)
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar, { relogio: () => agora })))
    for (let i = 0; i < 50; i++) log('error', { event: 'erro_do_cliente', error: 'x' })
    await solta()
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].headers['Idempotency-Key']).toMatch(/^alerta-erro_do_cliente-\d+$/)
    agora += 3_600_000
    log('error', { event: 'erro_do_cliente', error: 'x' })
    await solta()
    expect(pedidos).toHaveLength(2)
    expect(pedidos[1].headers['Idempotency-Key']).not.toBe(pedidos[0].headers['Idempotency-Key'])
  })

  it('aviso de estado (ia_sem_reserva) sai no máximo uma vez por dia, não por hora', async () => {
    const { pedidos, buscar } = resendFalso()
    let agora = Date.UTC(2026, 10, 3, 1, 0)
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar, { relogio: () => agora })))
    log('warn', { event: 'ia_sem_reserva' })
    agora += 3 * 3_600_000
    log('warn', { event: 'ia_sem_reserva' })
    await solta()
    expect(pedidos).toHaveLength(1)
    agora += 24 * 3_600_000
    log('warn', { event: 'ia_sem_reserva' })
    await solta()
    expect(pedidos).toHaveLength(2)
  })

  it('o teto por hora segura uma enxurrada de eventos diferentes', async () => {
    const { pedidos, buscar } = resendFalso()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar, { maximoPorHora: 3 })))
    for (let i = 0; i < 10; i++) log('error', { event: `evento_${i}`, error: 'x' })
    await solta()
    expect(pedidos).toHaveLength(3)
  })

  it('o que falha no próprio envio nunca alerta (sem laço)', async () => {
    const { pedidos, buscar } = resendFalso()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar)))
    log('error', { event: 'segundo_plano_falhou', error: 'x' })
    log('error', { event: 'alerta_email_falhou', error: 'x' })
    await solta()
    expect(pedidos).toHaveLength(0)
  })
})

describe('saneamento e falha', () => {
  it('e-mail, Bearer e chave no texto do erro não chegam ao corpo', async () => {
    const { pedidos, buscar } = resendFalso()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar)))
    log('error', {
      event: 'billing_error',
      error: 'falhou para maria@exemplo.com com Authorization: Bearer abc123segredo e sk-or-v1-chave1234567890abcdef',
    })
    await solta()
    const texto = pedidos[0].corpo.text
    expect(texto).not.toContain('maria@exemplo.com')
    expect(texto).not.toContain('abc123segredo')
    expect(texto).not.toContain('sk-or-v1-chave1234567890abcdef')
  })

  it('Resend recusando ou fora do ar não lança nem vira alerta de si mesmo', async () => {
    const { pedidos, buscar } = resendFalso(500)
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(buscar)))
    expect(() => log('error', { event: 'job_falhou', error: 'x' })).not.toThrow()
    await solta()
    await solta()
    expect(pedidos).toHaveLength(1)
    const caiu = (async () => {
      throw new Error('rede caiu')
    }) as unknown as typeof fetch
    desregistrar()
    desregistrar = registrarSinkDeErro(sinkDeAlertaPorEmail(opcoes(caiu)))
    expect(() => log('error', { event: 'outro_erro', error: 'x' })).not.toThrow()
    await solta()
  })
})

describe('ligar no Worker', () => {
  it('o ambiente distingue staging (Asaas em sandbox) de produção', () => {
    const base = {
      ALERTA_EMAIL_DESTINO: 'a@b.c',
      RESEND_API_KEY: 'k',
      EMAIL_REMETENTE: 'F <a@b.c>',
      NODE_ENV: 'production',
    }
    expect(configDoAlertaPorEmail({ ...base, ASAAS_SANDBOX: '1' } as NodeJS.ProcessEnv)?.ambiente).toBe('staging')
    expect(configDoAlertaPorEmail(base as NodeJS.ProcessEnv)?.ambiente).toBe('production')
  })

  it('sem as três variáveis, nada liga', () => {
    expect(configDoAlertaPorEmail({} as NodeJS.ProcessEnv)).toBeNull()
    expect(
      configDoAlertaPorEmail({ ALERTA_EMAIL_DESTINO: 'a@b.c', RESEND_API_KEY: 'k' } as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(ligarAlertaDoWorker({} as NodeJS.ProcessEnv)).toBe(false)
  })

  it('com a configuração liga uma vez só (idempotente) e passa a alertar', async () => {
    const env = {
      ALERTA_EMAIL_DESTINO: 'dono@exemplo.com',
      RESEND_API_KEY: 're_x',
      EMAIL_REMETENTE: 'Frasy <nao-responda@frasy.com.br>',
    } as NodeJS.ProcessEnv
    const fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchFalso)
    expect(ligarAlertaDoWorker(env)).toBe(true)
    expect(ligarAlertaDoWorker(env)).toBe(true)
    log('error', { event: 'worker_requisicao_falhou', error: 'x' })
    await solta()
    expect(fetchFalso).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
