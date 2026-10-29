import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { abrirPeloMenu, comecarFalando, comFlags, falsos, fase, porToque, semPreferenciasDeAvatar } from './_interprete'

/**
 * A DESCOBERTA DOS AVATARES NO INTÉRPRETE, no app de verdade (Web Speech, tradutor e voz FALSOS de `_interprete.ts`).
 * Provado: sem as flags nada muda; com `avatar_3d` o botão "Avatares" tem rótulo à vista e alvo de 44 px, e a dica da
 * primeira vez aparece uma vez (lembrada); com `avatar_sinais` o atalho "Soletrar nomes (Libras/ASL)" liga e desliga a
 * soletração sem abrir o painel (aria-pressed, teclado), com os dois avisos fixos sempre à vista; com o avatar
 * "Milk" (mãos pequenas) o atalho explica e leva a Perfil › Avatar; o Perfil sem avatar convida a criar um.
 * Nos três tamanhos (desktop-1280, tablet-768, mobile-375). Capturas: `$AVATAR_CAPTURAS`.
 */
const CAPTURAS = process.env.AVATAR_CAPTURAS || path.join(process.cwd(), 'tests', 'e2e', '__capturas__')
mkdirSync(CAPTURAS, { recursive: true })

test.use({
  launchOptions: {
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  },
  permissions: ['microphone'],
})

const AVISO_1 = 'Soletração do alfabeto manual: não é tradução para Libras'
const AVISO_2 = 'Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'

const foto = (page: Page, nome: string) =>
  page.screenshot({ path: path.join(CAPTURAS, `descoberta-${test.info().project.name}-${nome}.png`) })

const pronto = (page: Page, lado: 'meu' | 'outro') =>
  fase(page).getByTestId(`avatar-${lado}`).locator('[data-avatar-pronto="true"]')

/** Um avatar salvo da pessoa: com "bullidan" ela, o intérprete passa a ser o "milk" (mãos pequenas demais). */
const comAvatarSalvo = (page: Page, id: string) =>
  page.addInitScript((modelo) => {
    const receita = JSON.stringify({
      versao: 1,
      base: { origem: 'colecao', id: modelo },
      paleta: { pele: 'padrao', cabelo: 'padrao', olhos: 'padrao' },
      pecas: [],
      ajustes: {},
      meta: { nome: 'Eu', criadoEm: 1 },
    })
    // a conta local do `dev:local` é `local-owner`; sem conta a chave é `local`
    for (const chave of ['local-owner', 'local']) localStorage.setItem(`frasy.avatar.receita.${chave}`, receita)
  }, id)

async function entrar(page: Page, flags: Record<string, boolean>) {
  await falsos(page, { atrasoDaTraducaoMs: 30_000 })
  await porToque(page)
  await comFlags(page, flags)
  await abrirPeloMenu(page)
  await comecarFalando(page, /Falar em Português/)
}

test.beforeEach(async ({ page }) => {
  await semPreferenciasDeAvatar(page)
})

