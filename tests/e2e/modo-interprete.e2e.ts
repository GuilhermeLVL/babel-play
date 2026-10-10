import { devices, expect, type Locator, type Page, test } from '@playwright/test'

import { assentar, clicarRobusto, semCapturaDeTela, trilho } from './_helpers'

/**
 * O MODO INTÉRPRETE (E6 da Fase E), a maquete aprovada pelo dono (2026-09-30), de ponta a ponta.
 *
 * O que é falso aqui, e por quê: a Web Speech (o Chromium do runner não alcança o serviço do Google)
 * ouve UMA frase no idioma em que abriu — português ou inglês; o tradutor do navegador (a Translator
 * API) traduz como `[trad] texto`; a `speechSynthesis` só registra o que leria e em que idioma, e
 * avisa o começo e o fim; e, no Premium, `POST /api/ai/tts` devolve um WAV curto. O opus-mt e o
 * Bergamot são cortados (a tradução é a do navegador falso).
 *
 * O que se prova:
 *   · CELULAR (Grátis, voz do aparelho): a entrada abre a tela frente a frente, com a metade do outro
 *     virada; cada lado fala no seu idioma, a tradução aparece na metade do OUTRO e é lida no idioma
 *     dele; sair abre o Encerrar de sempre;
 *   · COMPUTADOR (Premium, voz natural): os atalhos de teclado, a voz da nuvem lendo a tradução, e a
 *     meta do plano — do fim da fala à voz em ≤ 2,5 s no p50 (`window.__ttsInicio()`).
 *
 * NO DESENHO NOVO (09/10/2026) a porta é UMA, a do menu: o Intérprete abre direto na conversa frente a
 * frente PRONTA (`conversa-pronta`, dentro de `pagina-do-interprete`), em tela inteira, e o primeiro
 * toque num lado começa a conversa (`modo-interprete`, com a fase em `data-fase`) já com o microfone
 * daquele lado. O modo é o botão `modo-automatico` (`aria-pressed`), e a voz em uso vem no `title` de
 * `voz-em-uso`. SAÍRAM: o botão "entrar no intérprete" da tela da captura (`entrar-no-interprete`), a
 * tela de entrada com "Começar conversa" (`comecar-conversa`) e o atributo `data-modo` da conversa.
 *
 * NO COMPUTADOR A CONVERSA FICA EM DUAS COLUNAS, sem metade virada (decisão do dono, 09/10/2026): a
 * conversa leva `data-layout="computador"`; no celular não há `data-layout` e a metade de cima segue
 * virada (`data-virada`).
 */

/* O áudio da voz natural toca sem esperar um gesto a mais (o toque que a destrava é o do atalho). */
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

interface Lida {
  texto: string
  lang: string
}

/** A Web Speech, o tradutor do navegador e a voz do aparelho, falsos (ver o cabeçalho). */
async function falsos(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>
    const FRASES: Record<string, string> = { pt: 'bom dia a todos', en: 'good morning everyone' }
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

    const lidas: Array<{ texto: string; lang: string }> = []
    w.__lidas = lidas
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
        lidas.push({ texto: u.text, lang: u.lang })
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
  })
}

/**
 * O MODO POR TOQUE como a última escolha da pessoa. No servidor do e2e (self-host) o automático está no
 * plano e é o padrão; os testes dos dois lados tocados começam por aqui.
 */
async function porToque(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel.interprete.modo', 'toque')
    } catch {
      /* sem armazenamento: o teste falha adiante, no botão que não aparece */
    }
  })
}

