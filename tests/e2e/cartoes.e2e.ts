import { expect, type Page, test } from '@playwright/test'

import { semearCartoes, semearSessaoComCartoes } from './_fixtures'
import {
  abaDeCartoes,
  abasDePraticar,
  abrirTela,
  assentar,
  clicarRobusto,
  fecharSobreposicoes,
  naBarraDeCinco,
  telaDeCartoes,
  trilho,
} from './_helpers'

/**
 * A TELA CARTÕES (`/cartoes`, 10/10/2026): a casa da revisão, dos baralhos e do catálogo de palavras.
 *
 * O que este arquivo prende, na ordem em que a pessoa encontra:
 *  1. A PORTA. No computador e no tablet, o item "Cartões" do trilho; no celular, o "Praticar" da barra
 *     de cinco, que abre a última das duas telas de praticar (Cartões de início, guardado em
 *     `localStorage['babel.praticar']`) e tem as abas "Cartões" e "Jogos" no alto das duas.
 *  2. A ABA "HOJE" diz quantos cartões há para agora, e a rodada começa e termina na própria tela: o
 *     voltar da revisão devolve a `/cartoes`.
 *  3. TRAZER um `.apkg` pela aba "Trazer e levar": o relatório do que veio e do que não veio, ativar, e
 *     o baralho aparece na aba "Baralhos". Reimportar atualiza, sem duplicar.
 *  4. OS ENDEREÇOS DE ANTES: `/revisar` abre a rodada em `/cartoes/estudar`, e `/vocabulario` abre o
 *     catálogo em `/cartoes/palavras`.
 *  5. O PESO DA ABERTURA: a aba "Hoje" lê só `GET /api/vocab/resumo`. O baralho inteiro
 *     (`GET /api/vocab`, megabytes numa conta grande) só desce quando a pessoa abre o catálogo, a
 *     rodada ou a exportação.
 *
 * O ESTADO SEM CONTA (a tela vazia, sem o botão "Palavra") não tem como aparecer aqui: `dev:local`
 * desliga o login e todo pedido é do dono local. Quem o cobre é a edição estática
 * (`tests/e2e-estatica/edicao-estatica.e2e.ts`).
 */

let sessionId = ''

test.beforeAll(async () => {
  await semearCartoes()
  ;({ sessionId } = await semearSessaoComCartoes())
})

/** O cartão do alto da aba "Hoje". */
const convite = (page: Page) => page.getByTestId('convite-de-hoje')

/** A tela da rodada de revisão (a de sempre, agora dentro de Cartões). */
const revisao = (page: Page) => page.getByTestId('revisao-no-quest')

/**
 * O detalhe do baralho escolhido na aba "Baralhos": o painel ao lado da lista (`baralho-selecionado`)
 * no computador e no tablet; no celular o painel não cabe, e o mesmo conteúdo sobe numa folha com o
 * nome do baralho no título.
 */
async function detalheDoBaralho(page: Page, nome: string) {
  if (naBarraDeCinco(page)) {
    const folha = page.getByRole('dialog', { name: nome })
    await expect(folha).toBeVisible()
    return folha
  }
  const painel = page.getByTestId('baralho-selecionado')
  await expect(painel).toContainText(nome)
  return painel
}

const ultimaPratica = (page: Page) => page.evaluate(() => localStorage.getItem('babel.praticar'))

