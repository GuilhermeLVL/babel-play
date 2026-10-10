import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

/**
 * O FIM DA CAPTURA NA EDIÇÃO ESTÁTICA (relato do dono, 2026-09-28: "quando tento ENCERRAR uma
 * sessão demora, trava e eu fico preso na tela sem conseguir sair").
 *
 * As três causas medidas, cada uma com o seu cenário:
 *  1. o teto sem conta (20 gravações nesta edição) só aparecia na recusa, e a recusa reabria o
 *     Encerrar num laço — agora a tela avisa ANTES de gravar, com uma saída ali mesmo;
 *  2. "Salvar e ficar aqui" deixava a trava de saída ligada, e sair salvava uma SEGUNDA sessão;
 *  3. a recusa no meio do salvamento (o acervo encheu durante a gravação) tinha como única saída
 *     descartar — agora ela mostra o motivo, guarda a captura e dá "Apagar uma antiga" e "Tentar de
 *     novo", e sair da tela não perde nada.
 *
 * As falas entram por `window.__simFalas` (a bancada da tela, sem STT nem MT): o que se mede aqui
 * é o fim da captura, não o reconhecimento. A captura começa de verdade, com a mídia falsa do
 * Chromium (a tela compartilhada é escolhida sozinha).
 *
 * DESENHO NOVO (09/10/2026). A captura abre pronta, com "Iniciar captura" na faixa de baixo
 * (`iniciar-captura`); gravando, o botão vira "Encerrar" (`encerrar-captura`, o antigo "Parar
 * captura"). O menu é o trilho de ícones (a barra de cinco destinos no celular): cada destino é
 * `.q-item[data-px-rota=<view>]` — menos o Jogar no celular, que desde 10/10/2026 mora atrás do
 * "Praticar" da barra (`irAoJogarPeloMenu`). Já na captura pronta, tocar de novo em Capturar no menu COMEÇA a
 * gravar — por isso o teste só toca nele vindo de outra tela.
 */
const PASTA = process.env.SCREENSHOTS_ESTATICA || path.join('test-results', 'estatica', 'fim-da-captura')
mkdirSync(PASTA, { recursive: true })

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

async function abrir(page: Page, rota: string) {
  await page.goto(rota)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Carregando…').first()).toBeHidden({ timeout: 20_000 })
  await page.waitForTimeout(600)
}

/** Fecha comemorações e avisos que a semente dispara — podem vir em sequência. */
async function fecharDialogos(page: Page) {
  for (let i = 0; i < 6; i++) {
    const aberto = page.locator('dialog[open]')
    if (!(await aberto.count())) {
      await page.waitForTimeout(300)
      if (!(await aberto.count())) return
    }
    const resgatar = page.getByRole('button', { name: 'Resgatar e continuar' })
    if (await resgatar.isVisible().catch(() => false)) await resgatar.click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
}

async function entrar(page: Page) {
  await abrir(page, '/')
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  if (await pular.isVisible().catch(() => false)) {
    await pular.click()
    await page.getByRole('button', { name: /Começar/ }).click()
    await expect(page.getByRole('main')).toBeVisible()
  }
}

async function semear(page: Page, n: number, prefixo = 'antiga') {
  await page.evaluate(
    async ({ n, prefixo }) => {
      const db = await new Promise<IDBDatabase>((ok, erro) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => ok(req.result)
        req.onerror = () => erro(req.error)
      })
      const tx = db.transaction(['sessoes'], 'readwrite')
      const agora = Date.now()
      for (let i = 0; i < n; i++) {
        tx.objectStore('sessoes').put({
          id: `${prefixo}-${i}`,
          title: `Gravação ${prefixo} ${i + 1}`,
          kind: 'live',
          createdAt: agora - (n - i) * 60_000,
          updatedAt: agora,
          durationMs: 8000,
          wordCount: 3,
          sourceLang: 'en',
          targetLang: 'pt-BR',
          status: 'done',
          meta: null,
        })
      }
      await new Promise<void>((ok, erro) => {
        tx.oncomplete = () => ok()
        tx.onerror = () => erro(tx.error)
      })
      db.close()
    },
    { n, prefixo },
  )
}

async function contarSessoes(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const req = indexedDB.open('babel-local')
        req.onsuccess = () => {
          const c = req.result.transaction('sessoes').objectStore('sessoes').count()
          c.onsuccess = () => ok(c.result)
        }
      }),
  )
}

