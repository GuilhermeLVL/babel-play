import { expect, type Page } from '@playwright/test'

import { assentar, clicarRobusto, irAoInterpretePeloMenu } from './_helpers'

/**
 * AJUDAS DOS E2E DO INTÉRPRETE COM AVATAR. Mesmo falso de `modo-interprete.e2e.ts` (Web Speech que ouve uma frase, tradutor
 * do navegador, `speechSynthesis` que só registra), com duas diferenças: a tradução pode DEMORAR (para dar tempo de ver o
 * estado "pensando") e os elementos de áudio e os contextos de áudio criados pela página ficam à mostra em
 * `window.__audios` / `window.__contextos`, para provar volume, mudo, pausa e o momento em que o analisador foi ligado.
 */
export async function falsos(
  page: Page,
  o: { atrasoDaTraducaoMs?: number; atrasoDaFalaMs?: number; fraseEmPt?: string } = {},
) {
  await page.addInitScript(
    ({ atraso, atrasoDaFala, fraseEmPt }) => {
      const w = window as unknown as Record<string, unknown>
      const FRASES: Record<string, string> = { pt: fraseEmPt || 'bom dia a todos', en: 'good morning everyone' }
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
                const texto = FRASES[this.lang.slice(0, 2)] ?? 'frase'
                const r = Object.assign([{ transcript: texto, confidence: 0.9 }], { isFinal: true })
                this.onresult?.({ resultIndex: 0, results: { length: 1, 0: r } })
              },
              400 + (atrasoDaFala as number),
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
        create: async () => ({
          translate: async (t: string) => {
            if (atraso) await new Promise((r) => setTimeout(r, atraso as number))
            return `[trad] ${t}`
          },
        }),
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

      // Os áudios e os contextos que a página cria, à vista dos testes.
      const audios: HTMLMediaElement[] = []
      w.__audios = audios
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (!audios.includes(this)) audios.push(this)
        return play.call(this)
      }
      const contextos: Array<{ criadoEm: number; fontes: number }> = []
      w.__contextos = contextos
      const Original = window.AudioContext
      if (Original) {
        const criar = Original.prototype.createMediaElementSource
        Original.prototype.createMediaElementSource = function (this: AudioContext, el: HTMLMediaElement) {
          contextos.push({ criadoEm: performance.now(), fontes: contextos.length + 1 })
          return criar.call(this, el)
        }
      }
    },
    { atraso: o.atrasoDaTraducaoMs ?? 0, atrasoDaFala: o.atrasoDaFalaMs ?? 0, fraseEmPt: o.fraseEmPt ?? '' },
  )
}

export async function porToque(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babel.interprete.modo', 'toque')
    } catch {
      /* sem armazenamento */
    }
  })
}

/** Zera as preferências dos avatares (a primeira carga de cada teste). */
export async function semPreferenciasDeAvatar(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__av_limpo')) return
    sessionStorage.setItem('__av_limpo', '1')
    for (const k of Object.keys(localStorage)) if (k.startsWith('frasy.avatar')) localStorage.removeItem(k)
  })
}

export async function semModelos(page: Page) {
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
        /* ui ilegível */
      }
      ultimo = s
      return route.fulfill({ response: resposta, json: s })
    }
    const corpo = (pedido.postDataJSON() ?? {}) as { ui?: unknown }
    return route.fulfill({ json: { ...ultimo, ui: JSON.stringify(corpo.ui ?? {}) } })
  })
  await page.route(/huggingface\.co|\.hf\.co/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
}

/** As flags e o Premium com a voz natural, como o e2e do Intérprete já faz. */
export async function comFlagsEVozNatural(page: Page, flags: Record<string, boolean>) {
  const todas: Record<string, { ligada: boolean }> = { voz_natural: { ligada: true } }
  for (const [k, v] of Object.entries(flags)) todas[k] = { ligada: v }
  await page.route('**/api/me/entitlements', (r) =>
    r.fulfill({
      json: {
        plan: 'premium',
        managedCloudStt: true,
        managedCloudLlm: true,
        largerModels: true,
        traducaoNuance: true,
        vozNatural: true,
      },
    }),
  )
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: todas } }))
}

/** Só as flags (sem Premium): a voz é a do aparelho, falsa. */
export async function comFlags(page: Page, flags: Record<string, boolean>) {
  const todas: Record<string, { ligada: boolean }> = {}
  for (const [k, v] of Object.entries(flags)) todas[k] = { ligada: v }
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: todas } }))
}

/** Um WAV de tom (440 Hz, com envelope), para a boca do avatar ter amplitude de verdade. */
export function wavComTom(segundos = 1.2): Buffer {
  const taxa = 8000
  const amostras = Math.floor(taxa * segundos)
  const dados = amostras * 2
  const b = Buffer.alloc(44 + dados)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + dados, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(dados, 40)
  for (let i = 0; i < amostras; i++) {
    const env = Math.abs(Math.sin((i / taxa) * Math.PI * 4))
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / taxa) * env * 20000), 44 + i * 2)
  }
  return b
}

export const pronta = (page: Page) => page.getByTestId('conversa-pronta')
export const fase = (page: Page) => page.getByTestId('modo-interprete')

export async function abrirPeloMenu(page: Page) {
  await semModelos(page)
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
  await irAoInterpretePeloMenu(page)
  await expect(page.getByTestId('pagina-do-interprete')).toBeAttached()
  await expect(pronta(page)).toBeVisible({ timeout: 15_000 })
}

export async function comecarFalando(page: Page, lado: RegExp) {
  await clicarRobusto(page, pronta(page).getByRole('button', { name: lado }))
  const folha = page.getByRole('dialog', { name: 'Como transcrever a sua voz?' })
  if (await folha.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await clicarRobusto(page, folha.getByRole('button', { name: /Rápido/ }).first())
    await clicarRobusto(page, folha.getByRole('button', { name: /Baixar e iniciar|^Iniciar$|Continuar/ }))
    await expect(folha).toBeHidden()
  }
  await expect(fase(page)).toBeVisible({ timeout: 10_000 })
}

/** Registra cada mudança de `data-avatar-estado` por lado (`avatar-meu`/`avatar-outro`) em `window.__estadosDoAvatar`. */
export async function observarEstadosDoAvatar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __estadosDoAvatar: Record<string, string[]> }
    w.__estadosDoAvatar = { meu: [], outro: [] }
    const ler = () => {
      for (const lado of ['meu', 'outro']) {
        const el = document.querySelector(`[data-testid="avatar-${lado}"] [data-avatar-estado]`)
        const e = el?.getAttribute('data-avatar-estado')
        const lista = w.__estadosDoAvatar[lado]
        if (e && lista[lista.length - 1] !== e) lista.push(e)
      }
    }
    ler()
    new MutationObserver(ler).observe(document.body, { subtree: true, attributes: true, childList: true })
  })
}

export const estadosDoAvatar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __estadosDoAvatar: Record<string, string[]> }).__estadosDoAvatar)
