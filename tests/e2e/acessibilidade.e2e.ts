import { expect, type Locator, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { semearCartoes, semearSessaoComCartoes } from './_fixtures'
import { assentar, clicarRobusto, fecharSobreposicoes, irParaPraticar } from './_helpers'

/**
 * AS TELAS DO LANÇAMENTO SEM VIOLAÇÃO GRAVE DE ACESSIBILIDADE (WCAG 2.2 AA, impacto sério ou crítico,
 * pelo axe — a mesma varredura de Início e Ajustes em `fundacao.e2e.ts`, ver `_acessibilidade.ts`).
 *
 * No computador (1280) e no celular (375): o tablet tem as mesmas telas do computador e não paga a
 * varredura de novo. As rotas são as de `src/lib/rotas.ts` (`SEGMENTO`); as páginas legais são os
 * arquivos de `public/`, que o Vite serve na raiz e que `DialogoLegal.tsx` abre.
 *
 * A tela é varrida PARADA: aberta pelo endereço, com as recompensas da chegada fechadas e as
 * animações de entrada terminadas. Nenhum modelo de fala ou de tradução é baixado (Capturar e
 * Intérprete só precisam estar prontos para começar).
 *
 * A porta de login e cadastro não monta nesta suíte (`dev:local` força `VITE_AUTH_REQUIRED=0`, ver
 * `login.e2e.ts`): ela é varrida no modo público, em `tests/e2e-publico/acessibilidade-porta.e2e.ts`.
 *
 * Tela que hoje viola fica como `test.fixme` com a violação escrita ao lado; o relatório com a
 * sugestão de correção está em `docs/auditoria/2026-10-15-acessibilidade.md`. Corrigida a tela, o
 * `fixme` sai e o teste passa a barrar a regressão.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'a varredura roda no computador e no celular')
  await page.route(/huggingface\.co|\.hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route(/\/modelos\/bergamot\/|bergamot-translator-worker/, (r) => r.abort())
})

/* Cartões, Jogar e Biblioteca com conteúdo: a tela vazia é outra tela, e é a cheia que a pessoa usa. */
test.beforeAll(async () => {
  await semearCartoes()
  await semearSessaoComCartoes()
})

/** Abre o endereço e espera a tela de verdade (`alvo`), sem nada por cima. */
async function abrirParado(page: Page, caminho: string, alvo: (page: Page) => Locator) {
  await page.goto(caminho)
  await expect(alvo(page)).toBeVisible({ timeout: 30_000 })
  await assentar(page)
  await fecharSobreposicoes(page)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
}

interface Tela {
  nome: string
  caminho: string
  alvo: (page: Page) => Locator
  /** O que a tela pede antes da varredura além de abrir (uma aba, o lobby livre). */
  preparar?: (page: Page) => Promise<void>
}

const TELAS: Tela[] = [
  { nome: 'Capturar', caminho: '/capturar', alvo: (p) => p.getByTestId('iniciar-captura') },
  { nome: 'Intérprete', caminho: '/interprete', alvo: (p) => p.getByTestId('conversa-pronta') },
  { nome: 'Biblioteca', caminho: '/biblioteca', alvo: (p) => p.getByRole('main') },
  { nome: 'Cartões', caminho: '/cartoes', alvo: (p) => p.getByTestId('cartoes') },
  {
    nome: 'Jogar',
    caminho: '/jogar',
    alvo: (p) => p.getByTestId('lobby-do-quest'),
    preparar: (p) => irParaPraticar(p),
  },
  { nome: 'Planos', caminho: '/plano', alvo: (p) => p.getByTestId('planos-do-quest') },
  { nome: 'Perfil', caminho: '/perfil', alvo: (p) => p.getByTestId('perfil-do-quest') },
  {
    nome: 'Perfil, aba "Seus dados" (a conta)',
    caminho: '/perfil',
    alvo: (p) => p.getByTestId('perfil-do-quest'),
    preparar: async (p) => {
      const aba = p.getByRole('tab', { name: 'Seus dados' })
      await clicarRobusto(p, aba)
      await expect(aba).toHaveAttribute('aria-selected', 'true')
    },
  },
]

/**
 * O QUE VIOLA HOJE (medido em 15/10/2026), por tela e por projeto: só ali o teste é `fixme`, e nos
 * outros projetos a mesma tela já barra a regressão. A sugestão de correção está no relatório,
 * `docs/auditoria/2026-10-15-acessibilidade.md`. Corrigida a tela, a linha sai daqui.
 */
const VIOLAM_HOJE: Record<string, { projetos: string[]; violacao: string }> = {
  /* A contagem da aba (`.q-aba .n`, `opacity: 0.8`) sobre a pílula das abas (`--surface-sunken`). */
  /* As páginas legais saíram daqui em 25/10/2026: o roxo virou #6a48f0 no claro e #a594ff no escuro (≥ 4,5). */
}

/** Marca o caso como `fixme` só no projeto em que ele viola hoje, com a violação como motivo. */
function conhecidaHoje(nome: string, projeto: string) {
  const v = VIOLAM_HOJE[nome]
  test.fixme(!!v && v.projetos.includes(projeto), v?.violacao)
}

for (const tela of TELAS) {
  test(`${tela.nome}: sem violação grave de acessibilidade`, async ({ page }, info) => {
    conhecidaHoje(tela.nome, info.project.name)
    test.slow()
    await abrirParado(page, tela.caminho, tela.alvo)
    if (tela.preparar) await tela.preparar(page)
    expect(await violacoesGraves(page)).toEqual([])
  })
}

/* As páginas legais são HTML estático, fora do app: não há recompensa nem `<main>` do app a esperar. */
for (const [nome, caminho] of [
  ['Política de privacidade', '/privacidade.html'],
  ['Termos de uso', '/termos.html'],
] as const) {
  test(`${nome} (${caminho}): sem violação grave de acessibilidade`, async ({ page }, info) => {
    conhecidaHoje(nome, info.project.name)
    const r = await page.goto(caminho)
    expect(r?.status(), `${caminho} deveria ser servida`).toBe(200)
    await expect(page.locator('h1').first()).toBeVisible()
    expect(await violacoesGraves(page)).toEqual([])
  })
}
