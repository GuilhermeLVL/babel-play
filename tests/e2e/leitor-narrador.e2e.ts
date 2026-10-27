import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { fecharSobreposicoes } from './_helpers'

/**
 * O NARRADOR DO LEITOR (L3), com a `speechSynthesis` TROCADA por uma de mentira (o navegador do teste não tem
 * voz, e o teste decide quando cada frase "termina"): tocar destaca a frase 1 e depois a 2; pausar e retomar
 * continuam da MESMA frase; mudar a velocidade não perde o destaque; no fim do capítulo, o seguinte abre e a
 * leitura continua nele. Roda no Chromium (`playwright.config.ts`) e no WebKit (`playwright.webkit.config.ts`).
 */

const FIXTURE = path.resolve('tests', 'fixtures', 'livros', 'fabulas-cc0.epub')

/** A voz de mentira: guarda o que foi falado; `__fala.terminar()` acaba a fala atual. */
function vozDeMentira() {
  type Fala = {
    text: string
    lang: string
    rate: number
    onstart?: () => void
    onend?: () => void
    onerror?: (e: unknown) => void
  }
  const vozes = [
    { name: 'Teste EN', lang: 'en-US', localService: true, default: true, voiceURI: 'teste-en' },
    { name: 'Teste PT', lang: 'pt-BR', localService: true, default: false, voiceURI: 'teste-pt' },
  ]
  class Utterance {
    text: string
    lang = ''
    rate = 1
    pitch = 1
    volume = 1
    voice: unknown = null
    onstart?: () => void
    onend?: () => void
    onerror?: (e: unknown) => void
    onboundary = null
    constructor(text: string) {
      this.text = text
    }
  }
  const estado = {
    faladas: [] as Array<{ texto: string; lang: string; rate: number }>,
    atual: null as Fala | null,
    cancelamentos: 0,
  }
  const synth = {
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    getVoices: () => vozes,
    speak(u: Fala) {
      estado.faladas.push({ texto: u.text, lang: u.lang, rate: u.rate })
      estado.atual = u
      synth.speaking = true
      setTimeout(() => u.onstart?.(), 0)
    },
    cancel() {
      const u = estado.atual
      estado.atual = null
      synth.speaking = false
      estado.cancelamentos++
      if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0)
    },
    pause() {},
    resume() {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true })
  ;(window as unknown as { __fala: unknown }).__fala = {
    estado,
    terminar() {
      const u = estado.atual
      estado.atual = null
      synth.speaking = false
      u?.onend?.()
    },
  }
}

type Fala = { texto: string; lang: string; rate: number }
const faladas = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { estado: { faladas: Fala[] } } }).__fala.estado.faladas)
const falando = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as { __fala: { estado: { atual: { text: string } | null } } }).__fala
    return f.estado.atual?.text ?? null
  })
const terminar = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fala: { terminar: () => void } }).__fala.terminar())

async function abrirLivro(page: Page) {
  await page.addInitScript(vozDeMentira)
  await page.goto('/leitor')
  await expect(page.getByTestId('estante')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith('leitor:narracao') || k === 'leitor:perfil') localStorage.removeItem(k)
  })
  await page.getByTestId('abrir-arquivo').setInputFiles(FIXTURE)
  await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  await fecharSobreposicoes(page)
}

