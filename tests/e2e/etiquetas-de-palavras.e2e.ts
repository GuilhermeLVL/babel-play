import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { iniciarCaptura } from './_captura'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * AS ETIQUETAS DE PALAVRAS de ponta a ponta, com o caderno e o índice do servidor SIMULADOS (`page.route`): o app roda
 * em self-host, e as rotas `/api/vocab/vistas` e `/api/vocab/palavra` são do ramo do servidor.
 *
 * Prova: na legenda da captura, a palavra guardada e a que está aprendendo ganham o tom, a nova para você ganha o ponto
 * (e a palavra-função não), e a linha tem a descrição; a folha da frase repete as etiquetas; o cartão da palavra traz o
 * histórico (contagem, onde, jogos) e grava a nota (PUT com o corpo); desligar nos Ajustes tira tudo. Na janela
 * flutuante, as mesmas etiquetas, e a Faixa sem o ponto. Na Biblioteca, a transcrição pintada e os filtros de
 * "Palavras desta sessão". O CONVIDADO é simulado como o cliente o vê sem conta: as duas rotas respondem 501
 * `exige_conta` (o servidor efêmero de verdade é coberto em `tests/etiquetas-cliente.test.tsx`).
 *
 * Com `ETIQUETAS_TELAS=<pasta>`, fotografa cada tela, claro e escuro.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
})

const PASTA = process.env.ETIQUETAS_TELAS
const aparelho = () => (test.info().project.name === 'mobile-375' ? 'celular' : 'computador')
const foto = async (page: Page, nome: string, alvo?: string) => {
  if (!PASTA) return
  mkdirSync(PASTA, { recursive: true })
  await page.waitForTimeout(400)
  const caminho = join(PASTA, `${nome}.png`)
  if (alvo) await page.locator(alvo).screenshot({ path: caminho })
  else await page.screenshot({ path: caminho })
}
const tema = (page: Page, escuro: boolean) =>
  page.evaluate((e) => document.documentElement.classList.toggle('dark', e), escuro)

const FRASES: Array<[string, string]> = [
  ['The report was ambiguous, so we checked it twice.', 'O relatório era ambíguo, então conferimos duas vezes.'],
  ['Bring the report tomorrow and scrutinize every number.', 'Traga o relatório amanhã e examine cada número.'],
]
const falarTraduzido = (page: Page, pares: Array<[string, string]>) =>
  page.evaluate(
    (ps) =>
      (window as unknown as { __simFalas: (t: string[], f?: string, l?: string, tr?: string[]) => number }).__simFalas(
        ps.map((p) => p[0]),
        undefined,
        'en',
        ps.map((p) => p[1]),
      ),
    pares,
  )

const AGORA = Date.now()
/** Uma linha do baralho como o servidor a manda. */
const cartao = (word: string, fase: 'nova' | 'aprendendo' | 'dominada', sessionId: string | null = null) => ({
  id: `etq-${word}`,
  word,
  back: { report: 'relatório', ambiguous: 'ambíguo', twice: 'duas vezes' }[word] ?? word,
  sentence: null,
  srcLang: 'en',
  tgtLang: 'pt-BR',
  clozePrompt: null,
  clozeAnswer: null,
  box: 1,
  dueAt: AGORA + 3 * 86_400_000,
  createdAt: AGORA - 86_400_000,
  stability: fase === 'nova' ? null : fase === 'aprendendo' ? 2 : 400,
  difficulty: 5,
  reps: fase === 'nova' ? 0 : fase === 'aprendendo' ? 1 : 6,
  lapses: 0,
  lastReview: AGORA - 3_600_000,
  sessionId,
  inDeck: 1,
  cefrLevel: 'B1',
  cefrConfidence: 1,
})

const VISTAS = ['report', 'ambiguous', 'checked', 'twice', 'bring', 'tomorrow', 'every', 'number', 'so', 'we']

