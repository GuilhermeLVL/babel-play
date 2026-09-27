import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * IDIOMA DA SESSÃO NA EDIÇÃO ESTÁTICA (auditoria 2026-09-26).
 *
 * Relato do dono: a sessão capturada em PORTUGUÊS virava prática em INGLÊS — pronúncia inglesa e
 * palavras separadas errado. Aqui a sessão é SEMEADA no IndexedDB `babel-local` como uma versão
 * antiga a gravava (fala portuguesa etiquetada `en`, cartões com o idioma do seletor), e a página
 * precisa: reparar os dados na primeira leitura, mostrar Português na Biblioteca e, em Jogar, falar
 * com `utterance.lang = pt-BR`. O mesmo para uma sessão em inglês (que tem de continuar inglês).
 *
 * `speechSynthesis.speak` é interceptado por `addInitScript`: o teste lê o `lang` e a voz de cada
 * fala que a página pediu, sem depender de alto-falante.
 */
const PASTA = process.env.SCREENSHOTS_IDIOMA || path.join('test-results', 'idioma-da-sessao')
mkdirSync(PASTA, { recursive: true })

const FALA_PT = 'Eu não sei se você vai conseguir terminar o trabalho hoje, porque a reunião atrasou muito.'
const FALA_EN = 'I do not think we can finish the report today, because the meeting was delayed again.'

interface Semente {
  id: string
  titulo: string
  falaLang: string
  texto: string
  cartoes: Array<{ word: string; back: string }>
}

const SESSAO_PT: Semente = {
  id: 'sessao-pt',
  titulo: 'Reunião em português',
  falaLang: 'en', // o defeito antigo: português etiquetado como inglês
  texto: FALA_PT,
  cartoes: [
    { word: 'reunião', back: 'meeting' },
    { word: 'trabalho', back: 'work' },
    { word: 'conseguir', back: 'manage' },
    { word: 'terminar', back: 'finish' },
    { word: 'atrasou', back: 'delayed' },
    { word: 'hoje', back: 'today' },
  ],
}

const SESSAO_EN: Semente = {
  id: 'sessao-en',
  titulo: 'Meeting in English',
  falaLang: 'en',
  texto: FALA_EN,
  cartoes: [
    { word: 'meeting', back: 'reunião' },
    { word: 'report', back: 'relatório' },
    { word: 'finish', back: 'terminar' },
    { word: 'delayed', back: 'atrasada' },
    { word: 'today', back: 'hoje' },
    { word: 'think', back: 'pensar' },
  ],
}

async function semear(page: Page, sessoes: Semente[]) {
  await page.evaluate(async (sessoes) => {
    const abrir = () =>
      new Promise<IDBDatabase>((ok, erro) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => ok(req.result)
        req.onerror = () => erro(req.error)
      })
    const db = await abrir()
    const tx = db.transaction(['sessoes', 'falas', 'cartoes'], 'readwrite')
    const agora = Date.now()
    for (const s of sessoes) {
      tx.objectStore('sessoes').put({
        id: s.id, title: s.titulo, kind: 'live', createdAt: agora, updatedAt: agora, durationMs: 8000,
        wordCount: s.texto.split(/\s+/).length, sourceLang: 'pt-BR', targetLang: 'en-US', status: 'done', meta: null,
      })
      tx.objectStore('falas').put({
        id: `${s.id}-f1`, sessionId: s.id, idx: 0, speakerName: null, source: 'system', sourceLang: s.falaLang,
        sourceText: s.texto, targetLang: 'pt-BR', translatedText: '', tStartMs: 0, tEndMs: 8000, engine: 'whisper-local', confidence: null,
      })
      for (const c of s.cartoes) {
        tx.objectStore('cartoes').put({
          id: `${s.id}-${c.word}`,
          // A chave que a versão antiga gravava: `en|palavra`.
          normKey: `en|${c.word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`,
          word: c.word, back: c.back, sentence: s.texto, srcLang: 'en-US', tgtLang: 'pt-BR',
          clozePrompt: s.texto.replace(c.word, '___'), clozeAnswer: c.word, box: 1, dueAt: agora,
          stability: null, difficulty: null, reps: null, lapses: null, lastReview: null, sessionId: s.id,
          inDeck: 1, cefrLevel: null, cefrConfidence: null, createdAt: agora, occurrences: 1,
        })
      }
    }
    await new Promise<void>((ok, erro) => {
      tx.oncomplete = () => ok()
      tx.onerror = () => erro(tx.error)
    })
    db.close()
  }, sessoes)
}

