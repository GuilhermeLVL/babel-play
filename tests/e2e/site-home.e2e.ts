import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, type Page, test } from '@playwright/test'

import { gerarSite, opcoesDoAmbiente } from '../../scripts/site/gerar'

/**
 * A HOME DO SITE PÚBLICO NO NAVEGADOR (`scripts/site/home.ts` + `public/site/rolo.js`), depois do relato
 * do Windows em 19/11/2026: com "Efeitos de animação" desligado (`prefers-reduced-motion: reduce`) o filme
 * nem era criado; sem isso, ficava parado no primeiro quadro até a pessoa rolar; e em notebook de tela
 * baixa (1536×730 com escala 125%) o rótulo do primeiro capítulo subia para cima do logo.
 *
 * A página vem do próprio gerador e é servida por `page.route` numa origem de mentira, com `public/` e as
 * fontes do disco: não depende do build nem do servidor de dev.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ORIGEM = 'http://site-publico.teste'
const PAGINAS = gerarSite(
  opcoesDoAmbiente({ VITE_PUBLIC_URL: 'https://frasy.com.br' }, path.join(RAIZ, 'content', 'guias'), '5.3.0', '5.3.0')
    .opcoes,
)
const FONTES: Record<string, string> = {
  archivo: 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  inter: 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
}
const TIPOS: Record<string, string> = {
  '.js': 'text/javascript',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

async function abrirHome(page: Page) {
  await page.route(`${ORIGEM}/**`, async (rota) => {
    const caminho = new URL(rota.request().url()).pathname
    if (caminho === '/')
      return rota.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINAS.get('inicio.html') })
    const fonte = Object.entries(FONTES).find(([nome]) => caminho.startsWith(`/fontes/${nome}`))
    const arquivo = fonte ? path.join(RAIZ, fonte[1]) : path.join(RAIZ, 'public', caminho)
    try {
      return await rota.fulfill({
        body: readFileSync(arquivo),
        contentType: TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
      })
    } catch {
      return rota.fulfill({ status: 404, body: '' })
    }
  })
  await page.goto(`${ORIGEM}/`)
}

const filme = (page: Page) => page.locator('[data-filme-camada] video')
const tempoDoFilme = (page: Page) => filme(page).evaluate((v: HTMLVideoElement) => v.currentTime)

test.describe('home do site público', () => {
  test('movimento reduzido: o filme existe e segue a rolagem, sem tocar sozinho', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'o filme é o mesmo nas três telas')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await abrirHome(page)
    await expect(filme(page)).toHaveCount(1, { timeout: 30_000 })
    await expect(page.locator('[data-filme-camada]')).toHaveAttribute('data-pintado', '', { timeout: 15_000 })
    // Parado no topo, o filme não anda (nada se mexe sozinho).
    const t0 = await tempoDoFilme(page)
    await page.waitForTimeout(1500)
    expect(await tempoDoFilme(page)).toBe(t0)
    expect(await filme(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    // Rolando, o quadro acompanha.
    await page.evaluate(() => scrollTo(0, innerHeight * 3))
    await expect.poll(() => tempoDoFilme(page), { timeout: 10_000 }).toBeGreaterThan(4)
  })

  test('topo vivo: sem rolar, o primeiro trecho toca sozinho e em laço; rolando, a rolagem manda', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'o filme é o mesmo nas três telas')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await abrirHome(page)
    await expect(page.locator('[data-filme-camada]')).toHaveAttribute('data-pintado', '', { timeout: 30_000 })
    // Começa pelo de 720p (metade do tamanho), em qualquer tela.
    await expect(filme(page)).toHaveAttribute('data-fonte', /filme-m\.mp4$/)
    const t0 = await tempoDoFilme(page)
    await expect.poll(() => tempoDoFilme(page), { timeout: 5_000 }).toBeGreaterThan(t0 + 0.5)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    // O laço não passa do fim do primeiro capítulo (`data-ate`).
    const ate = Number(await page.locator('[data-capitulo]').first().getAttribute('data-ate'))
    for (let i = 0; i < 12; i++) {
      expect(await tempoDoFilme(page)).toBeLessThanOrEqual(ate + 0.1)
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => scrollTo(0, innerHeight * 3))
    await expect.poll(() => filme(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true)
    await expect.poll(() => tempoDoFilme(page), { timeout: 10_000 }).toBeGreaterThan(ate)
  })

  for (const [largura, altura] of [
    [1366, 768],
    [1536, 730],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]) {
    test(`${largura}×${altura}: o primeiro capítulo cabe entre o cabeçalho e o pé da tela`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-1280', 'telas de computador')
      await page.setViewportSize({ width: largura, height: altura })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.route('**/*.mp4', (r) => r.abort())
      await abrirHome(page)
      await caberNoTopo(page, altura)
    })
  }

  test('celular: o primeiro capítulo cabe entre o cabeçalho e o pé da tela', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-375', 'tela de celular')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/*.mp4', (r) => r.abort())
    await abrirHome(page)
    await caberNoTopo(page, page.viewportSize()!.height)
  })

  test('celular: a rolagem é a nativa do toque (sem Lenis nem roda normalizada)', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-375', 'tela de celular')
    await page.route('**/*.mp4', (r) => r.abort())
    await abrirHome(page)
    await expect(page.locator('#rolo')).toHaveAttribute('data-rolagem', 'nativa')
    expect(await page.evaluate(() => document.documentElement.classList.contains('lenis'))).toBe(false)
  })
})

