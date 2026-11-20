/**
 * Gera as miniaturas das 10 vozes da Supertonic (F1–F5, M1–M5) como SVG fixo em `src/assets/voz-avatares/`.
 * Estilo Lorelei (DiceBear, ilustração CC0 de Lisa Wischofsky; código MIT): ilustração, nunca foto de pessoa real.
 * A semente é o id da voz, então rodar de novo dá o mesmo desenho. Os SVGs são versionados; o app não depende do DiceBear.
 *   node scripts/voz/gerar-avatares.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'

import { createAvatar } from '@dicebear/core'
import * as lorelei from '@dicebear/lorelei'

const pasta = new URL('../../src/assets/voz-avatares/', import.meta.url)
mkdirSync(pasta, { recursive: true })
const fundos = ['fde2d8', 'fbe9c8', 'dff0d8', 'd8ecf5', 'e6defa']
for (const [i, id] of ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'].entries()) {
  const svg = createAvatar(lorelei, {
    seed: `frasy-voz-${id}`,
    backgroundColor: [fundos[i % fundos.length]],
    radius: 50,
  }).toString()
  writeFileSync(new URL(`${id}.svg`, pasta), svg)
}
console.log('ok: 10 avatares em src/assets/voz-avatares/')