test.describe('Cartões: a porta', () => {
  test('o ladrilho do Início e o menu levam aos Cartões; no celular, "Praticar" e as abas do alto', async ({
    page,
  }) => {
    test.slow()
    await abrirTela(page, '/')

    /* O LADRILHO FIXO DO INÍCIO: sempre lá, logo depois de "Legendar agora", com o estado do dia no
       título ("Cartões", "Cartões: N para hoje", "Cartões: comece por 10", "Cartões: tudo em dia"). O
       ladrilho "Revisar N palavras", que só aparecia com palavra vencendo, não existe mais. */
    const ladrilho = page.getByTestId('cartoes-no-inicio')
    await expect(ladrilho).toBeVisible()
    await expect(ladrilho.locator('b')).toHaveText(/^Cartões(: .+)?$/)
    await expect(page.getByRole('main').getByRole('button', { name: /^Revisar \d+ palavra/ })).toHaveCount(0)
    await clicarRobusto(page, ladrilho)
    await expect(page).toHaveURL(/\/cartoes$/)
    await expect(telaDeCartoes(page)).toBeVisible()

    const nav = trilho(page)
    await clicarRobusto(page, nav.getByRole('button', { name: /^(Início|Página Inicial)$/ }))
    await expect(page).toHaveURL(/\/$/)
    await assentar(page)

    if (!naBarraDeCinco(page)) {
      // COMPUTADOR E TABLET: o item próprio no trilho, e nenhuma aba de praticar.
      const item = nav.getByRole('button', { name: 'Cartões', exact: true })
      await expect(item).toBeVisible()
      await clicarRobusto(page, item)
      await expect(page).toHaveURL(/\/cartoes$/)
      await expect(item).toHaveAttribute('aria-current', 'page')
      await expect(abasDePraticar(page)).toHaveCount(0)
    } else {
      /* CELULAR: o "Praticar" abre os Cartões (navegador novo, a última tela ainda é a de início) e
         fica marcado; as abas do alto levam aos Jogos e de volta, e a escolha fica guardada. */
      const praticar = nav.getByRole('button', { name: 'Praticar', exact: true })
      await expect(nav.getByRole('button', { name: 'Cartões', exact: true })).toBeHidden()
      await expect(nav.getByRole('button', { name: 'Jogar', exact: true })).toBeHidden()
      await clicarRobusto(page, praticar)
      await expect(page).toHaveURL(/\/cartoes$/)
      await expect(praticar).toHaveAttribute('aria-current', 'page')
      const abas = abasDePraticar(page)
      await expect(abas.getByRole('tab', { name: 'Cartões' })).toHaveAttribute('aria-selected', 'true')
      expect(await ultimaPratica(page)).toBe('cartoes')

      await clicarRobusto(page, abas.getByRole('tab', { name: 'Jogos' }))
      await expect(page).toHaveURL(/\/jogar/)
      // A sala da primeira visita ao Jogar abre por cima das abas: fecha antes de procurá-las.
      await expect(async () => {
        await fecharSobreposicoes(page)
        await expect(abasDePraticar(page).getByRole('tab', { name: 'Jogos' })).toHaveAttribute(
          'aria-selected',
          'true',
          { timeout: 1500 },
        )
      }).toPass({ timeout: 20_000 })
      await expect(praticar, 'o "Praticar" fica marcado também no Jogar').toHaveAttribute('aria-current', 'page')
      await expect.poll(() => ultimaPratica(page)).toBe('play')

      /* A ÚLTIMA TELA USADA: saindo para o Início, o "Praticar" volta ao Jogar, e não aos Cartões. */
      await clicarRobusto(page, nav.getByRole('button', { name: /^(Início|Página Inicial)$/ }))
      await expect(page).toHaveURL(/\/$/)
      await clicarRobusto(page, praticar)
      await expect(page).toHaveURL(/\/jogar/)

      await fecharSobreposicoes(page)
      await clicarRobusto(page, abasDePraticar(page).getByRole('tab', { name: 'Cartões' }))
      await expect(page).toHaveURL(/\/cartoes$/)
      await expect.poll(() => ultimaPratica(page)).toBe('cartoes')
    }

    // A tela, por qualquer das portas: um h1, a aba "Hoje" escolhida e as cinco abas na ordem.
    const tela = telaDeCartoes(page)
    await expect(tela).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Cartões' })).toBeVisible()
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(abaDeCartoes(page, /^Hoje/)).toHaveAttribute('aria-selected', 'true')
    const abas = page.getByRole('tablist', { name: 'Seções de Cartões' }).getByRole('tab')
    await expect(abas).toHaveCount(5)
    const rotulos = (await abas.allTextContents()).map((r) => r.replace(/[\d.\s]+$/, '').trim())
    expect(rotulos).toEqual(['Hoje', 'Baralhos', 'Palavras', 'Trazer e levar', 'Memória'])

    /* Cada aba tem o seu endereço, e "Hoje" fica no endereço curto. A Memória, antes da primeira
       revisão da conta (banco novo), mostra o estado de espera no lugar dos números. */
    const memoria = page
      .getByTestId('memoria-dos-cartoes')
      .or(tela.getByRole('heading', { name: 'Os números aparecem depois das primeiras revisões' }))
    for (const [nome, url, marca] of [
      [/^Baralhos/, /\/cartoes\/baralhos$/, tela.locator('.ct-linha-b').first()],
      [/^Palavras/, /\/cartoes\/palavras$/, page.getByTestId('vocabulario-no-quest')],
      [/^Trazer e levar/, /\/cartoes\/trazer$/, page.getByTestId('anki-escolher')],
      [/^Memória/, /\/cartoes\/memoria$/, memoria],
      [/^Hoje/, /\/cartoes$/, convite(page)],
    ] as const) {
      await clicarRobusto(page, abaDeCartoes(page, nome))
      await expect(abaDeCartoes(page, nome)).toHaveAttribute('aria-selected', 'true')
      await expect(page).toHaveURL(url)
      await expect(marca, `a aba ${nome} deveria mostrar o conteúdo dela`).toBeVisible({ timeout: 15_000 })
    }
  })
})

