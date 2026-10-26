import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page, type Route, test } from '@playwright/test'

import { clicarRobusto, irAoInterpretePeloMenu } from './_helpers'

/**
 * "PRATICAR A CONVERSA" NO INTÉRPRETE, com as rotas do assistente SIMULADAS (`page.route`: nenhuma IA sai do teste) e a
 * Web Speech, o tradutor e a voz falsos. Prova: ligar "Praticar" na tela pronta põe a metade da pessoa no idioma que ela
 * aprende; a fala dela nesse idioma ganha a correção gentil na metade dela; a fala da OUTRA pessoa, no mesmo idioma,
 * nunca vai à `/correcao`; "Falar esta" lê uma sugestão e a fala é comparada com ela.
 *
 * Com `PRATICAR_TELAS=<pasta>`, fotografa o botão e a correção, claro e escuro.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
})

const PASTA = process.env.PRATICAR_TELAS
const aparelho = () => (test.info().project.name === 'mobile-375' ? 'celular' : 'computador')
const foto = async (page: Page, nome: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(PASTA, `${nome}-${aparelho()}.png`) })
}
const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)
const fotosNosDoisTemas = async (page: Page, nome: string) => {
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `${nome}-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)
}

/** O que cada um "diz" ao microfone, na ordem (a Web Speech falsa tira uma frase por vez). */
const DELA_1 = 'Where do you want to go tomorrow?'
const MINHA_1 = 'I want go to the beach tomorrow'
const MINHA_2 = 'It was great, thanks'
const DELA_2 = 'Sounds good, I goed there last summer'
const SUGESTAO = 'It was really great, thanks!'

async function prepararRotas(page: Page) {
  const correcoes: string[] = []
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { assistente_ao_vivo: { ligada: true } } } }))
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    /* SEMPRE um GET ao servidor: repassar o PUT gravaria no banco o consentimento simulado. */
    const resposta = await route.fetch({ method: 'GET', postData: undefined })
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
  await page.route('**/api/ai/assistente/expressoes', (r) => r.fulfill({ json: { expressoes: [], restanteHoje: 180 } }))
  await page.route('**/api/ai/assistente/termos', (r) => r.fulfill({ json: { termos: [], restanteHoje: 180 } }))
  await page.route('**/api/ai/assistente/como-respondo', (r) =>
    r.fulfill({
      json: {
        sugestoes: [
          { texto: SUGESTAO, traducao: 'Foi ótimo mesmo, valeu!', tom: 'informal' },
          { texto: 'It was lovely, thank you.', traducao: 'Foi uma delícia, obrigado.', tom: 'neutro' },
        ],
        restanteHoje: 179,
      },
    }),
  )
  await page.route('**/api/ai/assistente/correcao', async (r: Route) => {
    const { minhaFala } = r.request().postDataJSON() as { minhaFala: string }
    correcoes.push(minhaFala)
    const corrigida = minhaFala === MINHA_1 ? 'I want to go to the beach tomorrow.' : minhaFala
    return r.fulfill({
      json: {
        correcao: { ok: minhaFala !== MINHA_1, corrigida, dica: 'Depois de “want”, vem “to” + verbo.' },
        restanteHoje: 178,
      },
    })
  })
  return correcoes
}

/** A Web Speech (uma frase da fila por vez), o tradutor do navegador e a voz do aparelho, falsos. */
async function falsos(page: Page, frases: string[]) {
  await page.addInitScript((fila: string[]) => {
    const w = window as unknown as Record<string, unknown>
    const restantes = [...fila]
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
          setTimeout(
            () => {
              if (this.parado) return
              const texto = restantes.shift() ?? 'okay'
              const r = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: true })
              this.onresult?.({ resultIndex: 0, results: { length: 1, 0: r } })
              /* O teste pode alongar a fala (`__atrasoDaFala`) para ver o que a tela mostra enquanto ela não chega. */
            },
            (w.__atrasoDaFala as number | undefined) ?? 400,
          )
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
  }, frases)
}

const esperarFlags = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 30 && !localStorage.getItem('babel.flags')?.includes('assistente_ao_vivo'); i++)
      await new Promise((r) => setTimeout(r, 100))
  })

/** A escolha do motor do microfone, se aparecer na primeira fala. */
async function passarPelaEscolhaDoMicrofone(page: Page) {
  const dialogo = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
  if (await dialogo.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await clicarRobusto(page, dialogo.getByRole('button', { name: /Rápido/ }).first())
    await clicarRobusto(page, dialogo.getByRole('button', { name: /Baixar e iniciar|^Iniciar$|Continuar/ }))
  }
}

const parada = (conversa: Locator) => expect(conversa).toHaveAttribute('data-fase', 'parado', { timeout: 15_000 })

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'computador e celular bastam: o tablet é o layout do computador')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
  await page.addInitScript(() => {
    if (sessionStorage.getItem('praticar-limpo')) return
    sessionStorage.setItem('praticar-limpo', '1')
    for (const k of ['babel.assistente', 'babel.flags', 'theme']) localStorage.removeItem(k)
  })
})