/** A escolha do microfone volta a "nunca respondeu" nesta página, e nada é gravado no banco. */
async function semEscolhaGuardada(page: Page) {
  let ultimo: Record<string, unknown> = {}
  await page.route('**/api/settings', async (route) => {
    const pedido = route.request()
    if (pedido.method() === 'GET') {
      const resposta = await route.fetch()
      const s = (await resposta.json().catch(() => ({}))) as Record<string, unknown>
      try {
        const ui = typeof s.ui === 'string' ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
        const p = ui.preferencias as Record<string, unknown> | undefined
        if (p) {
          p.micEscolhido = false
          p.consentimentos = { ...(p.consentimentos as object), reconhecimentoDoNavegador: false }
          p.registroDeConsentimentos = ((p.registroDeConsentimentos as Array<{ chave?: string }>) ?? []).filter(
            (r) => r.chave !== 'reconhecimentoDoNavegador',
          )
        }
        s.ui = JSON.stringify(ui)
      } catch {
        /* ui ilegível: fica como veio */
      }
      ultimo = s
      return route.fulfill({ response: resposta, json: s })
    }
    const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
    return route.fulfill({ json: { ...ultimo, ui: JSON.stringify(corpo.ui ?? {}) } })
  })
}

/** Corta os modelos (a tradução é a do navegador falso) e zera a escolha do microfone nesta página. */
async function semModelos(page: Page) {
  await semEscolhaGuardada(page)
  await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
}

/** A conversa PRONTA (`/interprete`, antes de alguém falar) e a conversa EM CURSO (o diálogo). */
const pronta = (page: Page) => page.getByTestId('conversa-pronta')
const fase = (page: Page) => page.getByTestId('modo-interprete')

/**
 * Abre o Intérprete PELO MENU (o trilho, ou a barra de cinco no celular): a porta é a do menu desde
 * 30/09, e no desenho novo ela abre direto na conversa frente a frente, pronta para o primeiro toque.
 */
async function abrirPeloMenu(page: Page) {
  await semModelos(page)
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
  await clicarRobusto(page, trilho(page).getByRole('button', { name: /^Intérprete/ }))
  await expect(page).toHaveURL(/\/interprete$/)
  await expect(page.getByTestId('pagina-do-interprete')).toBeAttached()
  await expect(pronta(page)).toBeVisible({ timeout: 15_000 })
}

/**
 * O PRIMEIRO TOQUE num lado começa a conversa e já abre o microfone daquele lado; a folha "Como
 * transcrever a sua voz?" vem antes, como no Iniciar da captura, para quem nunca escolheu.
 */
async function comecarFalando(page: Page, lado: RegExp) {
  await clicarRobusto(page, pronta(page).getByRole('button', { name: lado }))
  const folha = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
  if (await folha.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await clicarRobusto(page, folha.getByRole('button', { name: /Rápido/ }).first())
    await clicarRobusto(page, folha.getByRole('button', { name: /Baixar e iniciar|^Iniciar$|Continuar/ }))
    await expect(folha).toBeHidden()
  }
  await expect(fase(page)).toBeVisible({ timeout: 10_000 })
}

/** A metade está de cabeça para baixo (virada para quem senta do outro lado)? */
async function deCabecaParaBaixo(metade: Locator) {
  /* A metade ENTRA animada (a entrada mexe no `transform`): mede-se com ela parada. */
  await metade.page().waitForTimeout(600)
  return metade.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    )
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).a < 0
  })
}

const lidas = (page: Page) => page.evaluate(() => (window as unknown as { __lidas: Lida[] }).__lidas)
const tempoAteAVoz = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __ttsInicio: () => { p50: number; amostras: number; motores: string[] } | null }
    ).__ttsInicio(),
  )