test.describe('Cartões: hoje e a rodada', () => {
  test('a aba Hoje diz quantos há, a rodada avalia um cartão e o voltar devolve a /cartoes', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/cartoes')
    const tela = telaDeCartoes(page)
    /* Com os cartões da fixture há o que estudar: "primeiro" num banco que nunca revisou, "normal" ou
       "pilha" depois da primeira nota (outra suíte, ou o outro viewport, já pode ter avaliado). */
    await expect(tela, 'com cartões semeados, a aba Hoje deveria ter o que estudar').toHaveAttribute(
      'data-ct-hoje',
      /^(primeiro|pilha|normal)$/,
      { timeout: 20_000 },
    )
    const estado = await tela.getAttribute('data-ct-hoje')
    test.info().annotations.push({ type: 'estado de hoje', description: String(estado) })

    /* O NÚMERO GRANDE conta de zero até o valor na entrada (movimento): espera-se o valor final. */
    const contagem = convite(page).locator('.qv-contagem')
    await expect
      .poll(async () => Number(((await contagem.textContent()) ?? '').replace(/\D/g, '')), {
        timeout: 10_000,
        message: 'o convite de hoje deveria mostrar um número maior que zero',
      })
      .toBeGreaterThan(0)

    const estudar = convite(page).getByRole('button', { name: /^(Estudar( \d+)? agora|Começar( por 10)?)$/ })
    await expect(estudar).toBeVisible()
    await clicarRobusto(page, estudar)
    await expect(page).toHaveURL(/\/cartoes\/estudar$/)

    const rodada = revisao(page)
    await expect(rodada).toHaveAttribute('data-estado', /^(rodada|fora)$/, { timeout: 20_000 })
    if ((await rodada.getAttribute('data-estado')) === 'fora') {
      await clicarRobusto(page, rodada.locator('.q-vazio .q-ctl.pri'))
    }
    await expect(rodada).toHaveAttribute('data-estado', 'rodada', { timeout: 10_000 })
    const conta = rodada.locator('.qr-conta')
    await expect(conta).toHaveText(/^1 \/ \d+$/)
    const naFila = Number(((await conta.textContent()) ?? '').match(/\/ (\d+)/)?.[1] ?? 0)

    /* O formato padrão é "Lembrar" (mostrar a resposta e dar a nota). Outro formato só aparece se
       alguém o gravou neste navegador, e um contexto novo não tem nada gravado. */
    const cartao = rodada.getByRole('region', { name: 'Cartão' })
    await clicarRobusto(page, cartao.getByRole('button', { name: /Mostrar resposta/i }))
    await clicarRobusto(
      page,
      cartao.getByRole('group', { name: 'Quão fácil foi lembrar' }).getByRole('button', { name: /^Bom/ }),
    )
    if (naFila > 1) await expect(conta).toHaveText(/^2 \/ \d+$/, { timeout: 10_000 })
    else await expect(rodada).toHaveAttribute('data-estado', 'fim', { timeout: 10_000 })

    /* O VOLTAR DA REVISÃO leva aos Cartões (antes levava ao Vocabulário). */
    await clicarRobusto(page, rodada.getByRole('button', { name: 'Voltar aos Cartões' }))
    await expect(page).toHaveURL(/\/cartoes$/)
    await expect(telaDeCartoes(page)).toBeVisible()
    await expect(abaDeCartoes(page, /^Hoje/)).toHaveAttribute('aria-selected', 'true')
    // Houve uma revisão: a tela não está mais no estado de quem nunca estudou.
    await expect(telaDeCartoes(page)).toHaveAttribute('data-ct-hoje', /^(pilha|normal|feito)$/, { timeout: 15_000 })
  })
})