test('praticar: a fala da pessoa em inglês ganha a correção; a da outra pessoa nunca vai à correção', async ({
  page,
}) => {
  test.slow()
  const correcoes = await prepararRotas(page)
  await falsos(page, [DELA_1, MINHA_1, MINHA_2, DELA_2])
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await esperarFlags(page)
  await irAoInterpretePeloMenu(page)
  const pronta = page.getByTestId('conversa-pronta')
  await expect(pronta).toBeVisible({ timeout: 15_000 })
  await tema(page, false)

  /* O botão "Praticar", desligado de fábrica, na faixa da tela pronta. */
  const praticar = pronta.getByRole('button', { name: /^Praticar falando em / })
  await expect(praticar).toHaveAttribute('aria-pressed', 'false')
  await clicarRobusto(page, praticar)
  await expect(praticar).toHaveAttribute('aria-pressed', 'true')
  /* A metade da pessoa agora fala o idioma que ela aprende. */
  await expect(pronta.getByTestId('interprete-meu')).toContainText(/Toque em Falar e responda em /)
  await expect(pronta.getByTestId('aviso-do-interprete')).toContainText('Praticando em')
  await fotosNosDoisTemas(page, 'botao-praticar')

  /* A outra pessoa fala primeiro (inglês). */
  await clicarRobusto(page, pronta.getByTestId('falar-outro'))
  await passarPelaEscolhaDoMicrofone(page)
  const conversa = page.getByTestId('modo-interprete')
  await expect(conversa).toBeVisible({ timeout: 10_000 })
  await expect(conversa.getByRole('button', { name: /^Praticar falando em / })).toHaveAttribute('aria-pressed', 'true')
  const minha = conversa.getByTestId('interprete-meu')
  await expect(minha.locator('.int-original')).toHaveText(DELA_1, { timeout: 15_000 })
  await parada(conversa)

  /* A pessoa responde em inglês: a fala dela vai à correção, e o "Mais natural" aparece embaixo, na metade dela. */
  await clicarRobusto(page, conversa.getByTestId('falar-meu'))
  const correcao = minha.getByTestId('correcao-da-fala')
  await expect(correcao).toContainText('Mais natural:', { timeout: 15_000 })
  await expect(correcao).toContainText('I want to go to the beach tomorrow.')
  await expect(correcao).toHaveAttribute('aria-live', 'off')
  await parada(conversa)
  await fotosNosDoisTemas(page, 'correcao-na-fala')
  expect(correcoes).toEqual([MINHA_1])

  /* "Como respondo?" → "Falar esta": o microfone abre na metade da pessoa, e a fala é comparada com a sugestão. */
  const metadeDaOutra = conversa.getByTestId('interprete-outro')
  /* O botão fica junto da última fala da outra pessoa: na lista. */
  await clicarRobusto(page, conversa.getByTestId('tela-conversa'))
  const lista = conversa.getByTestId('interprete-conversa')
  await clicarRobusto(page, lista.getByRole('button', { name: /Como respondo\?/ }))
  const folha = conversa.getByRole('dialog', { name: 'Como respondo?' })
  await expect(folha.locator('.leg-sugestao')).toHaveCount(2, { timeout: 10_000 })
  await fotosNosDoisTemas(page, 'falar-esta')
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__atrasoDaFala = 2500))
  await clicarRobusto(page, folha.getByRole('button', { name: `Falar esta: ${SUGESTAO}` }))
  await expect(folha).toHaveCount(0)
  /* Com a lista aberta, a sugestão a ler fica à vista nela enquanto a pessoa lê. */
  await expect(lista.getByTestId('sugestao-para-ler')).toContainText(SUGESTAO)
  await page.evaluate(() => ((window as unknown as Record<string, unknown>).__atrasoDaFala = 400))
  const comparacao = lista.getByTestId('comparacao-com-a-sugestao')
  await expect(comparacao).toContainText('Da sugestão, faltou: really', { timeout: 15_000 })
  await expect(lista.getByTestId('sugestao-para-ler')).toHaveCount(0)
  await parada(conversa)
  await fotosNosDoisTemas(page, 'comparacao-na-lista')
  expect(correcoes).toEqual([MINHA_1, MINHA_2])

  /* A outra pessoa fala de novo, com um erro: a fala dela NUNCA vai à correção. */
  await clicarRobusto(page, conversa.getByTestId('tela-conversa'))
  await clicarRobusto(page, conversa.getByTestId('falar-outro'))
  await expect(minha.locator('.int-original')).toHaveText(DELA_2, { timeout: 15_000 })
  await parada(conversa)
  await page.waitForTimeout(2_000)
  expect(correcoes).toEqual([MINHA_1, MINHA_2])
  expect(correcoes).not.toContain(DELA_1)
  expect(correcoes).not.toContain(DELA_2)
  await expect(metadeDaOutra.getByTestId('correcao-da-fala')).toHaveCount(0)

  /* Sai e descarta: a sessão aberta não fica para a suíte seguinte. */
  await clicarRobusto(page, conversa.getByRole('button', { name: 'Sair do modo intérprete' }))
  const encerrar = page.getByRole('dialog').filter({ hasText: /Descartar/ })
  await expect(encerrar).toBeVisible({ timeout: 5_000 })
  await clicarRobusto(page, encerrar.getByRole('button', { name: /Descartar/ }).first())
  await expect(page.getByTestId('modo-interprete')).toHaveCount(0)
})
