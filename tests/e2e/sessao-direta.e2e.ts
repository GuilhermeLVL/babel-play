import { expect, test } from '@playwright/test'

/**
 * ABRIR `/sessao/<id>` DIRETO NUMA ABA NOVA. Com a lista de gravações ainda a caminho (no modo com
 * login ela chega depois), a Análise montava sem gravação e a tela caía em "Esta tela não conseguiu
 * abrir". Aqui a lista é atrasada de propósito: a tela espera por ela e abre a sessão pedida. E um id
 * que não existe diz isso, em vez de abrir outra sessão.
 */
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop-1280', 'uma vez, no projeto de desktop')
})

test('aberta direto com a lista atrasada, a sessão abre; id inexistente avisa', async ({ page, request }) => {
  const criada = await request.post('/api/sessions', {
    data: {
      title: 'Sessão aberta direto',
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt-BR',
      status: 'done',
      durationMs: 4000,
      utterances: [
        {
          idx: 0,
          source: 'system',
          sourceLang: 'en',
          sourceText: 'hello there my friend',
          targetLang: 'pt-BR',
          translatedText: 'olá meu amigo',
          tStartMs: 0,
          tEndMs: 2000,
        },
      ],
    },
  })
  expect(criada.ok()).toBe(true)
  const { id } = (await criada.json()) as { id: string }
  try {
    await page.route(/\/api\/sessions(\?.*)?$/, async (r) => {
      if (r.request().method() === 'GET') await new Promise((x) => setTimeout(x, 3000))
      await r.continue()
    })
    await page.goto(`/sessao/${id}`)
    await expect(page.getByText('Esta tela não conseguiu abrir')).toHaveCount(0)
    await expect(page.getByRole('main').getByText('Sessão aberta direto').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Esta tela não conseguiu abrir')).toHaveCount(0)

    await page.unrouteAll()
    await page.goto('/sessao/00000000-0000-0000-0000-000000000000')
    await expect(page.getByText('Não encontramos esta sessão')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Ir para a Biblioteca' }).click()
    await expect(page).toHaveURL(/\/biblioteca/)
  } finally {
    await request.delete(`/api/sessions/${id}`)
  }
})
