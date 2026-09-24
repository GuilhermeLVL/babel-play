/**
 * LOGIN DE VERDADE NO MODO PÚBLICO (Fase 5) — navegador, supabase-js, JWKS, 2FA.
 *
 * Roda com `playwright.publico.config.ts`: o app com `AUTH_REQUIRED=1` apontado para um Supabase
 * Auth falso (`_supabase-falso.mjs`). Prova, ponta a ponta, o que só existia por partes:
 *   1. a porta de login aparece e aceita e-mail e senha;
 *   2. o token que o navegador recebe é aceito pelo SERVIDOR (verificado pelo JWKS) — a API
 *      responde 200 com `Authorization: Bearer`;
 *   3. sem token, a API responde 401;
 *   4. conta com 2FA vê o desafio do código logo depois do login, e o código eleva a sessão para aal2.
 */
import { expect, type Page, test } from '@playwright/test'

const SENHA = 'senha-e2e-123'

function aalDo(authorization: string | undefined): string | undefined {
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return undefined
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).aal
}

/** A primeira resposta 200 da API que levou um Bearer — prova de que o servidor aceitou o token. */
function respostaAutenticada(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.url().includes('/api/') && r.status() === 200 && /^Bearer /.test(r.request().headers().authorization ?? ''),
    { timeout: 30_000 },
  )
}

/** A porta de login abre pelo menu da conta — sem conta, o app abre direto (soft gate D10). */
async function abrirLogin(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sua conta' }).click({ timeout: 60_000 })
  await page.getByRole('menuitem', { name: 'Entrar ou criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
}

async function entrar(page: Page, email: string) {
  await abrirLogin(page)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

test('sem token, a API responde 401 no modo público', async ({ request }) => {
  const r = await request.get('/api/sessions')
  expect(r.status()).toBe(401)
})

test('login com e-mail e senha: o servidor aceita o token do navegador', async ({ page }) => {
  await abrirLogin(page)
  await page.getByLabel('E-mail').fill('e2e@babel.test')
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  const autenticada = respostaAutenticada(page)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  const r = await autenticada
  expect(aalDo(r.request().headers().authorization)).toBe('aal1')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden()
})

test('senha errada: mensagem genérica, e continua na porta de login', async ({ page }) => {
  await abrirLogin(page)
  await page.getByLabel('E-mail').fill('e2e@babel.test')
  await page.getByLabel('Senha', { exact: true }).fill('errada-123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
})

test('conta com 2FA: pede o código depois do login, e o código eleva a sessão para aal2', async ({ page }) => {
  await entrar(page, 'e2e-2fa@babel.test')
  await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible({ timeout: 30_000 })

  // Código errado: fica na tela.
  await page.getByLabel('Código').fill('000000')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Código inválido. Tente de novo.')

  const autenticada = page.waitForResponse(
    (r) => r.url().includes('/api/') && r.status() === 200 && aalDo(r.request().headers().authorization) === 'aal2',
    { timeout: 30_000 },
  )
  await page.getByLabel('Código').fill('123456')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await autenticada
  await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeHidden()
})