const HISTORICO_DE_REPORT = {
  chave: 'report',
  lang: 'en',
  cartao: {
    id: 'etq-report',
    estado: 'aprendendo',
    proximaRevisao: new Date(AGORA + 3 * 86_400_000).toISOString(),
    reps: 1,
    lapses: 0,
  },
  vistas: { vezes: 7, sessoes: 3, primeiraEm: '2026-10-01T10:00:00.000Z', ultimaEm: '2026-10-25T10:00:00.000Z' },
  onde: [
    {
      sessaoId: 'sessao-a',
      titulo: 'Aula de inglês',
      quando: '2026-10-25T10:00:00.000Z',
      frase: 'Send me the report.',
    },
    { sessaoId: 'sessao-b', titulo: 'Reunião de equipe', quando: '2026-10-20T10:00:00.000Z', frase: null },
  ],
  jogos: [
    { jogo: 'memory', acertos: 4, erros: 1, ultimoEm: '2026-10-24T10:00:00.000Z' },
    { jogo: 'revisao', acertos: 2, erros: 0, ultimoEm: '2026-10-25T10:00:00.000Z' },
  ],
  nota: 'lembrar do relatório mensal',
}

interface Pedidos {
  notas: Array<{ url: string; corpo: unknown }>
  vistas: number
}

/** O caderno, o índice de vistas, a lista de sessões (3 em inglês: histórico suficiente) e o histórico da palavra. */
async function prepararRotas(page: Page, o: { convidado?: boolean; sessaoDoCaderno?: string } = {}): Promise<Pedidos> {
  const pedidos: Pedidos = { notas: [], vistas: 0 }
  const s = o.sessaoDoCaderno ?? null
  await page.route(/\/api\/vocab(\?.*)?$/, (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({
          json: [cartao('report', 'aprendendo', s), cartao('ambiguous', 'nova', s), cartao('twice', 'dominada', s)],
        })
      : r.continue(),
  )
  await page.route(/\/api\/sessions(\?.*)?$/, async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const real = await r.fetch()
    const lista = ((await real.json().catch(() => [])) as unknown[]) ?? []
    const falsas = ['a', 'b', 'c'].map((x) => ({
      id: `sessao-${x}`,
      title: `Sessão ${x}`,
      createdAt: AGORA - 86_400_000,
      durationMs: 60_000,
      wordCount: 120,
      kind: 'live',
      status: 'done',
      meta: null,
      sourceLang: 'en-US',
      targetLang: 'pt-BR',
    }))
    return r.fulfill({ response: real, json: [...lista, ...falsas] })
  })
  const exigeConta = { status: 501, json: { erro: 'Exige conta', codigo: 'exige_conta' } }
  await page.route(/\/api\/vocab\/vistas/, (r) => {
    pedidos.vistas++
    return o.convidado ? r.fulfill(exigeConta) : r.fulfill({ json: { lang: 'en', chaves: VISTAS, truncado: false } })
  })
  await page.route(/\/api\/vocab\/palavra/, (r) => {
    if (o.convidado) return r.fulfill(exigeConta)
    const chave = new URL(r.request().url()).searchParams.get('chave')
    if (chave === 'report') return r.fulfill({ json: HISTORICO_DE_REPORT })
    return r.fulfill({
      json: {
        chave,
        lang: 'en',
        cartao: null,
        vistas: { vezes: 0, sessoes: 0, primeiraEm: null, ultimaEm: null },
        onde: [],
        jogos: [],
        nota: null,
      },
    })
  })
  await page.route(/\/api\/vocab\/[^/]+\/nota$/, async (r) => {
    const corpo = r.request().postDataJSON() as { nota: string }
    pedidos.notas.push({ url: r.request().url(), corpo })
    return r.fulfill({ json: { id: 'etq-report', nota: corpo.nota || null } })
  })
  return pedidos
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'computador e celular bastam: o tablet é o layout do computador')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
  await page.addInitScript(() => {
    if (sessionStorage.getItem('etq-limpo')) return
    sessionStorage.setItem('etq-limpo', '1')
    for (const k of ['babel.assistente', 'theme', 'babel.legendasFlutuantes', 'babel.legendasFlutuantes.tamanhos'])
      localStorage.removeItem(k)
  })
})

const linhaDe = (page: Page, i: number) => page.locator('.q-linha-da-fala').nth(i)

async function capturaComFalas(page: Page) {
  await abrirTela(page, '/capturar')
  await tema(page, false)
  await iniciarCaptura(page)
  await falarTraduzido(page, FRASES)
  await expect(page.locator('.q-linha-da-fala .q-o').last()).toHaveText(FRASES[1][0], { timeout: 20_000 })
}