async function iniciarCaptura(page: Page) {
  await fecharDialogos(page)
  await page.getByTestId('iniciar-captura').click()
  /* No celular a captura pergunta antes de baixar os modelos (os downloads estão bloqueados no
     `beforeEach`: as falas vêm da bancada, o modelo não é necessário). */
  const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
  const perguntou = await baixar
    .waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true)
    .catch(() => false)
  if (perguntou) await baixar.click()
  await expect(page.getByTestId('encerrar-captura')).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() =>
    (window as unknown as { __simFalas: (t: string[]) => number }).__simFalas([
      'good morning everyone and welcome back',
      'today we are going to talk about travel',
      'please open your books on page twelve',
    ]),
  )
  await expect(page.getByText('today we are going to talk about travel').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  // Nenhum modelo de fala/tradução é baixado: o que se mede é o fim da captura, não o reconhecimento.
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

/** Um destino do menu: no trilho de ícones (computador) ou na barra de baixo (celular). */
const doMenu = (page: Page, view: 'play' | 'capture') => page.locator(`.q-trilho .q-item[data-px-rota="${view}"]`)

/**
 * Vai ao Jogar pelo menu. No trilho (computador) o Jogar tem botão próprio; na barra de cinco do celular
 * (navegação de 10/10/2026) ele mora atrás do "Praticar", que abre a última das duas telas de praticar
 * (os Cartões, num navegador novo), e a aba "Jogos" do alto da tela leva ao Jogar.
 */
async function irAoJogarPeloMenu(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) > 720) {
    await doMenu(page, 'play').click()
  } else {
    await page.locator('.q-trilho .q-item[data-px-tambem="play"]').click()
    await expect(page).toHaveURL(/\/(cartoes|jogar)/, { timeout: 10_000 })
    if (!/\/jogar/.test(new URL(page.url()).pathname))
      await page.getByTestId('abas-de-praticar').getByRole('tab', { name: 'Jogos' }).click()
  }
  await expect(page).toHaveURL(/\/jogar/, { timeout: 10_000 })
}

test('no teto (20 nesta edição), a tela avisa ANTES de gravar e dá saída ali mesmo', async ({ page }, info) => {
  await entrar(page)
  await semear(page, 20)
  await abrir(page, '/capturar')
  await fecharDialogos(page)

  const aviso = page.getByTestId('captura-nao-salva')
  await expect(aviso).toBeVisible()
  await expect(aviso).toContainText('guarda até 20 gravações')
  // Edição estática: não há conta a criar.
  await expect(aviso.getByRole('button', { name: /Criar conta/ })).toHaveCount(0)
  await page.screenshot({ path: path.join(PASTA, `teto-${info.project.name}.png`), fullPage: true })

  // Iniciar não começa uma captura que não teria onde ficar.
  await page.getByTestId('iniciar-captura').click()
  await page.waitForTimeout(500)
  await expect(page.getByTestId('encerrar-captura')).toHaveCount(0)

  // A saída: apagar uma gravação antiga, na própria tela.
  await aviso.getByRole('button', { name: /Apagar uma gravação antiga/ }).click()
  await aviso.getByRole('button', { name: 'Apagar', exact: true }).first().click()
  await aviso.getByRole('button', { name: /Apagar de vez/ }).click()
  await expect(aviso).toBeHidden()
  expect(await contarSessoes(page)).toBe(19)
})

test('Parar → "Salvar e ficar aqui" → sair: a tela solta na hora, sair não pergunta nem duplica', async ({
  page,
}, info) => {
  await entrar(page)
  await abrir(page, '/capturar')
  await iniciarCaptura(page)

  await page.getByTestId('encerrar-captura').click()
  const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
  await expect(encerrar).toBeVisible()
  const t0 = Date.now()
  await encerrar.getByRole('button', { name: 'Salvar e ficar aqui' }).click()
  // O diálogo sai e a captura para NA HORA — antes do áudio, da rede e do vocabulário.
  await expect(encerrar).toBeHidden({ timeout: 1500 })
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 1500 })
  const soltou = Date.now() - t0
  expect(soltou, 'o Encerrar demorou a soltar a tela').toBeLessThan(2500)
  // O salvamento termina em segundo plano, com a tela já solta.
  await expect.poll(() => contarSessoes(page), { timeout: 20_000 }).toBe(1)
  /* O botão "Abrir a sessão salva" (com a conta das palavras fichadas) era do desenho de antes e não
     existe na tela nova fora do headset; as falas continuam na tela, e é o que se confere aqui. */
  await expect(page.getByText('today we are going to talk about travel').first()).toBeVisible()
  await page.screenshot({ path: path.join(PASTA, `salva-${info.project.name}.png`), fullPage: true })

  // Sair: nenhuma trava ("falas não salvas"), e a sessão não é salva de novo.
  await fecharDialogos(page)
  await irAoJogarPeloMenu(page)
  await expect(page.getByText(/não foram salvas|Você tem falas não salvas/)).toHaveCount(0)
  await expect.poll(() => contarSessoes(page), { timeout: 15_000 }).toBe(1)
  await page.waitForTimeout(1500)
  expect(await contarSessoes(page)).toBe(1)
})

