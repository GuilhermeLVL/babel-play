import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, type Route, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto, irAoInterpretePeloMenu } from './_helpers'

/**
 * O ASSISTENTE AO VIVO NAS TELAS DA PÁGINA (Fase C3): a legenda da captura e o Intérprete, com as rotas do assistente
 * SIMULADAS (`page.route`): nenhuma chamada de IA sai do teste. O app roda em self-host (plano `selfhost`, sem teto).
 *
 * Prova: a legenda da captura mostra o destaque (silencioso, só atributos), tocar mostra o sentido no cartão da
 * palavra, "Como respondo?" sai da folha da frase; no Intérprete, o botão "Como respondo?" fica junto da última fala
 * da outra pessoa (frente a frente e na lista) e traz as sugestões; com a flag desligada, nada pago aparece e nenhuma
 * rota do assistente é chamada.
 *
 * Com `ASSIST_TELAS=<pasta>`, fotografa a captura e o Intérprete, claro e escuro, no computador e no celular.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

const PASTA = process.env.ASSIST_TELAS
const foto = async (page: Page, nome: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(PASTA, `${nome}.png`) })
}
const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)
const aparelho = () => (test.info().project.name === 'mobile-375' ? 'celular' : 'computador')

interface Pedidos {
  expressoes: number
  termos: number
  comoRespondo: number
}

/** As rotas do assistente simuladas, a flag e o consentimento de nuvem (o de quem já autorizou em Privacidade). */
async function prepararRotas(page: Page, o: { flag: boolean }): Promise<Pedidos> {
  const pedidos: Pedidos = { expressoes: 0, termos: 0, comoRespondo: 0 }
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { assistente_ao_vivo: { ligada: o.flag } } } }))
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    const resposta = await route.fetch()
    const s = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
    if (pedido.method() !== 'GET') {
      const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
      return route.fulfill({ json: { ...s, ui: JSON.stringify(corpo.ui ?? {}) } })
    }
    try {
      const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
      const p = (ui.preferencias ?? {}) as Record<string, unknown>
      p.consentimentos = { ...((p.consentimentos as object) ?? {}), nuvem: true }
      ui.preferencias = p
      s.ui = JSON.stringify(ui)
    } catch {
      /* ui ilegível: fica como veio */
    }
    return route.fulfill({ response: resposta, json: s })
  })
  await page.route('**/api/ai/assistente/expressoes', async (r: Route) => {
    pedidos.expressoes++
    const { frase } = r.request().postDataJSON() as { frase: string }
    const expressoes = /break a leg/i.test(frase)
      ? [{ trecho: 'break a leg', sentido: 'boa sorte (antes de uma apresentação)', tipo: 'idiomatica' }]
      : []
    return r.fulfill({ json: { expressoes, restanteHoje: 180 } })
  })
  await page.route('**/api/ai/assistente/termos', (r) => {
    pedidos.termos++
    return r.fulfill({ json: { termos: [], restanteHoje: 180 } })
  })
  await page.route('**/api/ai/assistente/como-respondo', async (r) => {
    pedidos.comoRespondo++
    await new Promise((ok) => setTimeout(ok, 600))
    return r.fulfill({
      json: {
        sugestoes: [
          { texto: 'Thanks! I really needed that.', traducao: 'Valeu! Eu precisava disso.', tom: 'informal' },
          { texto: 'Thank you, I will do my best.', traducao: 'Obrigado, vou dar o meu melhor.', tom: 'neutro' },
          { texto: 'I appreciate your support.', traducao: 'Agradeço o seu apoio.', tom: 'formal' },
        ],
        restanteHoje: 179,
      },
    })
  })
  return pedidos
}

/** As flags simuladas já no cache (a primeira leitura da tela é a do cache). */
const esperarFlags = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 30 && !localStorage.getItem('babel.flags')?.includes('assistente_ao_vivo'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })

const FRASES: Array<[string, string]> = [
  ['The report was ambiguous, so we checked it twice.', 'O relatório era ambíguo, então conferimos duas vezes.'],
  ['Break a leg tonight, even if the script is ambiguous!', 'Arrasa hoje à noite, mesmo que o roteiro seja ambíguo!'],
]
const falarTraduzido = (page: Page, pares: Array<[string, string]>) =>
  page.evaluate(
    (ps) =>
      (window as unknown as { __simFalas: (t: string[], f?: string, l?: string, tr?: string[]) => number }).__simFalas(
        ps.map((p) => p[0]),
        undefined,
        'en',
        ps.map((p) => p[1]),
      ),
    pares,
  )

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'computador e celular bastam: o tablet é o layout do computador')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
  await page.addInitScript(() => {
    if (sessionStorage.getItem('assist-limpo')) return
    sessionStorage.setItem('assist-limpo', '1')
    for (const k of ['babel.assistente', 'babel.flags', 'theme']) localStorage.removeItem(k)
  })
})

