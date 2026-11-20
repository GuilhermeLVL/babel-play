import { expect, type Page, test } from '@playwright/test'
import sharp from 'sharp'

import { COLECAO_CURADA } from '../../src/data/avatar/colecao'

/**
 * AS PEÇAS DE REPRESENTAÇÃO APARECEM DE FRENTE (M2.2): em cada modelo da coleção, com a câmera do `rosto`, ligar um
 * aparelho auditivo ou um implante coclear muda pelo menos `PISO` pixels do quadro (a diferença entre o quadro com
 * e sem a peça). Antes, no Milk (cabeça de caixa) o aparelho mudava ~48 px: ficava atrás da cabeça. Boné e chapéu mudam
 * muitos pixels (vestem a cabeça).
 *
 * Mede pixels do canvas de verdade (Chromium, SwiftShader). Sem movimento: quadro estável.
 */
test.use({
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  reducedMotion: 'reduce',
})

const HARNESS = '/tests/e2e/avatar-harness/index.html'
const PISO_DA_REPRESENTACAO = 150
const PECAS_DE_REPRESENTACAO = [
  'aparelho-auditivo-esq',
  'aparelho-auditivo-dir',
  'implante-coclear-esq',
  'implante-coclear-dir',
]

async function quadro(page: Page, id: string, pecas?: string): Promise<Buffer> {
  await page.goto(
    `${HARNESS}?fonte=/avatares/colecao/${id}.vrm&tier=medio&tamanho=320&base=${id}&catalogo=1&modo=rosto${pecas ? `&pecas=${pecas}` : ''}`,
  )
  await expect(page.locator('[data-avatar-pronto="true"][data-camera-pronta="rosto"]')).toBeVisible({ timeout: 60_000 })
  if (pecas) {
    // As peças entram depois do modelo: espera o motor dizer que as montou.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __avatarHarness: { pecasMontadas(): string[] } }).__avatarHarness.pecasMontadas(),
        ),
      )
      .toEqual(pecas.split(','))
  }
  await page.waitForTimeout(500)
  const png = await page.locator('canvas').screenshot()
  return sharp(png).ensureAlpha().raw().toBuffer()
}

function diferenca(a: Buffer, b: Buffer): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n += 1
  }
  return n
}

for (const m of COLECAO_CURADA) {
  test(`${m.id}: aparelho auditivo e implante coclear aparecem de frente (>= ${PISO_DA_REPRESENTACAO} px); boné e chapéu vestem a cabeça`, async ({
    page,
  }) => {
    const base = await quadro(page, m.id)
    const medidas: Record<string, number> = {}
    for (const peca of [...PECAS_DE_REPRESENTACAO, 'bone', 'chapeu-simples']) {
      medidas[peca] = diferenca(base, await quadro(page, m.id, peca))
    }
    for (const peca of PECAS_DE_REPRESENTACAO) {
      expect(medidas[peca], `${peca} em ${m.id}: ${JSON.stringify(medidas)}`).toBeGreaterThanOrEqual(
        PISO_DA_REPRESENTACAO,
      )
    }
    expect(medidas.bone, 'boné').toBeGreaterThan(2000)
    expect(medidas['chapeu-simples'], 'chapéu').toBeGreaterThan(2000)
  })
}
