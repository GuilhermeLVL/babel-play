/**
 * ACESSO SEM CONTA v2, A PORTA (openspec `acesso-sem-conta-v2`, etapa 3), com a flag
 * `acesso_restrito_sem_conta` LIGADA NA PÁGINA (`/api/flags`, como os outros e2e). Os demais e2e do modo
 * público seguem com ela desligada.
 *
 *  1. Sem nenhuma sessão, o app abre direto (a 1ª sessão é livre).
 *  2. A 1ª sessão fica no IndexedDB do modo sem conta (semeada aqui: gravar de verdade pede microfone e
 *     motor de transcrição, que a suíte `tests/e2e` já cobre). Na mesma visita nada muda; COMEÇAR a 2ª
 *     (entrar em /capturar) abre a porta.
 *  3. Adulto: a porta leva ao Login sem "Continuar sem conta"; entrar volta a /capturar e o modal da
 *     migração sobe a sessão local.
 *  4. Menor: segue local, com o convite neutro, e a porta não volta.
 */
import { expect, type Page, test } from '@playwright/test'

const FLAG = { acesso_restrito_sem_conta: { ligada: true } }

async function ligarFlag(page: Page) {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: FLAG } }))
}

/**
 * A 1ª sessão, como o servidor em memória a guarda (`src/data/efemero/store.ts`, banco `babel-local` v2).
 * Cria os stores que faltarem com o mesmo desenho do app, para o `openDB` dele não precisar de upgrade.
 */
async function semearPrimeiraSessao(page: Page, titulo: string) {
  await page.evaluate(
    (titulo) =>
      new Promise<void>((ok, falha) => {
        const req = indexedDB.open('babel-local', 2)
        req.onupgradeneeded = () => {
          const db = req.result
          const tem = (n: string) => db.objectStoreNames.contains(n)
          if (!tem('sessoes')) db.createObjectStore('sessoes', { keyPath: 'id' }).createIndex('porCriacao', 'createdAt')
          if (!tem('falas')) db.createObjectStore('falas', { keyPath: 'id' }).createIndex('porSessao', 'sessionId')
          if (!tem('audios')) db.createObjectStore('audios', { keyPath: 'sessionId' })
          if (!tem('cartoes')) db.createObjectStore('cartoes', { keyPath: 'id' }).createIndex('porNormKey', 'normKey')
          if (!tem('revisoes')) db.createObjectStore('revisoes', { keyPath: 'id' }).createIndex('porCartao', 'cardId')
          if (!tem('exercicios'))
            db.createObjectStore('exercicios', { keyPath: 'id' }).createIndex('porSessao', 'sessionId')
          if (!tem('gastos')) db.createObjectStore('gastos', { keyPath: 'spendId' })
          if (!tem('presencas')) db.createObjectStore('presencas', { keyPath: 'dia' })
          if (!tem('creditos')) db.createObjectStore('creditos', { keyPath: 'creditoId' })
        }
        req.onerror = () => falha(req.error)
        req.onsuccess = () => {
          const db = req.result
          const id = crypto.randomUUID()
          const agora = Date.now()
          const tx = db.transaction(['sessoes', 'falas'], 'readwrite')
          tx.objectStore('sessoes').put({
            id,
            title: titulo,
            kind: 'media',
            createdAt: agora,
            updatedAt: agora,
            durationMs: 60_000,
            wordCount: 4,
            sourceLang: 'en',
            targetLang: 'pt',
            status: 'done',
            meta: null,
            origemLocalId: null,
          })
          tx.objectStore('falas').put({
            id: crypto.randomUUID(),
            sessionId: id,
            idx: 0,
            speakerName: null,
            source: 'media',
            sourceLang: 'en',
            sourceText: 'Hello there, my friend.',
            targetLang: 'pt',
            translatedText: 'Olá, meu amigo.',
            tStartMs: 0,
            tEndMs: 2000,
            engine: 'local',
            confidence: 0.9,
          })
          tx.oncomplete = () => {
            db.close()
            ok()
          }
          tx.onerror = () => falha(tx.error)
        }
      }),
    titulo,
  )
}

/** Navega dentro da mesma visita (o "voltar" do app escuta o `popstate`). */
async function irNaMesmaVisita(page: Page, caminho: string) {
  await page.evaluate((c) => {
    history.pushState({}, '', c)
    dispatchEvent(new PopStateEvent('popstate'))
  }, caminho)
}

test('adulto: 1ª sessão livre, a 2ª abre a porta, entra e volta com a sessão migrada', async ({ page }) => {
  await ligarFlag(page)
  await page.goto('/')
  await expect(page.locator('nav.q-trilho')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('porta-de-entrada')).toHaveCount(0)

  await semearPrimeiraSessao(page, `Sessão e2e ${Date.now()}`)
  /* Na mesma visita, o jogo depois da 1ª sessão segue livre. */
  await irNaMesmaVisita(page, '/jogar')
  await expect(page.getByTestId('porta-de-entrada')).toHaveCount(0)

  /* Começar a 2ª sessão: a porta. */
  await irNaMesmaVisita(page, '/capturar')
  const porta = page.getByTestId('porta-de-entrada')
  await expect(porta).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Você tem 18 anos ou mais?' })).toBeVisible()
  await page.getByRole('button', { name: 'Sim, tenho 18 anos ou mais' }).click()

  await expect(page.getByTestId('login-do-quest')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar sem conta' })).toHaveCount(0)

  /* A conta do Supabase falso já existe: troca para "Entrar" na própria porta. */
  await page.locator('.qen-rodape').getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.locator('#auth-email').fill('e2e@babel.test')
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(page.getByTestId('login-do-quest')).toBeHidden({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/capturar$/)

  const migracao = page.getByTestId('migracao-do-quest')
  /* Num banco novo a conta ainda não disse a idade: a `PerguntaDeIdade` (a fonte da verdade) vem antes. */
  const idade = page.getByRole('heading', { level: 1, name: 'Quando você nasceu?' })
  await expect(migracao.or(idade)).toBeVisible({ timeout: 30_000 })
  if (await idade.isVisible()) {
    await page.getByLabel('Data de nascimento').fill('1990-01-01')
    await page.getByRole('button', { name: 'Confirmar' }).click()
  }
  await expect(migracao).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/capturar$/)
  await migracao.getByRole('button', { name: 'Guardar na conta' }).click()
  await expect(migracao.getByRole('status')).toContainText('Subiram 1 sessões novas', { timeout: 30_000 })
})

test('menor: segue local com o convite neutro, e a porta não volta', async ({ page }) => {
  await ligarFlag(page)
  await page.goto('/')
  await expect(page.locator('nav.q-trilho')).toBeVisible({ timeout: 60_000 })
  await semearPrimeiraSessao(page, `Sessão e2e menor ${Date.now()}`)

  /* Voltar ao app depois do 1º uso: a porta já na chegada. */
  await page.reload()
  await expect(page.getByTestId('porta-de-entrada')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Não, tenho menos de 18' }).click()
  await expect(page.getByTestId('convite-do-responsavel')).toHaveText('Com um responsável, você pode criar uma conta.')
  await page.getByRole('button', { name: 'Continuar' }).click()

  await expect(page.getByTestId('porta-de-entrada')).toHaveCount(0)
  await expect(page.locator('nav.q-trilho')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('babel.faixa_sem_conta'))).toBe('menor')

  await page.reload()
  await expect(page.locator('nav.q-trilho')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('porta-de-entrada')).toHaveCount(0)
})