test.describe('Descoberta dos avatares no Intérprete', () => {
  test('sem nenhuma flag a faixa é a de sempre: nem botão, nem linha, nem dica', async ({ page }) => {
    await entrar(page, {})
    await expect(fase(page).getByTestId('tela-conversa')).toBeVisible()
    await expect(page.getByTestId('avatares-da-conversa')).toHaveCount(0)
    await expect(page.getByTestId('linha-dos-avatares')).toHaveCount(0)
    await expect(page.getByTestId('dica-dos-avatares')).toHaveCount(0)
    await expect(page.locator('.int-faixa[data-com-avatares]')).toHaveCount(0)
    await foto(page, '0-sem-flags')
  })

  test('avatar_3d: botão com nome à vista e alvo de 44 px; a dica aparece uma vez e some para sempre', async ({
    page,
  }) => {
    await entrar(page, { avatar_3d: true })
    const botao = page.getByTestId('avatares-da-conversa')
    await expect(botao).toBeVisible()
    await expect(botao).toContainText('Avatares') // o rótulo fica à vista também no celular
    const caixa = (await botao.boundingBox())!
    expect(caixa.height).toBeGreaterThanOrEqual(44)
    expect(caixa.width).toBeGreaterThanOrEqual(44)
    // sem avatar_sinais não há atalho de soletrar
    await expect(page.getByTestId('atalho-soletrar')).toHaveCount(0)

    const dica = page.getByTestId('dica-dos-avatares')
    await expect(dica).toBeVisible()
    await expect(dica).toHaveAttribute('role', 'status')
    await expect(dica).toContainText('Avatares')
    await foto(page, '1-dica')
    // não bloqueia: o botão de sair e a conversa seguem clicáveis (sem diálogo modal)
    await expect(page.getByTestId('painel-dos-avatares')).toHaveCount(0)
    // teclado: o botão de dispensar é alcançável e fecha a dica
    await dica.getByTestId('dica-dispensar').focus()
    await page.keyboard.press('Enter')
    await expect(dica).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.dica.interprete'))).toBe('1')
  })

  test('abrir o painel dispensa a dica; ela não volta depois de recarregar', async ({ page }) => {
    await entrar(page, { avatar_3d: true })
    await expect(page.getByTestId('dica-dos-avatares')).toBeVisible()
    await page.getByTestId('avatares-da-conversa').click()
    await expect(page.getByTestId('painel-dos-avatares')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('dica-dos-avatares')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('avatares-da-conversa')).toHaveCount(0) // volta à tela pronta
  })

  test('avatar_sinais: o atalho liga e desliga a soletração sem abrir o painel, com os dois avisos fixos', async ({
    page,
  }) => {
    test.slow()
    await entrar(page, { avatar_3d: true, avatar_sinais: true })
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    const atalho = page.getByTestId('atalho-soletrar')
    await expect(atalho).toBeVisible()
    await expect(atalho).toContainText('Soletrar nomes (Libras/ASL)')
    await expect(atalho).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 })
    expect((await atalho.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0) // desligada: nada de avisos
    await foto(page, '2-atalho-desligado')

    await atalho.focus()
    await page.keyboard.press('Enter') // teclado
    await expect(atalho).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('painel-dos-avatares')).toHaveCount(0) // sem abrir o painel
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.soletrar'))).toBe('1')
    const conversa = fase(page).getByTestId('soletracao-na-conversa')
    await expect(conversa.getByText(AVISO_1)).toBeVisible()
    await expect(conversa.getByText(AVISO_2)).toBeVisible()
    await foto(page, '3-atalho-ligado')

    await atalho.click()
    await expect(atalho).toHaveAttribute('aria-pressed', 'false')
    expect(await page.evaluate(() => localStorage.getItem('frasy.avatar.interprete.soletrar'))).toBe('0')
    await expect(page.locator('[data-aviso-fixo]')).toHaveCount(0)
    // a palavra "tradução" nunca descreve o atalho: é soletração do alfabeto manual
    await expect(atalho).not.toContainText(/intérprete de Libras/i)
  })

  test('avatar Milk (mãos pequenas): o atalho explica e leva a Perfil › Avatar', async ({ page }) => {
    test.slow()
    await comAvatarSalvo(page, 'bullidan') // o intérprete vira o milk
    await entrar(page, { avatar_3d: true, avatar_sinais: true })
    await expect(pronto(page, 'outro')).toBeVisible({ timeout: 60_000 })
    const atalho = page.getByTestId('atalho-soletrar')
    await expect(atalho).toHaveAttribute('data-indisponivel', '', { timeout: 30_000 })
    await atalho.click()
    const explica = page.getByTestId('atalho-soletrar-explica')
    await expect(explica).toBeVisible()
    await expect(explica).toContainText('pequenas demais')
    await foto(page, '4-milk-explica')
    await page.getByTestId('atalho-outro-avatar').click()
    // há uma conversa em andamento: sair do Intérprete passa pela confirmação de sempre (nada se perde sem perguntar)
    await page.getByRole('button', { name: 'Sair e descartar' }).click()
    await expect(page.getByTestId('perfil-do-quest')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('tab', { name: /Avatar/ })).toHaveAttribute('aria-selected', 'true')
    await foto(page, '5-perfil-avatar')
  })

  test('Perfil sem avatar: cartão "Crie seu avatar" (1 toque) com pular lembrado', async ({ page }) => {
    await comFlags(page, { avatar_3d: true })
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
    await page.goto('/perfil')
    const convite = page.getByTestId('convite-do-avatar')
    await expect(convite).toBeVisible({ timeout: 15_000 })
    await expect(convite).toContainText('Crie seu avatar')
    await foto(page, '6-convite')
    await page.getByTestId('convite-pular').click()
    await expect(convite).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('perfil-do-quest')).toBeVisible()
    await expect(page.getByTestId('convite-do-avatar')).toHaveCount(0)
  })

  test('Perfil: um toque no cartão abre a aba Avatar', async ({ page }) => {
    await comFlags(page, { avatar_3d: true })
    await page.goto('/perfil')
    await page.getByTestId('convite-criar-avatar').click()
    await expect(page.getByRole('tab', { name: /Avatar/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('convite-do-avatar')).toHaveCount(0)
  })
})
