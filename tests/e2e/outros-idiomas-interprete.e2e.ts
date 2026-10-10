import { devices, expect, type Page, test } from '@playwright/test'

import { assentar, clicarRobusto, semCapturaDeTela, trilho } from './_helpers'

/**
 * O INTÉRPRETE EM OUTROS IDIOMAS (auditoria de 10/10/2026, `docs/auditoria/2026-10-10-outros-idiomas.md`).
 *
 * O RELATO DO DONO: "eu estava no inglês e no meio da conversa botei no mandarim e percebi que teve uma
 * trava, não funcionou; depois também não consegui fazer com que a pronúncia do mandarim saísse, nem
 * que fosse escrito em tela em mandarim".
 *
 * O que é falso aqui (o mesmo molde de `modo-interprete.e2e.ts`): a Web Speech ouve UMA frase no idioma
 * em que abriu, o tradutor do navegador devolve uma frase do idioma de DESTINO (chinês de verdade, e não
 * `[trad] ...`: é o texto em outra escrita que se quer ver na tela), e a `speechSynthesis` só registra o
 * que leria. Os modelos locais são cortados. A transcrição REAL em mandarim (o Whisper) não é provada
 * aqui: só o caminho do app (idioma que chega ao reconhecedor, ao tradutor e à voz, e o que a tela diz).
 */

const FRASES: Record<string, string> = {
  pt: 'bom dia a todos',
  en: 'good morning everyone',
  zh: '大家早上好',
  ar: 'صباح الخير للجميع',
}

interface Lida {
  texto: string
  lang: string
}

/** `vozes`: os idiomas (BCP-47) com voz no aparelho; `null` = a lista ainda não chegou (o navegador escolhe). */
async function falsos(page: Page, vozes: readonly string[] | null = null) {
  await page.addInitScript(
    ({ frases, vozes }) => {
      const w = window as unknown as Record<string, unknown>
      type Ev = { error?: string; resultIndex?: number; results?: unknown }
      const abertos: string[] = []
      w.__reconhecedores = abertos
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
          abertos.push(this.lang)
          setTimeout(() => {
            if (this.parado) return
            this.onstart?.()
            this.onaudiostart?.()
            this.onsoundstart?.()
            setTimeout(
              () => {
                if (this.parado) return
                const texto = frases[this.lang.slice(0, 2)] ?? 'frase'
                const r = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: true })
                this.onresult?.({ resultIndex: 0, results: { length: 1, 0: r } })
              },
              (w.__demoraDaFala as number | undefined) ?? 400,
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

      /* O tradutor devolve a frase do idioma de DESTINO: é ela que precisa aparecer escrita. */
      const pedidos: string[] = []
      w.__traducoes = pedidos
      w.Translator = {
        availability: async () => 'available',
        create: async (o: { sourceLanguage: string; targetLanguage: string }) => ({
          translate: async () => {
            pedidos.push(`${o.sourceLanguage}>${o.targetLanguage}`)
            return frases[o.targetLanguage.slice(0, 2)] ?? `[${o.targetLanguage}]`
          },
        }),
      }

      const lidas: Array<{ texto: string; lang: string }> = []
      w.__lidas = lidas
      let falando = false
      const lista = (vozes ?? []).map((lang) => ({
        name: `Voz ${lang}`,
        lang,
        default: false,
        localService: true,
        voiceURI: `voz-${lang}`,
      }))
      const synth = {
        get speaking() {
          return falando
        },
        paused: false,
        pending: false,
        onvoiceschanged: null,
        getVoices: () => lista,
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
    },
    { frases: FRASES, vozes },
  )
}

async function porToque(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel.interprete.modo', 'toque')
    } catch {
      /* sem armazenamento: o teste falha adiante, no botão que não aparece */
    }
  })
}

/**
 * A escolha do microfone volta a "nunca respondeu" nesta página, e nada é gravado no banco. A conversa
 * começa em português e inglês (o padrão de um usuário novo); o que a pessoa trocar na folha de idiomas
 * fica guardado AQUI, e o GET seguinte o devolve, como o servidor faria.
 */
async function semEscolhaGuardada(page: Page) {
  let ultimo: Record<string, unknown> = {}
  const idiomas = { meu: 'pt-BR', alvo: 'en-US' }
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
        ui.captureSourceLang = idiomas.meu
        delete ui.captureTargetLang
        delete ui.praticaLang
        s.ui = JSON.stringify(ui)
        s.targetLanguage = idiomas.alvo
      } catch {
        /* ui ilegível: fica como veio */
      }
      ultimo = s
      return route.fulfill({ response: resposta, json: s })
    }
    const corpo = (pedido.postDataJSON() ?? {}) as { ui?: Record<string, unknown>; targetLanguage?: string }
    if (typeof corpo.targetLanguage === 'string') idiomas.alvo = corpo.targetLanguage
    if (typeof corpo.ui?.captureSourceLang === 'string') idiomas.meu = corpo.ui.captureSourceLang
    return route.fulfill({ json: { ...ultimo, ui: JSON.stringify(corpo.ui ?? {}), targetLanguage: idiomas.alvo } })
  })
}