/* ───────────────────────────── a captura ───────────────────────────── */

async function capturaComFalas(page: Page) {
  await abrirTela(page, '/capturar')
  await esperarFlags(page)
  await tema(page, false)
  await iniciarCaptura(page)
  await falarTraduzido(page, FRASES)
  await expect(page.locator('.q-linha-da-fala .q-o').last()).toHaveText(FRASES[1][0], { timeout: 20_000 })
}

test('captura: o destaque silencioso na legenda, o sentido no cartão e "Como respondo?" na folha da frase', async ({
  page,
}) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: true })
  await capturaComFalas(page)

  /* O destaque chega sozinho, sem aviso: o fio pontilhado na palavra, com o sentido no title. */
  const linha = page.locator('.q-linha-da-fala').last()
  const expressao = linha.locator('.q-o .asst-marca[data-marca="expressao"]')
  await expect(expressao.first()).toHaveAttribute('title', /boa sorte/, { timeout: 10_000 })
  await expect(expressao).toHaveText(['Break', ' ', 'a', ' ', 'leg'])
  await expect(page.locator('.q-o .asst-marca[data-marca="nivel"]').first()).toBeVisible()
  /* Uma chamada por linha final; a primeira linha não tem sigla. */
  expect(pedidos.expressoes).toBeLessThanOrEqual(2)
  expect(pedidos.termos).toBe(0)
  /* Nada focável a mais dentro da linha (ela já é um botão). */
  await expect(linha.locator('.q-o [tabindex]')).toHaveCount(0)

  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `captura-${aparelho()}-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)

  /* Tocar na expressão: o cartão da palavra abre com o tipo e o sentido. */
  await expressao.first().click()
  const cartao = page.locator('.folha-da-palavra')
  await expect(cartao.locator('.folha-realce')).toHaveText(/Expressão/i, { timeout: 10_000 })
  await expect(cartao.locator('.folha-glosa')).toContainText('boa sorte')
  await foto(page, `captura-${aparelho()}-cartao-claro`)

  /* "Voltar à frase": os destaques da frase e "Como respondo?" nas ações. */
  await clicarRobusto(page, page.getByRole('button', { name: 'Voltar à frase' }))
  await expect(page.locator('.folha-destaques .asst-marca').first()).toBeVisible()
  await clicarRobusto(page, page.getByRole('button', { name: 'Como respondo?' }))
  const folha = page.getByRole('dialog', { name: 'Como respondo?' })
  await expect(folha).toContainText('Pensando em respostas…')
  await expect(folha.locator('.leg-sugestao')).toHaveCount(3, { timeout: 10_000 })
  await expect(folha).toContainText('Valeu! Eu precisava disso.')
  expect(pedidos.comoRespondo).toBe(1)
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `captura-${aparelho()}-como-respondo-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)
  await folha.getByRole('button', { name: 'Fechar as sugestões' }).click()
  await expect(folha).toHaveCount(0)
})

test('flag desligada: na captura, só as palavras acima do nível; nada pago e nenhuma rota chamada', async ({
  page,
}) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: false })
  await capturaComFalas(page)
  await expect(page.locator('.q-o .asst-marca[data-marca="nivel"]').first()).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(2000)
  await expect(page.locator('.asst-marca[data-marca="expressao"]')).toHaveCount(0)
  await clicarRobusto(page, page.locator('.q-linha-da-fala').last().getByRole('button', { name: 'Opções da fala' }))
  await expect(page.getByRole('button', { name: 'Ouvir devagar' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Como respondo?' })).toHaveCount(0)
  expect(pedidos).toEqual({ expressoes: 0, termos: 0, comoRespondo: 0 })
})

/* ───────────────────────────── o Intérprete ───────────────────────────── */

/** A Web Speech, o tradutor do navegador e a voz do aparelho, falsos (como em `modo-interprete.e2e.ts`). */
async function falsos(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const FRASES: Record<string, string> = { pt: 'bom dia a todos', en: 'good morning everyone, break a leg today' }
    type Ev = { error?: string; resultIndex?: number; results?: unknown }
    class Falso {
      lang = ''
      continuous = false
      interimResults = false
      maxAlternatives = 1
      onresult: ((e: Ev) => void) | null = null
      onerror: ((e: Ev) => void) | null = null
      onend: (() => void) | null = null
      onstart: (() => void) | null = null
      onaudiostart: (() => void) | null = null
      onsoundstart: (() => void) | null = null
      onsoundend: (() => void) | null = null
      private parado = false
      start() {
        setTimeout(() => {
          if (this.parado) return
          this.onstart?.()
          this.onaudiostart?.()
          this.onsoundstart?.()
          setTimeout(() => {
            if (this.parado) return
            const texto = FRASES[this.lang.slice(0, 2)] ?? 'frase'
            const r = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: true })
            this.onresult?.({ resultIndex: 0, results: { length: 1, 0: r } })
          }, 400)
        }, 200)
      }
      stop() {
        if (this.parado) return
        this.parado = true
        setTimeout(() => this.onend?.(), 0)
      }
      abort() {
        this.stop()
      }
    }
    w.SpeechRecognition = Falso
    w.webkitSpeechRecognition = Falso
    w.Translator = {
      availability: async () => 'available',
      create: async () => ({ translate: async (t: string) => `[trad] ${t}` }),
    }
    let falando = false
    const synth = {
      get speaking() {
        return falando
      },
      paused: false,
      pending: false,
      onvoiceschanged: null,
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      cancel: () => {
        falando = false
      },
      pause: () => {},
      resume: () => {},
      speak: (u: SpeechSynthesisUtterance) => {
        falando = true
        setTimeout(() => {
          u.onstart?.(new Event('start') as SpeechSynthesisEvent)
          setTimeout(() => {
            falando = false
            u.onend?.(new Event('end') as SpeechSynthesisEvent)
          }, 300)
        }, 50)
      },
    }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    try {
      localStorage.setItem('babel.interprete.modo', 'toque')
    } catch {
      /* sem armazenamento: o teste falha adiante */
    }
  })
}

