import { expect, test } from '@playwright/test'

import { COLECAO_CURADA, COLECAO_SUGERIVEL } from '../../src/data/avatar/colecao'

/**
 * ENQUADRAMENTO NO MOTOR DE VERDADE (M2.1): cada modelo da coleção, com a câmera do catálogo, no harness do avatar
 * (Chromium, SwiftShader). Corpo inteiro: nenhum pixel do modelo toca a borda do quadro. Rosto: o topo (cabeça,
 * orelhas, chifres, cone) nunca é cortado, e o modelo ocupa boa parte do quadro. A matemática pura está em
 * `tests/avatar-enquadramento.test.ts`; aqui se prova que o renderer a obedece.
 *
 * Também confere MSAA e pixel ratio por tier: forte e médio ligam o antialias e desenham superamostrado num
 * quadro pequeno; o fraco (o tier do PiP) fica sem MSAA e em 1x. (Em GPU real isto não foi medido: SwiftShader.)
 */
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
})

const HARNESS = '/tests/e2e/avatar-harness/index.html'
/** Só dentro de `page.evaluate`: a ponte que o harness põe em `window`. */
type Ponte = {
  modo(m: 'corpo' | 'rosto'): void
  bordas(): {
    total: number
    naoVazios: number
    naBorda: number
    topo: number
    base: number
    lados: number
    caixa: { x0: number; x1: number; y0: number; y1: number }
  } | null
  stats(): { antialias: boolean; pixelRatio: number } | null
}
type JanelaDoHarness = { __avatarHarness: Ponte }

for (const m of COLECAO_CURADA) {
  test(`${m.id}: corpo inteiro sem corte e rosto com o topo livre`, async ({ page }) => {
    await page.goto(`${HARNESS}?fonte=/avatares/colecao/${m.id}.vrm&tier=medio&tamanho=320&base=${m.id}&catalogo=1`)
    await expect(page.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })

    await page.evaluate(() => (window as unknown as JanelaDoHarness).__avatarHarness.modo('corpo'))
    await expect(page.locator('[data-camera-pronta="corpo"]')).toHaveCount(1)
    const corpo = await page.evaluate(() => (window as unknown as JanelaDoHarness).__avatarHarness.bordas())
    expect(corpo).toBeTruthy()
    expect(corpo!.naBorda, 'nenhum pixel do corpo toca a borda').toBe(0)
    expect(corpo!.naoVazios / corpo!.total, 'o corpo aparece (não é um ponto)').toBeGreaterThan(0.05)

    await page.evaluate(() => (window as unknown as JanelaDoHarness).__avatarHarness.modo('rosto'))
    await expect(page.locator('[data-camera-pronta="rosto"]')).toHaveCount(1)
    const rosto = await page.evaluate(() => (window as unknown as JanelaDoHarness).__avatarHarness.bordas())
    expect(rosto!.topo, 'o topo da cabeça não é cortado').toBe(0)
    expect(rosto!.naoVazios / rosto!.total, 'o rosto enche o quadro').toBeGreaterThan(0.15)
    expect(rosto!.naoVazios, 'o rosto é maior que o corpo inteiro').toBeGreaterThan(corpo!.naoVazios)
    // Medido em pixels: o topo da cabeça fica a 3%..22% do topo do quadro (nem cortado, nem sobrando vazio; a cabeça
    // inteira, de ~80% do quadro, está provada pela projeção em `tests/avatar-enquadramento.test.ts`), e está
    // centrada na horizontal. Abaixo do queixo o pescoço e o corpo continuam até a borda, e isso é esperado.
    const { x0, x1, y0 } = rosto!.caixa
    expect(y0, 'folga acima da cabeça').toBeGreaterThanOrEqual(0.03)
    expect(y0, 'a cabeça começa perto do topo (rosto grande)').toBeLessThanOrEqual(0.22)
    expect(Math.abs((x0 + x1) / 2 - 0.5), 'centrada na horizontal').toBeLessThan(0.08)
  })
}

test('todos os modelos da coleção passam no teste de enquadramento e podem ser sorteados', () => {
  expect(COLECAO_SUGERIVEL.map((m) => m.id).sort()).toEqual(COLECAO_CURADA.map((m) => m.id).sort())
})

test('MSAA e pixel ratio seguem o tier', async ({ page }) => {
  const ler = async (tier: string) => {
    await page.goto(`${HARNESS}?fonte=/avatares/colecao/milk.vrm&tier=${tier}&tamanho=280&base=milk&catalogo=1&fala=0`)
    await expect(page.locator('[data-avatar-pronto="true"]')).toBeVisible({ timeout: 60_000 })
    return page.evaluate(() => (window as unknown as JanelaDoHarness).__avatarHarness.stats())
  }
  const forte = await ler('forte')
  const medio = await ler('medio')
  const fraco = await ler('fraco')
  expect(forte?.antialias).toBe(true)
  expect(medio?.antialias).toBe(true)
  expect(fraco?.antialias).toBe(false)
  expect(forte!.pixelRatio).toBe(2)
  expect(medio!.pixelRatio).toBe(1.5)
  expect(fraco!.pixelRatio).toBeLessThanOrEqual(1)
})