test.describe('Cartões: trazer do Anki', () => {
  test('o .apkg entra pela aba Trazer e levar, o relatório diz o que veio, e o baralho aparece em Baralhos', async ({
    page,
  }) => {
    test.slow()
    const baralhos = async () => {
      const r = await page.request.get('/api/anki/decks')
      expect(r.ok(), 'GET /api/anki/decks').toBe(true)
      return (await r.json()) as Array<{ id: string; nome: string; total: number; ativas: number }>
    }
    /* Outras suítes (`baralhos`, `facetas`) trazem o MESMO arquivo pela fixture: o baralho pode já
       existir, e então este teste prova a reimportação (atualiza, sem duplicar). */
    const antes = await baralhos()

    await abrirTela(page, '/cartoes')
    await clicarRobusto(page, abaDeCartoes(page, /^Trazer e levar/))
    await expect(page).toHaveURL(/\/cartoes\/trazer$/)
    await expect(page.getByTestId('anki-escolher')).toBeVisible()

    // LEVAR: os quatro formatos, à vista na mesma aba.
    const levar = page.getByTestId('levar')
    for (const formato of [/^Anki \(\.apkg\)/, /^Planilha \(CSV\)/, /^Texto para o Quizlet/, /^Relatório/])
      await expect(levar.getByRole('button', { name: formato })).toBeVisible()

    await page.getByTestId('anki-arquivo').setInputFiles('tests/fixtures/baralho-moderno.apkg')

    /* O RELATÓRIO: o que veio e o que não veio, com o nome do arquivo no alto. */
    const lido = page.getByTestId('anki-lido')
    await expect(lido, 'o relatório do arquivo deveria aparecer').toBeVisible({ timeout: 60_000 })
    await expect(lido.getByText('baralho-moderno.apkg')).toBeVisible()
    await expect(lido.getByText('O que veio', { exact: true })).toBeVisible()
    await expect(lido.getByText('O que não veio', { exact: true })).toBeVisible()
    await expect(lido.getByText(/\d+ notas?, todos os campos/)).toBeVisible()
    await expect(lido.getByText('A agenda do Anki')).toBeVisible()

    /* ATIVAR, quando há o que ativar; senão "Deixar para depois". As duas saídas chegam ao mesmo fim. */
    const ativar = lido.getByRole('button', { name: /^Ativar \d+$/ })
    const ramo = (await ativar.isVisible().catch(() => false)) ? 'ativar' : 'deixar para depois'
    test.info().annotations.push({ type: 'ramo', description: ramo })
    await clicarRobusto(page, ramo === 'ativar' ? ativar : lido.getByRole('button', { name: 'Deixar para depois' }))

    const trazido = page.getByTestId('anki-trazido')
    await expect(trazido).toBeVisible({ timeout: 30_000 })
    await expect(trazido.getByRole('heading', { level: 2 })).toHaveText(/\d+ notas trazidas, \d+ ativadas/)

    const depois = await baralhos()
    expect(depois.length, 'o servidor deveria ter o baralho trazido').toBeGreaterThan(0)
    if (antes.length > 0)
      expect(
        depois.map((b) => b.nome).sort(),
        'reimportar o mesmo arquivo atualiza o baralho, sem criar outro',
      ).toEqual(antes.map((b) => b.nome).sort())
    if (ramo === 'ativar')
      expect(
        depois.some((b) => b.ativas > 0),
        'depois de ativar, o baralho tem notas ativadas',
      ).toBe(true)

    await clicarRobusto(page, trazido.getByRole('button', { name: 'Ver nos baralhos' }))
    await expect(page).toHaveURL(/\/cartoes\/baralhos$/)
    await expect(abaDeCartoes(page, /^Baralhos/)).toHaveAttribute('aria-selected', 'true')

    /* O BARALHO NA LISTA, com o nome que o servidor guarda; escolhido, o detalhe diz o que dá para fazer. */
    const nome = depois[0].nome
    const linha = telaDeCartoes(page).locator('.ct-linha-b', { hasText: nome }).first()
    await expect(linha, `o baralho "${nome}" deveria estar na aba Baralhos`).toBeVisible({ timeout: 15_000 })
    await clicarRobusto(page, linha)
    const detalhe = await detalheDoBaralho(page, nome)
    // Baralho do Anki: joga-se com ele e gerencia-se ("Revisar este" é das sessões, dos idiomas e de "Tudo").
    await expect(detalhe.getByRole('button', { name: 'Jogar com este' })).toBeVisible()
    const gerenciar = detalhe.getByRole('button', { name: 'Gerenciar' })
    await expect(gerenciar).toBeVisible()

    /* "GERENCIAR" abre a tela de baralhos do Anki que já existia, e o voltar dela devolve aos Cartões. */
    await clicarRobusto(page, gerenciar)
    await expect(page.getByRole('heading', { level: 1, name: 'Baralhos do Anki' })).toBeVisible({ timeout: 15_000 })
    await expect(
      page
        .getByRole('tabpanel', { name: /^Gerenciar/ })
        .getByText(/[\d.]+\s+de\s+[\d.]+\s+notas ativadas/)
        .first(),
    ).toBeVisible()
    await clicarRobusto(page, page.getByRole('main').getByRole('button', { name: 'Cartões', exact: true }))
    await expect(telaDeCartoes(page)).toBeVisible()
    await expect(page).toHaveURL(/\/cartoes\/baralhos$/)
  })

  test('a aba Baralhos: o baralho de uma sessão tem "Revisar este", que abre a rodada dela', async ({ page }) => {
    test.slow()
    await abrirTela(page, '/cartoes/baralhos')
    await expect(abaDeCartoes(page, /^Baralhos/)).toHaveAttribute('aria-selected', 'true')
    const tela = telaDeCartoes(page)
    // A sessão da fixture é um baralho (cada gravação vira um, com a frase de cada palavra).
    const daSessao = tela.locator('.ct-linha-b', { hasText: 'Sessao e2e de revisao' }).first()
    await expect(daSessao).toBeVisible({ timeout: 15_000 })
    await clicarRobusto(page, daSessao)
    const detalhe = await detalheDoBaralho(page, 'Sessao e2e de revisao')
    await expect(detalhe.getByRole('button', { name: 'Abrir a sessão' })).toBeVisible()
    const revisar = detalhe.getByRole('button', { name: /^(Revisar este · [\d.]+|Nada vence aqui hoje)$/ })
    await expect(revisar).toBeVisible()
    if (await revisar.isEnabled()) {
      // Com cartão vencendo, a rodada abre recortada pela sessão: o id dela vai no endereço.
      await clicarRobusto(page, revisar)
      await expect(page).toHaveURL(new RegExp(`/cartoes/estudar/${sessionId}$`))
      await expect(revisao(page)).toBeVisible({ timeout: 20_000 })
      test.info().annotations.push({ type: 'ramo', description: 'a sessão tinha cartão vencendo: a rodada abriu' })
    } else {
      test.info().annotations.push({ type: 'ramo', description: 'nada vencia na sessão: o botão diz isso, desligado' })
    }
  })
})