const pronta = (page: Page) => page.getByTestId('conversa-pronta')
const fase = (page: Page) => page.getByTestId('modo-interprete')
/** O que a voz leu. O app põe a maiúscula inicial na tradução: a comparação é sem caixa. */
const lidas = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __lidas: Lida[] }).__lidas.map((l) => ({ texto: l.texto.toLowerCase(), lang: l.lang })),
  )
const reconhecedores = (page: Page) =>
  page.evaluate(() => (window as unknown as { __reconhecedores: string[] }).__reconhecedores)

async function abrirPeloMenu(page: Page) {
  await semEscolhaGuardada(page)
  await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
  await clicarRobusto(page, trilho(page).getByRole('button', { name: /^Intérprete/ }))
  await expect(page).toHaveURL(/\/interprete$/)
  await expect(pronta(page)).toBeVisible({ timeout: 15_000 })
}

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

/**
 * Troca o idioma de um lado pela folha "Idiomas da sessão", com a conversa aberta: o botão da metade
 * abre a folha, o campo do lado abre a lista, e "Usar estes idiomas" fecha.
 */
async function trocarIdioma(page: Page, lado: 'Você fala' | 'A outra pessoa fala', busca: string, rotulo: string) {
  await clicarRobusto(page, fase(page).getByRole('button', { name: 'Trocar este idioma' }).first())
  const folha = page.getByRole('dialog', { name: /Idiomas da sessão/ })
  await expect(folha).toBeVisible()
  await folha.getByRole('button', { name: new RegExp(lado) }).click()
  await folha.getByPlaceholder('Buscar idioma…').fill(busca)
  await folha.getByRole('option', { name: rotulo }).click()
  await folha.getByRole('button', { name: /Usar estes idiomas/ }).click()
  await expect(folha).toBeHidden()
}

async function descartar(page: Page) {
  const encerrar = page.getByRole('dialog').filter({ hasText: /Descartar/ })
  await expect(encerrar).toBeVisible({ timeout: 5_000 })
  await clicarRobusto(page, encerrar.getByRole('button', { name: /Descartar/ }).first())
}

async function sair(page: Page) {
  await clicarRobusto(page, fase(page).getByRole('button', { name: 'Sair do modo intérprete' }))
  await descartar(page)
}

async function foto(page: Page, nome: string) {
  const dir = process.env.FOTOS_DIR
  if (dir) await page.screenshot({ path: `${dir}/idiomas-${nome}.png` })
}