/**
 * A ROLAGEM NORMALIZADA (relato do Windows em 19/11/2026: "o scroll está partindo o vídeo, pulando
 * conteúdo"). Cada cenário imita uma configuração comum de roda, trackpad ou teclado, rola o rolo inteiro e
 * mede, quadro a quadro (rAF): (a) quanto tempo cada capítulo fica ativo e (b) o maior salto de
 * `currentTime` do filme entre dois quadros. Os números saem no log (`MEDIDA {...}`) para o PR.
 */
type Medida = {
  cenario: string
  tela: string
  movimento: string
  visitados: number
  capitulos: number
  menorTempoNoMeio: number
  maiorSalto: number
  travessia: number | null
}

// Teto do salto de `currentTime` por quadro: 12 s de filme por segundo com quadro de no máximo 1/30 s,
// mais folga para o arredondamento do decodificador.
const TETO_DE_SALTO = 0.45
// Nenhum capítulo do meio pode passar ativo por menos que isto numa rolagem contínua de roda.
const TEMPO_MINIMO_ATIVO = 300

type Passo = (page: Page, i: number) => Promise<void>
const rodaNativa =
  (dy: number): Passo =>
  (page) =>
    page.mouse.wheel(0, dy)
const rodaSintetica =
  (deltaY: number, deltaMode: number): Passo =>
  (page) =>
    page.evaluate(
      ([dy, modo]) => {
        const alvo = document.elementFromPoint(innerWidth / 2, innerHeight / 2) ?? document.body
        alvo.dispatchEvent(
          new WheelEvent('wheel', { deltaY: dy, deltaMode: modo, bubbles: true, cancelable: true, composed: true }),
        )
      },
      [deltaY, deltaMode],
    )

const CENARIOS: { nome: string; passo: Passo; intervalo: number; roda: boolean }[] = [
  { nome: 'Windows padrão (deltaY 100)', passo: rodaNativa(100), intervalo: 50, roda: true },
  { nome: 'Windows alto (deltaY 600)', passo: rodaNativa(600), intervalo: 50, roda: true },
  { nome: 'linhas (deltaMode 1, 3)', passo: rodaSintetica(3, 1), intervalo: 50, roda: true },
  { nome: 'linhas (deltaMode 1, 10)', passo: rodaSintetica(10, 1), intervalo: 50, roda: true },
  { nome: 'página (deltaMode 2)', passo: rodaSintetica(1, 2), intervalo: 50, roda: true },
  {
    nome: 'trackpad (4–20 px)',
    // Três deltas por volta, sem espera (cada um já leva um quadro): um gesto contínuo e lento (~20 s).
    passo: async (page, i) => {
      for (let k = 0; k < 3; k++) await page.mouse.wheel(0, 4 + (((3 * i + k) * 7) % 17))
    },
    intervalo: 0,
    roda: true,
  },
  { nome: 'teclado PageDown', passo: (page) => page.keyboard.press('PageDown'), intervalo: 150, roda: false },
  {
    nome: 'teclado End',
    passo: (page, i) => (i === 0 ? page.keyboard.press('End') : Promise.resolve()),
    intervalo: 100,
    roda: false,
  },
]

