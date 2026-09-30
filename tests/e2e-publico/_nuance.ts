/**
 * O QUE OS E2E DA TRADUÇÃO NUANCE (D7 da Fase D) DIVIDEM — login de verdade no Supabase falso, a conta
 * pintada como Premium e a IA SIMULADA na página.
 *
 * NENHUMA CHAMADA DE IA DE VERDADE. Todo `/api/ai/*` que o teste não simula responde 599 na própria
 * página e fica registrado (`semIaDeVerdade`), e o teste confere no fim que nenhum POST de IA escapou.
 * O servidor do app é o de verdade (sessões, falas, ajustes), só a IA não sai.
 *
 * A CONTA PREMIUM É SÓ PINTURA. O cliente pinta a Tradução Nuance pelo `GET /api/me/entitlements`
 * (`src/lib/entitlements.ts`); a resposta simulada diz Premium, e as rotas da Nuance — que no servidor
 * recusariam o Grátis com 402 — também são simuladas. A idade simulada é a de um adulto que declarou
 * (sem ela a conta nova é o perfil protegido: sem convite e sem o "Rápido").
 */
import { expect, type Locator, type Page } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from '../e2e/_helpers'

const SENHA = 'senha-e2e-123'

export const ENTITLEMENTS_PREMIUM = {
  plan: 'premium',
  youtubeImport: false,
  managedCloudStt: true,
  managedCloudLlm: true,
  largerModels: true,
  traducaoNuance: true,
  vozNatural: true,
  armazenamento: { usados: 0, teto: 5_000 * 1024 * 1024 },
  teste: null,
}

const IDADE_ADULTA = {
  nascimentoInformado: true,
  faixa: 'adulto',
  protegido: false,
  exigeResponsavel: false,
  exigeConsentimentoEspecifico: false,
  vinculo: { estado: 'nenhum' },
  restrita: false,
}

/**
 * Todo `/api/ai/*` sem simulação responde 599 e é registrado. Registrado ANTES das simulações do
 * teste: no Playwright a rota registrada por último é a que atende primeiro.
 */
export async function semIaDeVerdade(page: Page): Promise<string[]> {
  const escapadas: string[] = []
  await page.route('**/api/ai/**', (route) => {
    escapadas.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 599, json: { error: 'IA não simulada no e2e' } })
  })
  return escapadas
}

/** Os POST de IA que escaparam da simulação (GET de disponibilidade não custa nada). */
export const postsDeIa = (escapadas: string[]) => escapadas.filter((e) => e.startsWith('POST '))

/**
 * Entra com a conta `e2e@babel.test` pela porta de login de verdade e devolve o `Authorization` que o
 * navegador mandou (para o teste semear dados pela API). Com `premium`, a conta é pintada como
 * Premium; em qualquer caso, como adulta.
 */
export async function entrar(page: Page, { premium }: { premium: boolean }): Promise<string> {
  if (premium) await page.route('**/api/me/entitlements', (r) => r.fulfill({ json: ENTITLEMENTS_PREMIUM }))
  await page.route('**/api/me/idade', (r) =>
    r.request().method() === 'GET' ? r.fulfill({ json: IDADE_ADULTA }) : r.continue(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Sua conta' }).click({ timeout: 60_000 })
  await page.getByRole('menuitem', { name: 'Entrar ou criar conta' }).click()
  await page.getByLabel('E-mail').fill('e2e@babel.test')
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  const autenticada = page.waitForResponse(
    (r) => r.url().includes('/api/') && /^Bearer /.test(r.request().headers().authorization ?? ''),
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  const authorization = (await autenticada).request().headers().authorization as string
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeHidden()
  return authorization
}

/** Autoriza a IA de nuvem pela tela, se a conta (o banco do e2e é reaproveitado) ainda não autorizou. */
export async function autorizarNuvemSePedir(page: Page, onde = page.locator('body')) {
  const autorizar = onde.getByRole('button', { name: /Autorizar IA de nuvem/ })
  if (await autorizar.isVisible().catch(() => false)) {
    await clicarRobusto(page, autorizar)
    await expect(autorizar).toBeHidden({ timeout: 10_000 })
  }
}

/**
 * Espera a tela `alvo` aparecer e ficar LIVRE: numa conta nova (o banco do e2e pode ser novo) a
 * apresentação da primeira visita abre por cima de qualquer tela, e as conquistas ("Primeira captura")
 * entram animadas a qualquer momento. `alvo` visível não basta — ele fica no DOM debaixo do diálogo —,
 * então a tela só conta como livre depois de duas conferências seguidas sem nada por cima.
 */
export async function chegarEm(page: Page, alvo: Locator) {
  /* "Pular apresentação" leva ao último passo ("Como você quer rodar a IA?"), que fecha em "Começar"
     com o padrão (rodar local). */
  const pular = page.getByRole('button', { name: 'Pular apresentação' })
  const comecar = page.getByRole('dialog', { name: 'Como você quer rodar a IA?' }).getByRole('button', {
    name: 'Começar',
  })
  const resgatar = page.locator('dialog[open]:has(.recompensa)').getByRole('button', { name: 'Resgatar e continuar' })
  const bloqueios = [resgatar, pular, comecar]
  await expect(pular.or(comecar).or(resgatar).or(alvo).first()).toBeVisible({ timeout: 60_000 })
  let livres = 0
  for (let i = 0; i < 40 && livres < 2; i++) {
    let bloqueou = false
    for (const b of bloqueios) {
      if (await b.isVisible().catch(() => false)) {
        bloqueou = true
        await b.click({ timeout: 3_000 }).catch(() => {})
        break
      }
    }
    livres = bloqueou ? 0 : livres + 1
    await page.waitForTimeout(bloqueou ? 300 : 700)
  }
  await fecharSobreposicoes(page)
  await expect(alvo).toBeVisible({ timeout: 30_000 })
}

/**
 * Clica mesmo com uma conquista entrando por cima (a fila de "Subiu de nível" chega animada a qualquer
 * momento numa conta que acumula XP entre execuções): fecha a sobreposição e tenta de novo.
 */
export const clicar = clicarRobusto

export { fecharSobreposicoes }