test.describe('Cartões: os endereços de antes', () => {
  test('/revisar abre a rodada em /cartoes/estudar, e /vocabulario abre o catálogo em /cartoes/palavras', async ({
    page,
  }) => {
    test.slow()
    await abrirTela(page, '/revisar')
    await expect(page).toHaveURL(/\/cartoes\/estudar$/)
    await expect(revisao(page)).toHaveAttribute('data-estado', /^(rodada|fora|fim)$/, { timeout: 20_000 })
    await expect(revisao(page).getByRole('button', { name: 'Voltar aos Cartões' })).toBeVisible()

    // Com a sessão no endereço, o recorte da rodada sobrevive à troca.
    expect(sessionId).not.toBe('')
    await abrirTela(page, `/revisar/${sessionId}`)
    await expect(page).toHaveURL(new RegExp(`/cartoes/estudar/${sessionId}$`))
    await expect(revisao(page)).toBeVisible({ timeout: 20_000 })

    await abrirTela(page, '/vocabulario')
    await expect(page).toHaveURL(/\/cartoes\/palavras$/)
    await expect(telaDeCartoes(page)).toBeVisible()
    await expect(abaDeCartoes(page, /^Palavras/)).toHaveAttribute('aria-selected', 'true')
    const catalogo = page.getByTestId('vocabulario-no-quest')
    await expect(catalogo).toBeVisible({ timeout: 15_000 })
    await expect(
      catalogo.getByText(/^[\d.]+ de [\d.]+ no caderno$/),
      'o catálogo deveria listar as palavras',
    ).toBeVisible({ timeout: 15_000 })
    /* O cabeçalho próprio do Vocabulário saiu: "Trazer do Anki" e "Exportar" moram na aba "Trazer e
       levar", e o "+ Palavra" é o do cabeçalho da tela Cartões, que abre o mesmo diálogo. */
    await expect(catalogo.getByRole('button', { name: 'Trazer do Anki' })).toHaveCount(0)
    await expect(telaDeCartoes(page).locator('header.q-cab').getByRole('button', { name: 'Palavra' })).toBeVisible()
  })
})