test('captura: tom no caderno, ponto na nova, descrição na linha, histórico e nota no cartão; desligar tira', async ({
  page,
}) => {
  test.slow()
  const pedidos = await prepararRotas(page)
  await capturaComFalas(page)

  const primeira = linhaDe(page, 0)
  const segunda = linhaDe(page, 1)
  await expect(primeira.locator('.q-o [data-etiqueta="aprendendo"]')).toHaveText('report', { timeout: 10_000 })
  await expect(primeira.locator('.q-o [data-etiqueta="salva"]')).toHaveText('ambiguous')
  await expect(primeira.locator('.q-o [data-etiqueta="dominada"]')).toHaveText('twice')
  await expect(segunda.locator('.q-o [data-etiqueta="nova-para-voce"]')).toHaveText('scrutinize', { timeout: 10_000 })
  /* Palavra-função e palavra que o índice já viu: sem ponto. */
  await expect(page.locator('.q-o [data-etiqueta="nova-para-voce"]')).toHaveCount(1)
  /* O texto é o mesmo: a etiqueta é só atributo. */
  await expect(primeira.locator('.q-o')).toHaveText(FRASES[0][0])
  await expect(segunda.locator('.q-fala')).toHaveAttribute(
    'aria-description',
    'Aprendendo: report. Novas para você: scrutinize.',
  )
  expect(pedidos.vistas).toBe(1)
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `captura-${aparelho()}-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)

  /* A folha da frase: as palavras como botões, com a etiqueta e a descrição. */
  await clicarRobusto(page, primeira.locator('.q-fala'))
  const botaoReport = page.locator('.folha-palavras button', { hasText: /^report$/ })
  await expect(botaoReport).toHaveAttribute('data-etiqueta', 'aprendendo')
  await expect(botaoReport).toHaveAttribute('aria-description', 'aprendendo')
  await foto(page, `captura-${aparelho()}-folha-da-frase-claro`)

  /* O cartão da palavra: o histórico, com o link da sessão em NOVA ABA (a captura está rodando). */
  await clicarRobusto(page, botaoReport)
  const historico = page.getByTestId('historico-da-palavra')
  await expect(historico.getByTestId('historico-contagem')).toHaveText('Apareceu 7× em 3 sessões', { timeout: 10_000 })
  await expect(historico).toContainText('Aprendendo · próxima revisão em')
  const link = historico.getByRole('link', { name: 'Aula de inglês' })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('href', /\/sessao\/sessao-a$/)
  await expect(historico).toContainText('Memória: 4 certas, 1 erradas')
  await expect(historico).toContainText('Revisão: 2 certas, 0 erradas')
  const nota = historico.getByRole('textbox', { name: 'Sua nota' })
  await expect(nota).toHaveValue('lembrar do relatório mensal')
  await nota.fill('relatório: report (não "relato")')
  await historico.getByRole('button', { name: 'Salvar nota' }).click()
  await expect(historico.getByRole('status')).toHaveText('Nota salva.')
  expect(pedidos.notas).toHaveLength(1)
  expect(pedidos.notas[0].url).toMatch(/\/api\/vocab\/etq-report\/nota$/)
  expect(pedidos.notas[0].corpo).toEqual({ nota: 'relatório: report (não "relato")' })
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await historico.scrollIntoViewIfNeeded()
    await foto(page, `captura-${aparelho()}-cartao-historico-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)

  /* Desligar nos Ajustes da captura tira as etiquetas da legenda. */
  await page.keyboard.press('Escape')
  await clicarRobusto(page, page.getByRole('button', { name: 'Ajustes da captura' }).first())
  const secao = page.getByTestId('ajustes-do-assistente')
  const interruptor = secao.getByRole('switch', { name: 'Etiquetas de palavras' })
  await interruptor.scrollIntoViewIfNeeded()
  await expect(interruptor).toHaveAttribute('aria-checked', 'true')
  await expect(secao.getByRole('switch', { name: 'Marcar palavras novas para você' })).toBeVisible()
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `ajustes-${aparelho()}-${escuro ? 'escuro' : 'claro'}`)
  }
  await tema(page, false)
  await interruptor.click()
  await expect(interruptor).toHaveAttribute('aria-checked', 'false')
  await expect(secao.getByRole('switch', { name: 'Marcar palavras novas para você' })).toHaveCount(0)
  await expect(page.locator('.q-historico [data-etiqueta]')).toHaveCount(0)
  await expect(page.locator('.q-fala[aria-description]')).toHaveCount(0)
})

