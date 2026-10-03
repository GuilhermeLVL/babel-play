/**
 * MEDIDA E CONTRATO DE `GET /api/vocab` com ~2.000 cartões (frente de desempenho, 03/10/2026).
 * Imprime bytes (cru e gzip) e tempo da leitura fria; o contrato cobra as chaves que o cliente lê.
 */
import { gzipSync } from 'node:zlib'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from './_app'

describe('GET /api/vocab com 2.000 cartoes', () => {
  let s: AppDeTeste
  const N = 2000

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    const { LOCAL_OWNER } = await s.load('../../server/lib/authContext')
    const { vocabRepo } = await s.load('../../server/db/repositories/vocab')
    const U = LOCAL_OWNER
    const SIL = ['ba', 'te', 'ri', 'so', 'mu', 'la', 'ne', 'ki', 'do', 'pu', 'fa', 'ge']
    const palavra = (i: number) =>
      `${SIL[i % 12]}${SIL[Math.floor(i / 12) % 12]}${SIL[Math.floor(i / 144) % 12]}${SIL[Math.floor(i / 1728) % 12]}`
    const lote = Array.from({ length: N }, (_, i) => ({
      word: `${palavra(i)}`,
      srcLang: 'en',
      back: `traducao da palavra ${palavra(i)}`,
      sentence: `This is the sentence number ${i} using the word ${palavra(i)}.`,
    }))
    for (let i = 0; i < N; i += 200) {
      const r = await vocabRepo.bulkAdd(U, lote.slice(i, i + 200))
      if (i === 0) console.log(JSON.stringify(r.skipped.slice(0, 2)))
    }
  }, 120_000)
  afterAll(async () => {
    await s.encerrar()
  })

  it('mede payload e tempo frio', async () => {
    const t0 = performance.now()
    const r = await s.get('/api/vocab')
    const texto = await r.text()
    const ms = performance.now() - t0
    const linhas = JSON.parse(texto) as Array<Record<string, unknown>>
    console.log(
      `[vocab] cartoes=${linhas.length} bytes=${texto.length} gzip=${gzipSync(texto).length} frio_ms=${ms.toFixed(1)} chaves=${Object.keys(linhas[0] ?? {}).length}`,
    )
    expect(r.status).toBe(200)
    expect(linhas.length).toBeGreaterThan(1500)
  })

  it('contrato: as chaves que o cliente le continuam la', async () => {
    const [c] = (await (await s.get('/api/vocab')).json()) as Array<Record<string, unknown>>
    for (const k of [
      'id',
      'word',
      'back',
      'sentence',
      'srcLang',
      'tgtLang',
      'box',
      'dueAt',
      'stability',
      'difficulty',
      'reps',
      'lapses',
      'lastReview',
      'inDeck',
      'cefrLevel',
      'cefrConfidence',
      'sessionId',
      'createdAt',
      'occurrences',
      'difficultyScore',
      'cefrSource',
      'lastSeenAt',
      'daTrilha',
      'daAnki',
      'baralhosAnki',
    ]) {
      expect(c, k).toHaveProperty(k)
    }
    // Fora da rede desde 03/10/2026: nenhuma tela as le (ver CHAVES_FORA_DO_BARALHO).
    expect(c).not.toHaveProperty('phonetics')
    expect(c).not.toHaveProperty('addedAt')
  })
})
