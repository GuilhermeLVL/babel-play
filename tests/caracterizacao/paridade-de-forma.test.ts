// @vitest-environment jsdom
/**
 * PARIDADE DE FORMA ENTRE O EXPRESS E O ESPELHO ANÔNIMO — a partir dos snapshots.
 *
 * `rotas-espelhadas.test.ts` cobra que exista alguém do outro lado; `sessoes.test.ts` e
 * `economia.test.ts` comparam duas rotas de perto. Este arquivo usa o que a Fase 1 congelou: para
 * cada snapshot de forma do Express em `__snapshots__/`, chama a MESMA rota no
 * `src/data/efemero/servidor.ts` e cobra duas coisas:
 *
 *  1. O espelho não devolve chave que o Express não devolve (o Express é a autoridade; uma chave
 *     a mais no espelho é uma segunda verdade nascendo).
 *  2. O que o Express devolve e o espelho NÃO devolve fica gravado em
 *     `__snapshots__/paridade.faltando-no-espelho.json`. Não é falha — é a lista de lacunas que
 *     as duas auditorias anteriores mantinham em tabela de documento. Uma lacuna nova quebra o
 *     snapshot e obriga a decisão: espelhar, ou justificar ali.
 *
 * Rotas que o espelho responde 501 (`EXIGE_CONTA`) ficam fora por construção.
 */
import 'fake-indexeddb/auto'

import { existsSync,readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll,describe, expect, it } from 'vitest'

import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore } from '../../src/data/efemero/store'
import { forma } from './_app'

const SNAPS = join('tests', 'caracterizacao', '__snapshots__')

/** Rota do Express → como chamá-la no espelho (a semente é feita pelas próprias rotas de escrita). */
const ROTAS: Array<{ snapshot: string; metodo: string; caminho: string; corpo?: unknown }> = [
  { snapshot: 'post.vocab.bulk-add.json', metodo: 'POST', caminho: '/api/vocab/bulk-add', corpo: { cards: [{ word: 'harvest', srcLang: 'en', back: 'colheita', sentence: 'The harvest was good.' }, { word: 'water', srcLang: 'en', back: 'agua', sentence: 'Drink water.' }] } },
  { snapshot: 'post.sessions.json', metodo: 'POST', caminho: '/api/sessions', corpo: { title: 'espelho', kind: 'live', sourceLang: 'en', targetLang: 'pt', status: 'done', durationMs: 1000, utterances: [{ idx: 0, source: 'mic', speakerName: 'A', sourceLang: 'en', sourceText: 'Drink water.', targetLang: 'pt', translatedText: 'Beba agua.', tStartMs: 0, tEndMs: 900 }] } },
  { snapshot: 'get.settings.json', metodo: 'GET', caminho: '/api/settings' },
  { snapshot: 'get.sessions.json', metodo: 'GET', caminho: '/api/sessions' },
  { snapshot: 'get.vocab.json', metodo: 'GET', caminho: '/api/vocab' },
  { snapshot: 'get.vocab.pagina.json', metodo: 'GET', caminho: '/api/vocab/pagina?limite=10' },
  { snapshot: 'get.vocab.inicio-da-contagem.json', metodo: 'GET', caminho: '/api/vocab/inicio-da-contagem' },
  { snapshot: 'get.metrics.profile.json', metodo: 'GET', caminho: '/api/metrics/profile' },
  { snapshot: 'get.metrics.xp.json', metodo: 'GET', caminho: '/api/metrics/xp' },
  { snapshot: 'get.exercises.historico.json', metodo: 'GET', caminho: '/api/exercises/historico' },
  { snapshot: 'get.exercises.recordes.json', metodo: 'GET', caminho: '/api/exercises/recordes' },
  { snapshot: 'get.exercises.results.json', metodo: 'GET', caminho: '/api/exercises/results' },
  { snapshot: 'get.sessions.utterances.all.json', metodo: 'GET', caminho: '/api/sessions/utterances/all' },
]

type Forma = unknown

/** Chaves (com caminho) presentes em `a` e ausentes em `b`. Arrays comparam o elemento-união. */
function faltando(a: Forma, b: Forma, prefixo = ''): string[] {
  const fora: string[] = []
  if (Array.isArray(a)) {
    if (!a.length) return fora
    // Array vazio do outro lado não informa forma nenhuma (o snapshot pode ter nascido num cenário
    // sem itens): não é divergência, é desconhecido.
    if (!Array.isArray(b) || !b.length) return fora
    return faltando(a[0], b[0], `${prefixo}[]`)
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return [prefixo || '(raiz)']
    for (const [k, v] of Object.entries(a as Record<string, Forma>)) {
      const ob = b as Record<string, Forma>
      if (!(k in ob)) { fora.push(`${prefixo}.${k}`); continue }
      fora.push(...faltando(v, ob[k], `${prefixo}.${k}`))
    }
  }
  return fora
}

afterAll(async () => { await fecharStore().catch(() => {}) })

describe('espelho anônimo x snapshots do Express', () => {
  const lacunas: Record<string, { status: { express: number; espelho: number }; faltamNoEspelho: string[] }> = {}

  for (const rota of ROTAS) {
    it(`${rota.metodo} ${rota.caminho}: o espelho não inventa chave`, async () => {
      const arquivo = join(SNAPS, rota.snapshot)
      expect(existsSync(arquivo), `snapshot ${rota.snapshot} não existe — rode a caracterização antes`).toBe(true)
      const express = JSON.parse(readFileSync(arquivo, 'utf8')) as { status: number; forma: Forma }

      const r = await servidorEfemero(rota.caminho, {
        method: rota.metodo,
        headers: rota.corpo ? { 'content-type': 'application/json' } : undefined,
        body: rota.corpo ? JSON.stringify(rota.corpo) : undefined,
      })
      expect(r.status, 'o espelho respondeu 501: a rota saiu da paridade').not.toBe(501)
      const texto = await r.text()
      let corpo: unknown = texto
      try { corpo = JSON.parse(texto) } catch { /* texto cru */ }
      const espelho = forma(corpo)

      const aMais = faltando(espelho, express.forma)
      expect(aMais, `chaves que só o espelho devolve`).toEqual([])
      lacunas[`${rota.metodo} ${rota.caminho}`] = {
        status: { express: express.status, espelho: r.status },
        faltamNoEspelho: faltando(express.forma, espelho),
      }
    })
  }

  it('o que falta no espelho está registrado, e só muda com decisão', async () => {
    await expect(JSON.stringify(lacunas, null, 2)).toMatchFileSnapshot('__snapshots__/paridade.faltando-no-espelho.json')
  })
})