async function lerCartoes(page: Page, sessionId: string) {
  return page.evaluate(
    (sessionId) =>
      new Promise<Array<{ word: string; srcLang: string; tgtLang: string; normKey: string }>>((ok) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => {
          const todos = req.result.transaction('cartoes').objectStore('cartoes').getAll()
          todos.onsuccess = () => ok((todos.result as never[]).filter((c: { sessionId: string }) => c.sessionId === sessionId))
        }
      }),
    sessionId,
  )
}

async function abrir(page: Page, rota: string) {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Carregando…').first()).toBeHidden({ timeout: 20_000 })
  await page.waitForTimeout(600)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const j of ['blitz', 'memory', 'memoria']) localStorage.setItem(`babel_tour_${j}`, '1')
    } catch {
      /* storage bloqueado */
    }
    // Vozes conhecidas (as do Windows/Edge) e o registro de cada fala pedida pela página.
    const vozes = [
      { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false, default: true, voiceURI: 'aria' },
      { name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', localService: false, default: false, voiceURI: 'francisca' },
    ]
    const w = window as unknown as { __falas: Array<{ texto: string; lang: string; voz: string | null }> }
    w.__falas = []
    /* Utterance falsa: o Chromium real só aceita em `voice` um SpeechSynthesisVoice nativo, e as
       vozes acima são objetos comuns. A falsa guarda o que a página pediu, sem som. */
    class UtteranceFalsa {
      lang = ''
      voice: { name: string } | null = null
      rate = 1
      pitch = 1
      onstart: (() => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = UtteranceFalsa
    const synth = window.speechSynthesis
    if (synth) {
      synth.getVoices = () => vozes as unknown as SpeechSynthesisVoice[]
      synth.speak = ((u: UtteranceFalsa) => {
        w.__falas.push({ texto: u.text, lang: u.lang, voz: u.voice?.name ?? null })
        setTimeout(() => u.onend?.(), 10)
      }) as unknown as typeof synth.speak
    }
  })
})

async function prepararEntrada(page: Page) {
  await abrir(page, '/')
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await page.getByRole('button', { name: /Começar/ }).click()
    await expect(page.getByRole('main')).toBeVisible()
  }
}

/** Fecha as comemorações que a semente dispara (conquista, nível) — podem vir em sequência. */
async function fecharComemoracoes(page: Page) {
  for (let i = 0; i < 6; i++) {
    const b = page.getByRole('button', { name: 'Resgatar e continuar' })
    if (!(await b.isVisible().catch(() => false))) {
      await page.waitForTimeout(500)
      if (!(await b.isVisible().catch(() => false))) return
    }
    await b.click()
    await page.waitForTimeout(400)
  }
}

async function lerSessao(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      new Promise<{ sourceLang: string; targetLang: string }>((ok) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => {
          const r = req.result.transaction('sessoes').objectStore('sessoes').get(id)
          r.onsuccess = () => ok(r.result)
        }
      }),
    id,
  )
}

/**
 * Em /jogar (a Biblioteca e a sessão exigem conta na edição estática), com a gravação e o idioma,
 * abre a Memória e vira cartas até a página pedir fala. Devolve as falas registradas.
 */