test('convidado (as rotas respondem 501): só o caderno pinta, sem ponto, e o cartão diz onde mora o resto', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'desktop-1280', 'uma vez, no computador')
  test.slow()
  await prepararRotas(page, { convidado: true })
  await capturaComFalas(page)
  const primeira = linhaDe(page, 0)
  await expect(primeira.locator('.q-o [data-etiqueta="aprendendo"]')).toHaveText('report', { timeout: 10_000 })
  await expect(primeira.locator('.q-o [data-etiqueta="salva"]')).toHaveText('ambiguous')
  /* Espera o índice responder (501) e confere: nenhum ponto. */
  await page.waitForTimeout(800)
  await expect(page.locator('[data-etiqueta="nova-para-voce"]')).toHaveCount(0)

  await clicarRobusto(page, primeira.locator('.q-fala'))
  await clicarRobusto(page, page.locator('.folha-palavras button', { hasText: /^report$/ }))
  const historico = page.getByTestId('historico-da-palavra')
  await expect(historico).toContainText('Aprendendo')
  await expect(historico).toContainText('ficam na sua conta', { timeout: 10_000 })
  await expect(historico.getByRole('textbox')).toHaveCount(0)
  await foto(page, 'convidado-computador-cartao-claro')
})

/** A Document PiP simulada (a mesma de `legenda-pip.e2e.ts`): a janela de um `<iframe>` do tamanho pedido. */
function simularDocumentPiP() {
  const api = {
    requestWindow({ width, height }: { width: number; height: number }) {
      const f = document.createElement('iframe')
      f.id = 'pip-simulada'
      f.title = 'PiP simulada'
      f.style.cssText = `position:fixed;left:16px;top:16px;width:${width}px;height:${height}px;border:0;z-index:2147483647;box-shadow:0 0 0 1px #888`
      document.body.appendChild(f)
      const w = f.contentWindow!
      Object.defineProperty(w, 'outerWidth', { configurable: true, get: () => w.innerWidth })
      Object.defineProperty(w, 'outerHeight', { configurable: true, get: () => w.innerHeight })
      ;(w as unknown as { resizeTo: (a: number, b: number) => void }).resizeTo = (a, b) => {
        f.style.width = `${a}px`
        f.style.height = `${b}px`
      }
      ;(w as unknown as { close: () => void }).close = () => {
        if (!f.isConnected) return
        w.dispatchEvent(new Event('pagehide'))
        f.remove()
      }
      return Promise.resolve(w)
    },
  }
  Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: api })
}

test('janela flutuante: as mesmas etiquetas, a Faixa sem o ponto e o histórico no cartão', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-1280', 'a janela flutuante é do computador')
  test.slow()
  await prepararRotas(page)
  await page.addInitScript(simularDocumentPiP)
  await capturaComFalas(page)
  await clicarRobusto(
    page,
    page.getByRole('toolbar', { name: 'Controles da captura' }).getByRole('button', { name: 'Legendas flutuantes' }),
  )
  const pip = page.frameLocator('#pip-simulada')
  const regiao = pip.getByRole('region', { name: 'Legendas flutuantes' })
  await expect(regiao).toBeVisible()
  const trocar = async (valor: 'jogo' | 'video' | 'conversa' | 'estudo') => {
    const box = await page.locator('#pip-simulada').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 8)
    await pip.getByRole('combobox', { name: 'Modo da janela' }).selectOption(valor)
    await page.mouse.move(1200, 780)
  }
  await trocar('conversa')
  await expect(regiao).toHaveAttribute('data-layout', 'conversa')
  await expect(pip.locator('[data-palavra="report"][data-etiqueta="aprendendo"]').first()).toBeVisible({
    timeout: 10_000,
  })
  await expect(pip.locator('[data-palavra="scrutinize"]')).toHaveAttribute('data-etiqueta', 'nova-para-voce')
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `pip-conversa-${escuro ? 'escuro' : 'claro'}`, '#pip-simulada')
  }
  await tema(page, false)

  /* A Faixa (jogo): o tom fica, o ponto sai. */
  await trocar('jogo')
  await expect(regiao).toHaveAttribute('data-layout', 'faixa')
  await expect(pip.locator('[data-palavra="scrutinize"]')).not.toHaveAttribute('data-etiqueta', /./)
  await expect(pip.locator('[data-palavra="report"][data-etiqueta="aprendendo"]').first()).toBeVisible()
  await foto(page, 'pip-faixa', '#pip-simulada')

  /* Estudo: tocar a palavra abre o cartão com o histórico; o link abre em nova aba. */
  await trocar('estudo')
  await expect(regiao).toHaveAttribute('data-layout', 'estudo')
  await pip.locator('.leg-fala.atual [data-palavra="report"]').click()
  const cartaoDaPalavra = pip.getByRole('dialog', { name: 'Palavra: report' })
  await expect(cartaoDaPalavra.getByTestId('historico-contagem')).toHaveText('Apareceu 7× em 3 sessões', {
    timeout: 10_000,
  })
  await expect(cartaoDaPalavra.getByRole('link', { name: 'Aula de inglês' })).toHaveAttribute('target', '_blank')
  for (const escuro of [false, true]) {
    await tema(page, escuro)
    await foto(page, `pip-estudo-cartao-${escuro ? 'escuro' : 'claro'}`, '#pip-simulada')
  }
  await tema(page, false)
})