async function medirRolagem(page: Page, nome: string, passo: Passo, intervalo: number): Promise<Medida> {
  await expect(page.locator('[data-filme-camada]')).toHaveAttribute('data-pintado', '', { timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(400, 300)
  const fim = await page.evaluate(() => {
    const caps = [...document.querySelectorAll('[data-capitulo]')]
    const ultimo = caps[caps.length - 1].getBoundingClientRect()
    return ultimo.bottom + scrollY - innerHeight
  })
  await page.evaluate(() => {
    const w = window as unknown as { __amostras: unknown[]; __parar: boolean }
    w.__amostras = []
    w.__parar = false
    const botoes = [...document.querySelectorAll('#rota button')]
    const amostrar = (t: number) => {
      const v = document.querySelector<HTMLVideoElement>('[data-filme-camada] video')
      w.__amostras.push({
        t,
        y: scrollY,
        ct: v ? v.currentTime : null,
        cap: botoes.findIndex((b) => b.getAttribute('aria-current') === 'step'),
      })
      if (!w.__parar) requestAnimationFrame(amostrar)
    }
    requestAnimationFrame(amostrar)
  })
  const alturaTela = page.viewportSize()!.height
  const inicio = Date.now()
  for (let i = 0; Date.now() - inicio < 50_000; i++) {
    await passo(page, i)
    await page.waitForTimeout(intervalo)
    if ((await page.evaluate(() => scrollY)) >= fim + 0.3 * alturaTela) break
    // End: espera a rolagem chegar ao fim da página.
    if (i > 40 && nome.includes('End')) break
  }
  await page.waitForTimeout(400)
  const amostras = await page.evaluate(() => {
    const w = window as unknown as {
      __amostras: { t: number; y: number; ct: number | null; cap: number }[]
      __parar: boolean
    }
    w.__parar = true
    return w.__amostras
  })
  const capitulos = await page.locator('[data-capitulo]').count()
  const tempoAtivo = new Array<number>(capitulos).fill(0)
  let maiorSalto = 0
  let t0: number | null = null
  let travessia: number | null = null
  for (let i = 1; i < amostras.length; i++) {
    const [a, b] = [amostras[i - 1], amostras[i]]
    if (b.cap >= 0) tempoAtivo[b.cap] += b.t - a.t
    // Antes de sair do topo, o topo vivo dá a volta no laço (um salto que não é da rolagem).
    if (a.y > 2 && a.ct !== null && b.ct !== null) maiorSalto = Math.max(maiorSalto, Math.abs(b.ct - a.ct))
    if (t0 === null && b.y > 2) t0 = b.t
    if (travessia === null && t0 !== null && b.y >= fim) travessia = Math.round(b.t - t0)
  }
  const meio = tempoAtivo.slice(1, -1)
  return {
    cenario: nome,
    tela: `${page.viewportSize()!.width}×${alturaTela}`,
    movimento: '',
    visitados: tempoAtivo.filter((t) => t > 0).length,
    capitulos,
    menorTempoNoMeio: Math.round(Math.min(...meio)),
    maiorSalto: Number(maiorSalto.toFixed(3)),
    travessia,
  }
}

test.describe('home do site público: rolagem normalizada', () => {
  for (const [largura, altura] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    for (const movimento of ['no-preference', 'reduce'] as const) {
      for (const c of CENARIOS) {
        // Movimento reduzido: os cenários de roda que pulavam capítulos (o teclado é o nativo nos dois).
        if (movimento === 'reduce' && (!c.roda || largura !== 1366)) continue
        test(`${largura}×${altura}, ${movimento === 'reduce' ? 'movimento reduzido' : 'suave'}: ${c.nome}`, async ({
          page,
        }, info) => {
          test.skip(info.project.name !== 'desktop-1280', 'telas de computador')
          test.setTimeout(90_000)
          await page.setViewportSize({ width: largura, height: altura })
          await page.emulateMedia({ reducedMotion: movimento })
          await abrirHome(page)
          await expect(page.locator('#rolo')).toHaveAttribute(
            'data-rolagem',
            movimento === 'reduce' ? 'direta' : 'suave',
          )
          const m = await medirRolagem(page, c.nome, c.passo, c.intervalo)
          m.movimento = movimento
          console.log(`MEDIDA ${JSON.stringify(m)}`)
          // (a) todo capítulo fica ativo em algum momento.
          expect(m.visitados).toBe(m.capitulos)
          // (b) o filme não teleporta: o salto de currentTime entre quadros tem teto.
          expect(m.maiorSalto).toBeLessThanOrEqual(TETO_DE_SALTO)
          // Na roda contínua, nenhum capítulo do meio passa rápido demais para ser visto.
          if (c.roda) expect(m.menorTempoNoMeio).toBeGreaterThanOrEqual(TEMPO_MINIMO_ATIVO)
        })
      }
    }
  }
})

async function caberNoTopo(page: Page, altura: number) {
  await page.evaluate(() => document.fonts.ready)
  const capitulo = page.locator('[data-capitulo]').first()
  const topo = (await page.locator('header.topo').boundingBox())!
  const kicker = (await capitulo.locator('.kicker').boundingBox())!
  const legenda = (await capitulo.locator('.leg').boundingBox())!
  const botao = (await capitulo.locator('.acoes .botao').boundingBox())!
  const apoio = (await capitulo.locator('.apoio').boundingBox())!
  // O rótulo começa abaixo do cabeçalho (não cobre o logo) e a legenda, o botão e a linha de apoio ("sem
  // cartão") terminam dentro da tela.
  expect(kicker.y).toBeGreaterThanOrEqual(topo.y + topo.height)
  expect(legenda.y + legenda.height).toBeLessThanOrEqual(altura)
  expect(botao.y + botao.height).toBeLessThanOrEqual(altura)
  expect(apoio.y + apoio.height).toBeLessThanOrEqual(altura)
}