test.describe('Leitor — narração', () => {
  test('tocar destaca a frase 1 e depois a 2; pausar e retomar seguem na mesma frase; o capítulo vira no fim', async ({
    page,
  }) => {
    test.slow()
    await abrirLivro(page)
    const barra = page.getByTestId('barra-do-narrador')
    const progresso = page.getByTestId('leitor-progresso')
    await expect(progresso).toContainText('Part One')

    // ── tocar: a primeira frase da página é falada e destacada ──
    await page.getByTestId('leitor-ouvir').click()
    await expect(barra).toBeVisible()
    await expect(barra).toHaveAttribute('data-fase', 'tocando')
    await expect.poll(() => falando(page)).not.toBeNull()
    const primeira = (await falando(page))!
    expect(primeira.length).toBeGreaterThan(2)
    await expect(barra).toHaveAttribute('data-indice', '0')
    await expect(barra).toHaveAttribute('data-frase', primeira)
    expect((await faladas(page))[0].lang).toMatch(/^en/)

    // ── a frase termina: a seguinte é falada e destacada ──
    await terminar(page)
    await expect(barra).toHaveAttribute('data-indice', '1')
    await expect.poll(() => falando(page)).not.toBe(primeira)
    const segunda = (await falando(page))!
    expect(segunda).not.toBeNull()
    await expect(barra).toHaveAttribute('data-frase', segunda)

    // ── pausar e retomar: a MESMA frase, do começo ──
    await page.getByRole('button', { name: 'Pausar a narração' }).click()
    await expect(barra).toHaveAttribute('data-fase', 'pausada')
    await expect(barra).toHaveAttribute('data-indice', '1')
    await expect.poll(() => falando(page)).toBeNull()
    const antes = (await faladas(page)).length
    await page.getByRole('button', { name: 'Ouvir a narração' }).click()
    await expect(barra).toHaveAttribute('data-fase', 'tocando')
    await expect.poll(async () => (await faladas(page)).length).toBe(antes + 1)
    expect((await faladas(page)).at(-1)!.texto).toBe(segunda)
    await expect(barra).toHaveAttribute('data-indice', '1')

    // ── a velocidade muda sem perder o destaque ──
    await barra.getByLabel('Velocidade da narração').selectOption('1.5')
    await expect.poll(async () => (await faladas(page)).at(-1)!.rate).toBe(1.5)
    expect((await faladas(page)).at(-1)!.texto).toBe(segunda)
    await expect(barra).toHaveAttribute('data-indice', '1')

    // ── a frase seguinte pelo botão ──
    await page.getByRole('button', { name: 'Próxima frase' }).click()
    await expect(barra).toHaveAttribute('data-indice', '2')

    // ── o fim do capítulo: a página vira para o próximo, e a narração continua nele ──
    const posicoesVistas = new Set<string>()
    for (let i = 0; i < 80; i++) {
      posicoesVistas.add((await progresso.textContent()) ?? '')
      if ((await faladas(page)).some((f) => f.texto.includes('Part Two'))) break
      const atual = (await faladas(page)).length
      await terminar(page)
      await expect.poll(async () => (await faladas(page)).length, { timeout: 5000 }).toBeGreaterThan(atual)
    }
    expect((await faladas(page)).some((f) => f.texto.includes('Part Two'))).toBe(true)
    /* No celular o capítulo 1 ocupa várias páginas: a página virou sozinha para a frase lida ("Seguir a leitura"). */
    if ((page.viewportSize()?.width ?? 1280) < 500) expect(posicoesVistas.size).toBeGreaterThan(1)
    await expect(progresso).toContainText('Part Two', { timeout: 10_000 })
    await expect(barra).toHaveAttribute('data-fase', 'tocando')
    await expect(barra).toHaveAttribute('data-indice', '0')

    // ── parar fecha a barra e cala ──
    await page.getByRole('button', { name: 'Parar e fechar a narração' }).click()
    await expect(barra).toBeHidden()
    await expect.poll(() => falando(page)).toBeNull()
  })

  test('os ajustes: modo com rótulos que dizem o que fazem, seguir a leitura e a voz do idioma', async ({ page }) => {
    test.slow()
    await abrirLivro(page)
    await page.getByTestId('leitor-ouvir').click()
    await page.getByRole('button', { name: /Voz e modo/ }).click()
    const painel = page.getByTestId('painel-narracao')
    await expect(painel).toBeVisible()
    await expect(painel.getByText('Leitura inteligente')).toBeVisible()
    await expect(painel.getByText('Lê cada frase do livro e, logo depois, a tradução.')).toBeVisible()
    await expect(painel.getByRole('checkbox', { name: /Seguir a leitura/ })).toBeChecked()
    await expect(painel.getByTestId('seletor-de-voz').first()).toHaveAttribute('data-idioma', 'en')
    // Sem conta paga nem a flag: nada de convite a plano (e nunca para perfil protegido).
    await expect(painel.getByTestId('convite-voz-natural')).toHaveCount(0)
    // O modo bilíngue mostra também a voz do idioma da pessoa.
    await painel.getByRole('radio', { name: /Bilíngue/ }).check()
    await expect(painel.getByTestId('seletor-de-voz')).toHaveCount(2)
    expect(await page.evaluate(() => localStorage.getItem('leitor:narracao:modo'))).toBe('bilingue')
    await page.getByRole('button', { name: 'Parar e fechar a narração' }).click()
  })
})