/** Foto de conferência, só quando pedida (`FOTOS_DIR`): a maquete aprovada contra a tela de verdade. */
async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/interprete-${nome}.png` })
}

/** Sair abre o Encerrar de sempre; descartar não deixa nada no banco. */
async function descartar(page: Page) {
  const encerrar = page.getByRole('dialog').filter({ hasText: /Descartar/ })
  await expect(encerrar).toBeVisible({ timeout: 5_000 })
  await clicarRobusto(page, encerrar.getByRole('button', { name: /Descartar/ }).first())
}

test.describe('Modo intérprete no celular (Pixel 7, voz do aparelho)', () => {
  const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
  test.use({ ...pixel7, permissions: ['microphone'] })
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-375', 'o celular emulado roda uma vez, no projeto móvel')
  })

  test('frente a frente: cada lado fala no seu idioma e ouve a tradução no dele', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await abrirPeloMenu(page)

    // A metade do outro fica virada para ele; a voz é a do aparelho (Grátis).
    await expect(pronta(page).getByTestId('interprete-outro')).toHaveAttribute('data-virada', '')
    expect(await deCabecaParaBaixo(pronta(page).getByTestId('interprete-outro'))).toBe(true)
    expect(await deCabecaParaBaixo(pronta(page).getByTestId('interprete-meu'))).toBe(false)
    await expect(pronta(page).getByTestId('voz-em-uso')).toHaveAttribute('title', /Voz do aparelho/)
    await foto(page, 'celular-1-pronto')

    // Eu falo português: a tradução aparece do outro lado e é lida em inglês.
    await comecarFalando(page, /Falar em Português/)
    const doOutro = fase(page).getByTestId('interprete-outro')
    await expect(doOutro.getByText('[trad] bom dia a todos')).toBeVisible({ timeout: 10_000 })
    await expect(doOutro.getByText('bom dia a todos', { exact: true })).toBeVisible()
    await expect
      .poll(() => lidas(page), { timeout: 5_000 })
      .toEqual([{ texto: '[trad] bom dia a todos', lang: 'en-US' }])
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await foto(page, 'celular-2-falou')

    // O outro fala inglês: a tradução aparece do meu lado, lida em português.
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em English/ }))
    await expect(fase(page).getByTestId('interprete-meu').getByText('[trad] good morning everyone')).toBeVisible({
      timeout: 10_000,
    })
    await expect
      .poll(() => lidas(page), { timeout: 5_000 })
      .toContainEqual({ texto: '[trad] good morning everyone', lang: 'pt-BR' })

    // O tempo até a voz foi medido, pela voz do aparelho.
    await expect
      .poll(() => tempoAteAVoz(page), { timeout: 5_000 })
      .toMatchObject({
        amostras: 2,
        motores: ['voz-do-aparelho'],
      })

    // Sair abre o Encerrar de sempre; descartar não deixa nada no banco.
    await clicarRobusto(page, fase(page).getByRole('button', { name: 'Sair do modo intérprete' }))
    await expect(fase(page)).toHaveCount(0)
    await descartar(page)
  })

  /* O RELATO DO DONO (30/09): "em português traduziu; tocando o outro lado e falando em inglês, não
     aconteceu nada". Aqui a conversa começa pelo OUTRO lado e alterna duas vezes. */
  test('pelo menu: o outro lado fala primeiro, e os dois lados se alternam', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await abrirPeloMenu(page)

    const ingles = { texto: '[trad] good morning everyone', lang: 'pt-BR' }
    const portugues = { texto: '[trad] bom dia a todos', lang: 'en-US' }
    for (let volta = 0; volta < 2; volta++) {
      if (volta === 0) await comecarFalando(page, /Falar em English/)
      else await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em English/ }))
      await expect(fase(page).getByTestId('interprete-meu').getByText(ingles.texto)).toBeVisible({ timeout: 10_000 })
      await expect.poll(() => lidas(page), { timeout: 5_000 }).toHaveLength(volta * 2 + 1)
      expect((await lidas(page)).at(-1)).toEqual(ingles)
      await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

      await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em Português/ }))
      await expect.poll(() => lidas(page), { timeout: 10_000 }).toHaveLength(volta * 2 + 2)
      expect((await lidas(page)).at(-1)).toEqual(portugues)
      await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    }

    // Sair e descartar volta à conversa pronta do Intérprete, e não à Captura.
    await clicarRobusto(page, fase(page).getByRole('button', { name: 'Sair do modo intérprete' }))
    await descartar(page)
    await expect(page).toHaveURL(/\/interprete$/)
    await expect(pronta(page)).toBeVisible()
  })
})

/** Um WAV de 0,2 s de silêncio (8 kHz, 16 bits): o que a voz natural "devolve" aqui. */
function wavDeSilencio(): Buffer {
  const amostras = 1600
  const dados = amostras * 2
  const b = Buffer.alloc(44 + dados)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dados, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(8000, 24)
  b.writeUInt32LE(16000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dados, 40)
  return b
}

test.describe('Modo intérprete no computador (Premium, voz natural)', () => {
  test.use({ permissions: ['microphone'] })
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop-1280', 'o computador roda uma vez, no projeto de desktop')
  })

  test('os atalhos, a voz natural lê a tradução e a meta do tempo até a voz', async ({ page }) => {
    test.slow()
    await falsos(page)
    // Os atalhos 1 e 2 são do modo por toque (no automático, o 1 liga a escuta e o 2 não faz nada).
    await porToque(page)
    // O Premium com a voz natural ligada, e a rota da voz simulada.
    await page.route('**/api/me/entitlements', (r) =>
      r.fulfill({
        json: {
          plan: 'premium',
          youtubeImport: true,
          managedCloudStt: true,
          managedCloudLlm: true,
          largerModels: true,
          traducaoNuance: true,
          vozNatural: true,
        },
      }),
    )
    await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { voz_natural: { ligada: true } } } }))
    const pedidosDeVoz: Array<{ texto: string; idioma: string }> = []
    await page.route('**/api/ai/tts', (r) => {
      pedidosDeVoz.push(r.request().postDataJSON() as { texto: string; idioma: string })
      return r.fulfill({ status: 200, contentType: 'audio/wav', body: wavDeSilencio() })
    })
    await abrirPeloMenu(page)
    // Os entitlements e as flags do Premium precisam estar no cache antes de entrar.
    await page.evaluate(async () => {
      for (let i = 0; i < 20 && !localStorage.getItem('babel.flags')?.includes('voz_natural'); i++)
        await new Promise((r) => setTimeout(r, 100))
    })

    /* NO MONITOR, DUAS COLUNAS E NINGUÉM VIRADO (decisão do dono, 09/10/2026: `planos-v3-e-rota-
       inteligente/design.md` §11, item 14). A metade virada é para o aparelho deitado entre duas
       pessoas; num monitor as duas leem do mesmo lado: "Você" à esquerda, a outra pessoa à direita. */
    await expect(pronta(page)).toHaveAttribute('data-layout', 'computador')
    await expect(pronta(page).locator('.int-metade[data-virada]')).toHaveCount(0)
    expect(await deCabecaParaBaixo(pronta(page).getByTestId('interprete-outro'))).toBe(false)
    expect(await deCabecaParaBaixo(pronta(page).getByTestId('interprete-meu'))).toBe(false)
    const colunaDoMeu = await pronta(page).getByTestId('interprete-meu').boundingBox()
    const colunaDoOutro = await pronta(page).getByTestId('interprete-outro').boundingBox()
    expect(colunaDoMeu!.x).toBeLessThan(colunaDoOutro!.x)
    expect(Math.abs(colunaDoMeu!.y - colunaDoOutro!.y)).toBeLessThan(2)
    await foto(page, 'computador-1-pronto')

    // O primeiro toque começa a conversa pelo meu lado; a voz natural lê a tradução em inglês.
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).getByTestId('interprete-outro').getByText('[trad] bom dia a todos')).toBeVisible({
      timeout: 10_000,
    })
    await expect.poll(() => pedidosDeVoz.length, { timeout: 5_000 }).toBe(1)
    expect(pedidosDeVoz[0]).toMatchObject({ texto: '[trad] bom dia a todos', idioma: 'en-US' })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await expect(fase(page).getByTestId('voz-em-uso')).toHaveAttribute('title', /Voz natural · Premium/)

    // "2" fala do outro lado.
    await page.keyboard.press('2')
    await expect(fase(page).getByTestId('interprete-meu').getByText('[trad] good morning everyone')).toBeVisible({
      timeout: 10_000,
    })
    await expect.poll(() => pedidosDeVoz.length, { timeout: 5_000 }).toBe(2)
    expect(pedidosDeVoz[1]).toMatchObject({ idioma: 'pt-BR' })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

    // "1" fala do meu lado de novo.
    await page.keyboard.press('1')
    await expect.poll(() => pedidosDeVoz.length, { timeout: 10_000 }).toBe(3)
    expect(pedidosDeVoz[2]).toMatchObject({ texto: '[trad] bom dia a todos', idioma: 'en-US' })
    // A voz da nuvem leu as três (a do aparelho não foi chamada).
    expect(await lidas(page)).toEqual([])

    // A meta do plano: do fim da fala à voz em ≤ 2,5 s no p50, pela voz natural.
    await expect
      .poll(() => tempoAteAVoz(page), { timeout: 5_000 })
      .toMatchObject({
        amostras: 3,
        motores: ['voz-da-nuvem'],
      })
    const p50 = (await tempoAteAVoz(page))!.p50
    console.log(`[e2e] tts_inicio p50 (voz natural): ${p50} ms`)
    expect(p50).toBeLessThanOrEqual(2_500)
    await foto(page, 'computador-2-falou')

    // Esc sai; o Encerrar abre, e descartar não deixa nada no banco.
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await page.keyboard.press('Escape')
    await expect(fase(page)).toHaveCount(0)
    await descartar(page)
  })
})

/* O AUTOMÁTICO (E7). O que o navegador prova aqui é a TELA: o padrão de quem o tem no plano, o botão
   único e a troca para o toque. A conversa em si (o idioma medido pelo áudio, a metade certa, a voz de
   quem ouve, o microfone reabrindo) está em `tests/interprete-automatico-integracao.test.ts`, com o
   pipeline e o controle de verdade: no runner não há microfone nem modelo de fala. */
test.describe('Modo intérprete: automático', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop-1280', 'uma vez, no projeto de desktop')
  })

  test('com o automático no plano, a conversa abre nele; o botão do modo volta ao toque', async ({ page }) => {
    await falsos(page)
    await abrirPeloMenu(page)

    const modo = pronta(page).getByTestId('modo-automatico')
    await expect(modo).toHaveAttribute('aria-pressed', 'true')
    await expect(pronta(page).getByRole('button', { name: 'Ouvir a conversa' }).first()).toBeVisible()
    await expect(pronta(page).getByRole('button', { name: /Falar em/ })).toHaveCount(0)
    await expect(pronta(page).getByTestId('aviso-do-interprete')).toContainText('Automático ligado')
    await foto(page, 'automatico-1-pronto')

    await clicarRobusto(page, modo)
    await expect(modo).toHaveAttribute('aria-pressed', 'false')
    await expect(pronta(page).getByRole('button', { name: /Falar em English/ })).toBeVisible()
    await expect(pronta(page).getByRole('button', { name: /Falar em Português/ })).toBeVisible()
    // A escolha fica guardada: é a última da pessoa.
    expect(await page.evaluate(() => localStorage.getItem('babel.interprete.modo'))).toBe('toque')

    // O X da conversa pronta devolve o menu.
    await clicarRobusto(page, pronta(page).getByRole('button', { name: 'Sair do modo intérprete' }))
    await expect(pronta(page)).toHaveCount(0)
    await expect(trilho(page)).toBeVisible()
  })
  /* O Grátis (o botão com cadeado, que diz de que plano é) não tem como ser simulado aqui: no servidor
     do e2e o plano é o do self-host, decidido no cliente sem ir à rota. Está em `modoInterprete.test.tsx`. */
})