test('a recusa no meio do salvamento não prende: mostra o motivo, guarda a captura e dá saída', async ({
  page,
}, info) => {
  await entrar(page)
  await semear(page, 19)
  await abrir(page, '/capturar')
  await expect(page.getByTestId('captura-nao-salva')).toHaveCount(0)
  await iniciarCaptura(page)
  // O acervo enche DURANTE a gravação (outra aba, por exemplo): o salvamento vai ser recusado.
  await semear(page, 1, 'outra-aba')

  await page.getByTestId('encerrar-captura').click()
  const encerrar = page.getByRole('dialog', { name: /Encerrar a sessão/ })
  await encerrar.getByRole('button', { name: 'Salvar e ficar aqui' }).click()

  const aviso = page.getByTestId('captura-nao-salva')
  await expect(aviso).toBeVisible({ timeout: 15_000 })
  await expect(aviso).toContainText('Esta captura ainda não foi salva')
  await expect(aviso).toContainText('guarda até 20 gravações')
  // O laço antigo: o Encerrar reaberto sobre a mesma recusa.
  await expect(encerrar).toBeHidden()
  await expect(aviso.getByRole('button', { name: /Baixar esta sessão/ })).toBeVisible()
  await page.screenshot({ path: path.join(PASTA, `recusa-${info.project.name}.png`), fullPage: true })

  // Sair não perde nada nem pergunta: a captura está guardada no navegador e volta com a tela.
  await irAoJogarPeloMenu(page)
  // A primeira visita ao Jogar abre "O que você vai praticar" (no celular, por cima da barra): fecha.
  const sala = page.getByRole('dialog', { name: 'O que você vai praticar' })
  await expect(sala).toBeVisible({ timeout: 10_000 })
  await sala.getByRole('button', { name: 'Fechar sem mudar nada' }).click()
  await expect(sala).toBeHidden()
  /* DEFEITO DO APP NO CELULAR (09/10/2026, deixado falhando de propósito): o selo "A sessão … não foi
     salva" (`indicador-de-salvamento`) deveria ficar ACIMA da barra de baixo (`index.css`, pelo
     `--shell-inset-bottom`) e, com a barra flutuante do desenho novo, fica em cima dela: cobre
     Capturar, Intérprete e Jogar enquanto a recusa durar. `soft`: o teste registra a falha e segue
     pela saída que sobra (o "Ver o que fazer" do próprio selo), para conferir o resto. */
  const pelaBarra = await doMenu(page, 'capture')
    .click({ timeout: 5000 })
    .then(
      () => true,
      () => false,
    )
  expect.soft(pelaBarra, 'com a captura recusada, o destino Capturar do menu continua tocável').toBe(true)
  if (!pelaBarra)
    await page.getByTestId('indicador-de-salvamento').getByRole('button', { name: 'Ver o que fazer' }).click()
  await expect(page.getByTestId('captura-nao-salva')).toBeVisible({ timeout: 10_000 })

  // A saída de verdade: apagar uma antiga e tentar de novo — com o MESMO id, sem duplicar.
  const deNovo = page.getByTestId('captura-nao-salva')
  await deNovo.getByRole('button', { name: /Apagar uma gravação antiga/ }).click()
  await deNovo.getByRole('button', { name: 'Apagar', exact: true }).first().click()
  await deNovo.getByRole('button', { name: /Apagar de vez/ }).click()
  await expect.poll(() => contarSessoes(page)).toBe(19)
  await deNovo.getByRole('button', { name: /Tentar de novo/ }).click()
  await expect(page.getByTestId('captura-nao-salva')).toBeHidden({ timeout: 15_000 })
  await expect.poll(() => contarSessoes(page), { timeout: 15_000 }).toBe(20)
})