async function falasEmJogar(page: Page, sessao: string, idioma: string, nome: string) {
  // Uma gravação só, no idioma dela — o mesmo recorte que a sala monta, pela URL que ela publica.
  await abrir(page, `/jogar?fonte=sessao&sessao=${sessao}&idioma=${idioma}`)
  await fecharComemoracoes(page)
  const sala = page.getByRole('dialog', { name: 'O que você vai praticar' })
  if (await sala.isVisible().catch(() => false)) await sala.getByRole('button', { name: /Usar estas palavras/ }).click()
  await fecharComemoracoes(page)
  await page.evaluate(() => ((window as unknown as { __falas: unknown[] }).__falas = []))
  const carta = page.locator('#grade-de-jogos').getByRole('button', { name: /^Memória/ }).first()
  await expect(carta).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(PASTA, `jogar-${nome}.png`) })
  await carta.click()
  await page.waitForTimeout(1200)
  // As cartas do tabuleiro (a de PALAVRA fala ao virar; a de tradução, não). Uma por vez, com
  // pausa entre elas, para o par errado desvirar antes da próxima.
  const cartas = page.locator('[aria-label="Tabuleiro"] button[data-texto]')
  const total = await cartas.count()
  for (let i = 0; i < total; i++) {
    const n = await page.evaluate(() => (window as unknown as { __falas: unknown[] }).__falas.length)
    if (n >= 3) break
    await cartas.nth(i).click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(1000)
  }
  await page.screenshot({ path: path.join(PASTA, `memoria-${nome}.png`) })
  return page.evaluate(() => (window as unknown as { __falas: Array<{ texto: string; lang: string; voz: string | null }> }).__falas)
}

test('sessão em português: cartões, idioma da sessão e Jogar em português; sessão em inglês continua inglês', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1280', 'uma resolução basta: o que se mede é dado e fala, não layout')
  await prepararEntrada(page)
  await semear(page, [SESSAO_PT, SESSAO_EN])

  // A primeira leitura (Jogar lê o baralho) repara os dados antigos.
  const falasPt = await falasEmJogar(page, 'sessao-pt', 'pt', 'pt')

  const pt = await lerCartoes(page, 'sessao-pt')
  expect(pt.every((c) => c.srcLang === 'pt' && c.tgtLang === 'en-US'), JSON.stringify(pt)).toBe(true)
  expect(pt.find((c) => c.word === 'reunião')?.normKey).toBe('pt|reuniao')
  const en = await lerCartoes(page, 'sessao-en')
  expect(en.every((c) => c.srcLang === 'en-US')).toBe(true)
  // O idioma da SESSÃO (o que a Biblioteca mostra e filtra) é o do conteúdo.
  expect((await lerSessao(page, 'sessao-pt')).sourceLang).toBe('pt-BR')
  expect(await lerSessao(page, 'sessao-en')).toMatchObject({ sourceLang: 'en', targetLang: 'pt-BR' })

  const palavrasPt = falasPt.filter((f) => SESSAO_PT.cartoes.some((c) => c.word === f.texto))
  expect(palavrasPt.length, `a Memória leu alguma carta em português: ${JSON.stringify(falasPt)}`).toBeGreaterThan(0)
  for (const f of palavrasPt) {
    expect(f.lang).toBe('pt-BR')
    expect(f.voz).toMatch(/Portuguese/)
  }

  const falasEn = await falasEmJogar(page, 'sessao-en', 'en', 'en')
  // Evidência: cada fala que a página pediu, com lang e voz.
  writeFileSync(path.join(PASTA, 'falas.json'), JSON.stringify({ pt: falasPt, en: falasEn, cartoesPt: pt, cartoesEn: en }, null, 2))
  const palavrasEn = falasEn.filter((f) => SESSAO_EN.cartoes.some((c) => c.word === f.texto))
  expect(palavrasEn.length, JSON.stringify(falasEn)).toBeGreaterThan(0)
  for (const f of palavrasEn) {
    expect(f.lang).toBe('en-US')
    expect(f.voz).toMatch(/English/)
  }
})
