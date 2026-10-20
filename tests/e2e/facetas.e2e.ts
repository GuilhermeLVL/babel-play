import { expect, test } from '@playwright/test'

import { semearBaralhoAnki, semearCartoes } from './_fixtures'
import {
  abrirOrganizar,
  chipDaFonte,
  clicarRobusto,
  devolverTudo,
  fecharSobreposicoes,
  irParaPraticar,
  lobby,
  voltarParaTudo,
} from './_helpers'

/**
 * AS FACETAS DO ACERVO no Jogar: o RECORTE ("Pedindo revisão", "Nunca vistas", "Com tradução"…), a
 * linha "N no recorte" e a PERSISTÊNCIA do recorte por baralho
 * (`localStorage['babel.filtro_da_pratica']`) através de F5 — antes o baralho escolhido evaporava num
 * reload.
 *
 * COM A FICHA DE CONTEÚDO (10/10/2026) a gaveta das facetas saiu: o conteúdo (tudo, difíceis, uma sessão,
 * um baralho, a trilha) é escolhido na ficha do cabeçalho, e o RECORTE DAS PALAVRAS ("Só estas palavras":
 * pedindo revisão, nunca vistas, com tradução, com frase) mora em "Buscar e organizar › Buscar e filtrar".
 * Continua sendo um grupo de pílulas (`aria-pressed`), a opção
 * sem material fica desligada com o MOTIVO ESCRITO abaixo do grupo (não há hover no toque), e o pé do
 * painel diz "N no recorte". O chip da fonte nomeia o baralho escolhido.
 *
 * O baralho e as palavras vêm das fixtures. Estado limpo ao final de cada teste: um `afterEach` zera
 * `babel.filtro_da_pratica`.
 */

const CHAVE_FILTRO = 'babel.filtro_da_pratica'

test.beforeAll(async () => {
  await semearCartoes()
  await semearBaralhoAnki()
})

test.afterEach(async ({ page }) => {
  /* O conteúdo escolhido é da CONTA (atravessa suítes): quem escolheu um baralho devolve "Tudo". */
  await devolverTudo(page)
  await page.evaluate((chave) => localStorage.removeItem(chave), CHAVE_FILTRO).catch(() => {})
  await page.reload().catch(() => {})
})

type Filtro = { recorte?: Record<string, boolean>; midia?: Record<string, boolean> } | null

test.describe('Facetas do acervo: o recorte', () => {
  test('o recorte das palavras mora em "Buscar e organizar", a pílula alterna aria-pressed e o filtro guardado acompanha', async ({
    page,
  }) => {
    test.slow()
    await irParaPraticar(page)

    const painel = await abrirOrganizar(page, 'Buscar e filtrar')
    const grupoRecorte = painel.getByRole('group', { name: 'Só estas palavras' })
    await expect(grupoRecorte, 'o recorte das palavras deveria aparecer em "Buscar e filtrar"').toBeVisible({
      timeout: 10_000,
    })

    const pedindo = grupoRecorte.getByRole('button', { name: /^Pedindo revisão/ })
    await expect(pedindo).toBeVisible()

    /* A pílula pode nascer desligada (sem material: nada venceu). Nesse caso o MOTIVO tem de estar
       escrito, e o alternar é exercitado na "Com tradução", que as palavras da fixture sempre têm. */
    const bloqueada = await pedindo.isDisabled()
    if (bloqueada) await expect(painel.getByText(/Pedindo revisão:\s*nada vencido neste acervo agora/)).toBeVisible()
    const pilula = bloqueada ? grupoRecorte.getByRole('button', { name: /^Com tradução/ }) : pedindo
    const lerDoFiltro = (f: Filtro) => (bloqueada ? f?.midia?.comTraducao : f?.recorte?.pedindoRevisao)
    test.info().annotations.push({ type: 'pílula', description: bloqueada ? 'Com tradução' : 'Pedindo revisão' })
    await expect(pilula).toBeEnabled()

    const lerFiltro = () =>
      page.evaluate((chave) => {
        const cru = localStorage.getItem(chave)
        return cru ? (JSON.parse(cru) as Filtro) : null
      }, CHAVE_FILTRO)

    const pressionadaAntes = (await pilula.getAttribute('aria-pressed')) === 'true'

    // Liga (ou desliga, se já estava ligada) e confere o aria-pressed e o localStorage.
    await clicarRobusto(page, pilula)
    await expect(pilula).toHaveAttribute('aria-pressed', String(!pressionadaAntes))
    await expect
      .poll(async () => !!lerDoFiltro(await lerFiltro()), { message: 'o recorte ligado deveria estar em localStorage' })
      .toBe(!pressionadaAntes)
    /* Ligado, o chip "Buscar e organizar" conta o filtro e a tela oferece limpar. */
    if (!pressionadaAntes) await expect(lobby(page).locator('.ex-organizar .qj-n')).toHaveText('1')

    // Desliga de volta e confere que o localStorage acompanha.
    await clicarRobusto(page, pilula)
    await expect(pilula).toHaveAttribute('aria-pressed', String(pressionadaAntes))
    await expect
      .poll(async () => !!lerDoFiltro(await lerFiltro()), { message: 'o recorte desligado deveria acompanhar' })
      .toBe(pressionadaAntes)
  })

  test('o baralho escolhido como conteúdo persiste através de F5, e o "x" da ficha volta para Tudo', async ({
    page,
  }) => {
    test.slow()
    await irParaPraticar(page)

    const opcoes = await abrirOrganizar(page, 'Opções')
    await clicarRobusto(page, opcoes.getByRole('button', { name: /Gerenciar baralhos/ }))
    const lista = page.getByRole('tabpanel', { name: /^Gerenciar/ })
    await expect(lista.getByText(/[\d.]+\s+de\s+[\d.]+\s+notas ativadas/).first()).toBeVisible()

    const jogarSoComEste = lista.getByRole('button', { name: 'Jogar só com este' }).first()
    await expect(jogarSoComEste).toBeVisible()
    const nomeBaralho = ((await lista.getByRole('heading', { level: 3 }).first().textContent()) ?? '').trim()
    expect(nomeBaralho, 'o cartão do baralho deveria dizer o nome dele').not.toBe('')

    await clicarRobusto(page, jogarSoComEste)
    await expect(lobby(page)).toBeVisible()

    /* O recorte é anunciado por escrito antes de a rodada começar: o chip da fonte nomeia o baralho. */
    await expect(chipDaFonte(page), 'a ficha de conteúdo deveria nomear o baralho escolhido').toContainText(nomeBaralho)
    const filtroAntesDoReload = await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_FILTRO)
    expect(filtroAntesDoReload, 'o recorte por baralho deveria estar gravado antes do F5').not.toBeNull()

    // A CAPACIDADE: um F5 mantém o baralho na fonte — antes evaporava.
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)
    await expect(chipDaFonte(page), 'o baralho escolhido deveria sobreviver ao F5 (persistência)').toContainText(
      nomeBaralho,
      { timeout: 10_000 },
    )

    /* TIRAR O BARALHO: o "x" da ficha volta para "Tudo" em um toque. */
    await clicarRobusto(page, voltarParaTudo(page))

    await expect(chipDaFonte(page), 'depois de limpar, a fonte não deveria mais nomear o baralho').not.toContainText(
      nomeBaralho,
    )
  })
})
