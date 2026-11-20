#!/usr/bin/env node
/**
 * PROVA NO APP DE VERDADE (Chromium do Playwright): com a flag `voz_kitten` ligada e `VITE_VOZ_KITTEN_URL` apontando
 * para o servidor do spike (`SPIKE_CORS=1`), baixa a voz do pt pelo módulo do app, confere que `quemLe('pt')` é o Kitten
 * e lê uma frase pela `speak()` global — o mesmo caminho do "Ouvir" de uma palavra. Grava o que o motor mediu
 * (`performance.measure('voz-no-aparelho:frase')`) e uma captura da seção em Ajustes.
 *
 *   APP_URL=http://localhost:3197 node scripts/voz/kitten/spike/e2e-app.mjs [pasta-de-saida]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright'

const app = process.env.APP_URL ?? 'http://localhost:3197'
const saida = process.argv[2] ?? '/tmp/kitten-e2e'
mkdirSync(saida, { recursive: true })

const b = await chromium.launch({
  headless: process.env.HEADED !== '1',
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const p = await b.newPage()
const erros = []
p.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
await p.goto(app)
await p.waitForLoadState('networkidle')

const r = await p.evaluate(async () => {
  /* módulos do app servidos pelo Vite (caminho em variável: é o navegador que resolve, não o Node) */
  const importar = (caminho) => import(caminho)
  const flags = await (await fetch('/api/flags')).json().catch(() => null)
  const k = await importar('/src/lib/voz/vozKitten.ts')
  const { speak } = await importar('/src/lib/tts.ts')
  const { flagLigada } = await importar('/src/lib/flagsCache.ts')
  await (await importar('/src/lib/flags.ts')).carregarFlags()
  const antes = { flag: flagLigada('voz_kitten'), oferecido: k.kittenOferecido(), decisao: k.decisaoDoKitten() }
  await k.verificarArmazenamentoDoKitten()
  const t0 = performance.now()
  const baixou = await k.baixarVozKitten('pt')
  const downloadMs = performance.now() - t0
  const quem = k.quemLe('pt-BR')
  const t1 = performance.now()
  const fala = await new Promise((resolve) => {
    let inicio = 0
    speak('Seu voo mudou para o portão doze. O embarque começa em vinte minutos.', {
      lang: 'pt-BR',
      onStart: () => (inicio = performance.now()),
      onEnd: () => resolve({ ok: true, ateOInicioMs: inicio - t1, totalMs: performance.now() - t1 }),
      onError: () => resolve({ ok: false }),
    })
    setTimeout(() => resolve({ ok: false, motivo: 'tempo' }), 60_000)
  })
  const medidas = performance.getEntriesByName('voz-no-aparelho:frase').map((e) => e.detail)
  return { flagsDoServidor: flags, antes, baixou, downloadMs, quem, fala, medidas }
})
console.log(JSON.stringify(r, null, 2))
writeFileSync(join(saida, 'resultado.json'), JSON.stringify({ ...r, erros }, null, 2))
if (erros.length) console.log('erros no console:', erros.slice(0, 5))
await b.close()