test('Intérprete: "Como respondo?" junto da última fala da outra pessoa, com as sugestões; a marca na lista', async ({
  page,
}) => {
  test.slow()
  const pedidos = await prepararRotas(page, { flag: true })
  await falsos(page)
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await esperarFlags(page)
  await irAoInterpretePeloMenu(page)
  const pronta = page.getByTestId('conversa-pronta')
  await expect(pronta).toBeVisible({ timeout: 15_000 })
  await tema(page, false)

  /* A outra pessoa fala inglês: a tradução aparece na metade da pessoa, com o "Como respondo?" embaixo. */
  await clicarRobusto(page, pronta.getByRole('button', { name: /Falar em English/ }))
  const comoTranscrever = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
  if (await comoTranscrever.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await clicarRobusto(page, comoTranscrever.getByRole('button', { name: /Rápido/ }).first())
    await clicarRobusto(page, comoTranscrever.getByRole('button', { name: /Baixar e iniciar|^Iniciar$|Continuar/ }))
  }
  const conversa = page.getByTestId('modo-interprete')
  await expect(conversa).toBeVisible({ timeout: 10_000 })
  const minha = conversa.getByTestId('interprete-meu')
  /* A tradução é a do motor de verdade (local); o original dela fica embaixo, na metade da pessoa. */
  await expect(minha.locator('.int-original')).toHaveText('good morning everyone, break a leg today', {
    timeout: 15_000,
  })
  const botao = minha.getByRole('button', { name: /Como respondo\?/ })
  await expect(botao).toBeVisible({ timeout: 10_000 })
  await expect(conversa).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
  /* O destaque no original dela, silencioso (só atributos dentro da região anunciada). */
  await expect(minha.locator('.int-original .asst-marca[data-marca="expressao"]').first()).toHaveAttribute(
    'title',
    /break a leg: boa sorte/,
    { timeout: 10_000 },
  )
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `interprete-${aparelho()}-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)

  await botao.click()
  const folha = conversa.getByRole('dialog', { name: 'Como respondo?' })
  await expect(folha.locator('.leg-sugestao')).toHaveCount(3, { timeout: 10_000 })
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `interprete-${aparelho()}-como-respondo-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)
  await folha.getByRole('button', { name: 'Fechar as sugestões' }).click()
  await expect(folha).toHaveCount(0)
  expect(pedidos.comoRespondo).toBe(1)

  /* Na lista: o botão embaixo da última bolha da outra pessoa, e a marca alcançável que abre o sentido. */
  await clicarRobusto(page, conversa.getByTestId('tela-conversa'))
  const lista = conversa.getByTestId('interprete-conversa')
  await expect(lista.getByRole('button', { name: /Como respondo\?/ })).toBeVisible()
  const marca = lista.locator('[data-marca-foco][data-marca="expressao"]').first()
  await expect(marca).toBeVisible()
  await foto(page, `interprete-${aparelho()}-lista-claro`)
  await marca.click()
  const cartao = conversa.getByRole('dialog', { name: /Palavra: break a leg/i })
  await expect(cartao).toContainText('boa sorte')
  await foto(page, `interprete-${aparelho()}-cartao-claro`)
  if (PASTA) {
    await tema(page, true)
    await foto(page, `interprete-${aparelho()}-lista-escuro`)
    await tema(page, false)
  }
  /* Uma chamada de expressões para a fala dela (a da pessoa, no idioma dela, não vai à nuvem). */
  expect(pedidos.expressoes).toBe(1)
})