test.describe('Cartões: o peso da abertura', () => {
  test('abrir /cartoes direto lê o resumo, e não o baralho inteiro', async ({ page }) => {
    test.slow()
    const pedidos: Array<{ metodo: string; caminho: string; status: number; bytes: number; naRede: string }> = []
    const lendo: Promise<void>[] = []
    page.on('response', (resposta) => {
      const url = new URL(resposta.url())
      if (!url.pathname.startsWith('/api/')) return
      lendo.push(
        (async () => {
          const corpo = await resposta.body().catch(() => null)
          pedidos.push({
            metodo: resposta.request().method(),
            caminho: url.pathname + url.search,
            status: resposta.status(),
            bytes: corpo ? corpo.byteLength : -1,
            naRede: resposta.headers()['content-length'] ?? '(sem content-length)',
          })
        })(),
      )
    })
    const sairam: string[] = []
    page.on('request', (pedido) => {
      const url = new URL(pedido.url())
      if (url.pathname.startsWith('/api/')) sairam.push(`${pedido.method()} ${url.pathname}`)
    })

    await page.goto('/cartoes')
    await expect(telaDeCartoes(page)).toBeVisible({ timeout: 20_000 })
    await expect(convite(page)).toBeVisible({ timeout: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await Promise.all(lendo)

    /* O NÚMERO QUE INTERESSA: o que a abertura pediu ao servidor, e quanto veio em cada resposta
       (o corpo já descomprimido; `naRede` é o `content-length` quando o servidor o manda). */
    const total = pedidos.reduce((s, p) => s + Math.max(0, p.bytes), 0)
    const tabela = pedidos.map((p) => `${p.metodo} ${p.caminho} → ${p.status} · ${p.bytes} B · na rede ${p.naRede}`)
    test.info().annotations.push({
      type: 'pedidos /api ao abrir /cartoes',
      description: `${pedidos.length} pedidos, ${total} B no total\n${tabela.join('\n')}`,
    })
    console.log(
      `[cartoes][${test.info().project.name}] /api ao abrir /cartoes: ${pedidos.length} pedidos, ${total} B\n  ${tabela.join('\n  ')}`,
    )

    const doVocab = sairam.filter((p) => / \/api\/vocab(\/|$)/.test(p))
    expect(doVocab, 'a aba Hoje deveria ler o resumo dos cartões').toContain('GET /api/vocab/resumo')
    expect(
      doVocab.filter((p) => p === 'GET /api/vocab'),
      'a aba Hoje NÃO deveria baixar o baralho inteiro (GET /api/vocab)',
    ).toEqual([])
    expect([...new Set(doVocab)], 'de /api/vocab*, a abertura dos Cartões deveria pedir só o resumo').toEqual([
      'GET /api/vocab/resumo',
    ])
  })
})