test('Biblioteca: a transcrição pintada, a descrição da fala e os filtros de "Palavras desta sessão"', async ({
  page,
  request,
}) => {
  test.slow()
  const criada = await request.post('/api/sessions', {
    data: {
      title: 'Etiquetas na Biblioteca',
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      status: 'done',
      durationMs: 8000,
      utterances: FRASES.map(([o, tr], idx) => ({
        idx,
        source: 'system',
        sourceLang: 'en',
        sourceText: o,
        targetLang: 'pt-BR',
        translatedText: tr,
        tStartMs: idx * 4000,
        tEndMs: idx * 4000 + 3500,
      })),
    },
  })
  expect(criada.ok()).toBe(true)
  const { id } = (await criada.json()) as { id: string }
  try {
    await prepararRotas(page, { sessaoDoCaderno: id })
    await page.goto(`/sessao/${id}`)
    await tema(page, false)
    const falas = page.locator('.qs-fala')
    await expect(falas).toHaveCount(2, { timeout: 20_000 })
    await expect(falas.nth(0).locator('.w[data-etiqueta="aprendendo"]')).toHaveText('report', { timeout: 10_000 })
    await expect(falas.nth(0).locator('.w[data-etiqueta="salva"]')).toHaveText('ambiguous,')
    await expect(falas.nth(1).locator('.w[data-etiqueta="nova-para-voce"]')).toHaveText('scrutinize')
    await expect(falas.nth(1).locator('.qs-fala-texto')).toHaveAttribute(
      'aria-description',
      'Aprendendo: report. Novas para você: scrutinize.',
    )
    for (const escuro of [false, true]) {
      await tema(page, escuro)
      await foto(page, `biblioteca-${aparelho()}-${escuro ? 'escuro' : 'claro'}`)
    }
    await tema(page, false)

    await clicarRobusto(page, page.getByRole('button', { name: /Palavras desta sessão/ }))
    const dialogo = page.getByRole('dialog', { name: 'Palavras desta sessão' })
    await expect(dialogo.locator('.q-linha')).toHaveCount(3)
    await dialogo.getByRole('button', { name: 'Aprendendo', exact: true }).click()
    await expect(dialogo.getByRole('button', { name: 'Aprendendo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(dialogo.locator('.q-linha')).toHaveCount(1)
    await expect(dialogo.locator('.q-linha b')).toHaveText('report')
    await dialogo.getByRole('button', { name: 'Dominadas' }).click()
    await expect(dialogo.locator('.q-linha b')).toHaveText('twice')
    await dialogo.getByRole('button', { name: 'Todas' }).click()
    await expect(dialogo.locator('.q-linha')).toHaveCount(3)
    for (const escuro of [false, true]) {
      await tema(page, escuro)
      await foto(page, `biblioteca-${aparelho()}-palavras-${escuro ? 'escuro' : 'claro'}`)
    }
    await tema(page, false)
  } finally {
    await request.delete(`/api/sessions/${id}`)
  }
})