test.describe('Intérprete: trocar de idioma no meio da conversa', () => {
  const { defaultBrowserType: _navegador, ...pixel7 } = devices['Pixel 7']
  test.use({ ...pixel7, permissions: ['microphone'] })
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'mobile-375', 'o celular emulado roda uma vez, no projeto móvel')
  })

  test('inglês → mandarim com a conversa parada: o outro lado passa a falar, ouvir e ler em chinês', async ({
    page,
  }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await abrirPeloMenu(page)

    // A conversa começa em português e inglês.
    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page).getByTestId('interprete-outro').getByText(FRASES.en, { exact: false })).toBeVisible({
      timeout: 10_000,
    })
    await expect.poll(() => lidas(page), { timeout: 5_000 }).toEqual([{ texto: FRASES.en, lang: 'en-US' }])
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

    // No meio da conversa, o outro lado passa a ser mandarim.
    await trocarIdioma(page, 'A outra pessoa fala', 'mandarim', '中文 (简体)')
    await expect(fase(page).getByTestId('interprete-outro')).toContainText('中文 (简体)')
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado')

    // Eu falo português: a tradução aparece ESCRITA em chinês do outro lado e é lida em chinês.
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em Português/ }))
    const doOutro = fase(page).getByTestId('interprete-outro')
    await expect(doOutro.locator('.int-traducao')).toHaveText(FRASES.zh, { timeout: 10_000 })
    await expect(doOutro.locator('.int-traducao')).toHaveAttribute('lang', 'zh-CN')
    await expect.poll(() => lidas(page), { timeout: 5_000 }).toContainEqual({ texto: FRASES.zh, lang: 'zh-CN' })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await foto(page, 'interprete-zh-1')

    // O outro fala mandarim: o reconhecedor abre em zh-CN, e a tradução chega em português do meu lado.
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em 中文/ }))
    await expect.poll(() => reconhecedores(page), { timeout: 5_000 }).toContain('zh-CN')
    const meu = fase(page).getByTestId('interprete-meu')
    await expect(meu.locator('.int-traducao')).toHaveText(FRASES.pt, { timeout: 10_000, ignoreCase: true })
    await expect(meu.locator('.int-original')).toHaveText(FRASES.zh)
    await expect(meu.locator('.int-original')).toHaveAttribute('lang', 'zh-CN')
    await expect.poll(() => lidas(page), { timeout: 5_000 }).toContainEqual({ texto: FRASES.pt, lang: 'pt-BR' })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await foto(page, 'interprete-zh-2')

    await sair(page)
  })

  test('inglês → mandarim COM O MICROFONE ABERTO: a troca fecha o microfone e a conversa segue em chinês', async ({
    page,
  }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    // A fala demora: a troca acontece com o microfone ainda aberto.
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, unknown>).__demoraDaFala = 60_000
    })
    await abrirPeloMenu(page)

    await comecarFalando(page, /Falar em English/)
    await expect(fase(page)).toHaveAttribute('data-fase', 'ouvindo', { timeout: 10_000 })

    await trocarIdioma(page, 'A outra pessoa fala', 'mandarim', '中文 (简体)')
    // Nada fica preso em "Ouvindo": o idioma novo começa do zero.
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

    await page.evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__demoraDaFala = 400
    })
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em 中文/ }))
    await expect.poll(async () => (await reconhecedores(page)).at(-1), { timeout: 5_000 }).toBe('zh-CN')
    const meu = fase(page).getByTestId('interprete-meu')
    await expect(meu.locator('.int-traducao')).toHaveText(FRASES.pt, { timeout: 10_000, ignoreCase: true })
    await expect(meu.locator('.int-original')).toHaveText(FRASES.zh)
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

    await sair(page)
  })

  test('mandarim → português: trocar os dois idiomas de volta no meio da conversa', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await abrirPeloMenu(page)

    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 15_000 })
    await trocarIdioma(page, 'Você fala', 'mandarim', '中文 (简体)')
    await trocarIdioma(page, 'A outra pessoa fala', 'portugu', 'Português (BR)')

    // Agora EU falo mandarim, e a outra pessoa lê e ouve em português.
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em 中文/ }))
    const doOutro = fase(page).getByTestId('interprete-outro')
    await expect(doOutro.locator('.int-traducao')).toHaveText(FRASES.pt, { timeout: 10_000, ignoreCase: true })
    await expect.poll(() => lidas(page), { timeout: 5_000 }).toContainEqual({ texto: FRASES.pt, lang: 'pt-BR' })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })

    await sair(page)
  })

  test('árabe: o texto sai da direita para a esquerda nas duas metades', async ({ page }) => {
    test.slow()
    await semCapturaDeTela(page)
    await falsos(page)
    await porToque(page)
    await abrirPeloMenu(page)

    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 15_000 })
    await trocarIdioma(page, 'A outra pessoa fala', 'árabe', 'العربية')

    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em Português/ }))
    const traducao = fase(page).getByTestId('interprete-outro').locator('.int-traducao')
    await expect(traducao).toHaveText(FRASES.ar, { timeout: 10_000 })
    expect(await traducao.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    await foto(page, 'interprete-ar')

    // Na lista da conversa, a bolha em árabe também.
    await clicarRobusto(page, fase(page).getByTestId('tela-conversa'))
    const bolha = fase(page).locator('.int-bolha-trad', { hasText: FRASES.ar })
    await expect(bolha).toBeVisible()
    expect(await bolha.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')

    await sair(page)
  })

  test('sem voz de chinês no aparelho: a tela diz que o chinês fica em texto e como instalar a voz', async ({
    page,
  }) => {
    test.slow()
    await semCapturaDeTela(page)
    // O aparelho tem voz de português e de inglês, e nenhuma de chinês (o Windows sem o pacote).
    await falsos(page, ['pt-BR', 'en-US'])
    await porToque(page)
    await abrirPeloMenu(page)

    await comecarFalando(page, /Falar em Português/)
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 15_000 })
    await trocarIdioma(page, 'A outra pessoa fala', 'mandarim', '中文 (简体)')

    // Antes de alguém falar, a faixa já diz quem é lido e quem fica em texto, e o que fazer.
    await expect(fase(page).getByTestId('voz-em-uso')).toHaveAttribute('title', /中文.*em texto/)
    await expect(fase(page).getByTestId('aviso-do-interprete')).toContainText(/não tem voz/i)
    await expect(fase(page).getByTestId('aviso-do-interprete')).toContainText(/instal/i)

    // A tradução chega escrita em chinês; nada é lido com voz de outro idioma, e a conversa não prende.
    await clicarRobusto(page, fase(page).getByRole('button', { name: /Falar em Português/ }))
    const doOutro = fase(page).getByTestId('interprete-outro')
    await expect(doOutro.locator('.int-traducao')).toHaveText(FRASES.zh, { timeout: 10_000 })
    await expect(fase(page)).toHaveAttribute('data-fase', 'parado', { timeout: 5_000 })
    expect((await lidas(page)).filter((l) => l.texto === FRASES.zh)).toEqual([])
    // Sem voz deste lado, "Repetir" e "Parar voz" não aparecem na metade de quem ouve em chinês.
    await expect(doOutro.getByRole('button', { name: 'Repetir a tradução' })).toHaveCount(0)
    await foto(page, 'interprete-sem-voz')

    await sair(page)
  })
})
