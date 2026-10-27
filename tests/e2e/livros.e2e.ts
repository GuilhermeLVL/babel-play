import { expect, type Page, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { abrirTela, clicarRobusto, fecharSobreposicoes, trilho } from './_helpers'

/**
 * LIVROS (L1 de `docs/specs/2026-10-26-livros-e-leitura.md`): navegar, filtrar, abrir o detalhe, começar a
 * ler direto da fonte (no leitor da L2), "Trazer o seu", "Por que este livro não está?" e o perfil de menor sem os títulos
 * de 18 anos (nem na vitrine, nem na busca, nem por link direto).
 *
 * O CATÁLOGO E AS FONTES SÃO FIXOS AQUI: o JSON de `/catalogo/livros.json`, o EPUB do Standard Ebooks e a
 * API da Wikisource são respondidos pelo próprio teste (`page.route`). O teste não depende da rede de
 * terceiros, e ainda assim confere que o navegador pediu o texto À FONTE, e não ao servidor do Frasy
 * (critério 6).
 */

const EPUB_DO_SE = 'https://standardebooks.org/ebooks/teste/pequena-viagem/downloads/teste_pequena-viagem.epub'

const livro = (o: Record<string, unknown>) => ({
  tradutores: [],
  categorias: [],
  nivelDetalhe: { cobertura: 'A2', legibilidade: 'A2', amostras: 3 },
  palavras: 15_000,
  minutosEstimados: 83,
  popularidade: 0.5,
  downloads: 10,
  credito: 'Crédito de teste.',
  licenca: 'Domínio público no Brasil (Lei 9.610, art. 41): teste.',
  ...o,
})

const CATALOGO = {
  versao: 1,
  ano: 2026,
  anoLimite: 1955,
  geradoEm: '2026-10-26T12:00:00.000Z',
  livros: [
    livro({
      id: 'se-teste-pequena-viagem',
      titulo: 'A Pequena Viagem',
      autores: [{ nome: 'Autora Antiga', anoMorte: 1900, idiomas: ['en'] }],
      idioma: 'en',
      fonte: 'standard-ebooks',
      fonteId: 'teste/pequena-viagem',
      formatos: { epub: EPUB_DO_SE, pagina: 'https://standardebooks.org/ebooks/teste/pequena-viagem' },
      categorias: ['aventura', 'simples'],
      classificacao: 'livre',
      nivel: 'A2',
      popularidade: 1,
      credito: 'Edição do Standard Ebooks (CC0), produzida por voluntários a partir de texto em domínio público.',
      licenca: 'Domínio público no Brasil (Lei 9.610, art. 41): Autora Antiga †1900.',
    }),
    livro({
      id: 'ws-pt-contos-da-serra',
      titulo: 'Contos da Serra',
      autores: [{ nome: 'Machado de Assis', anoMorte: 1908, idiomas: ['pt'] }],
      idioma: 'pt',
      fonte: 'wikisource',
      fonteId: 'Contos da Serra',
      formatos: { wikisource: { api: 'https://pt.wikisource.org/w/api.php', pagina: 'Contos da Serra' } },
      categorias: ['contos', 'enem'],
      classificacao: '12',
      nivel: 'B1',
    }),
    livro({
      id: 'pg-9999',
      titulo: 'Noite Proibida',
      autores: [{ nome: 'Autor Adulto', anoMorte: 1920, idiomas: ['en'] }],
      idioma: 'en',
      fonte: 'gutenberg-curado',
      fonteId: '9999',
      formatos: { r2: 'livros/pg-9999.epub' },
      categorias: ['misterio'],
      classificacao: '18',
      nivel: 'B2',
      palavras: 90_000,
    }),
    livro({
      id: 'pg-9998',
      titulo: 'Romance Sem Revisão',
      autores: [{ nome: 'Autor Qualquer', anoMorte: 1890, idiomas: ['en'] }],
      idioma: 'en',
      fonte: 'gutenberg-curado',
      fonteId: '9998',
      formatos: { r2: 'livros/pg-9998.epub' },
      classificacao: null,
      nivel: 'B1',
    }),
    /* Um JSON adulterado: autor morto em 1990. A defesa dupla do cliente nunca o mostra, para ninguém. */
    livro({
      id: 'pg-9997',
      titulo: 'Obra Protegida',
      autores: [{ nome: 'Autor Recente', anoMorte: 1990, idiomas: ['en'] }],
      idioma: 'en',
      fonte: 'gutenberg-curado',
      fonteId: '9997',
      formatos: { r2: 'livros/pg-9997.epub' },
      classificacao: 'livre',
      nivel: 'A1',
    }),
  ],
  exclusoes: [
    {
      titulo: 'Grande Sertão: Veredas',
      autores: ['João Guimarães Rosa'],
      idioma: 'pt',
      fonte: 'Wikisource',
      motivo: 'autor-protegido',
      detalhe: 'João Guimarães Rosa morreu em 1967; a obra fica livre no Brasil em 2038',
    },
  ],
}

/** Um EPUB 3 mínimo, montado aqui. */
function epub(titulo: string, frase: string): Buffer {
  const arquivos: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/c.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/c.opf': strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="u"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="u">x</dc:identifier><dc:title>${titulo}</dc:title><dc:creator>Autora de Teste</dc:creator><dc:language>pt</dc:language></metadata><manifest><item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
    ),
    'OEBPS/cap1.xhtml': strToU8(
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>1</title></head><body><h2>Capítulo um</h2><p>${frase}</p></body></html>`,
    ),
  }
  return Buffer.from(zipSync(arquivos))
}

const CORS = { 'access-control-allow-origin': '*' }

async function prepararFontes(page: Page) {
  await page.route('**/catalogo/livros.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOGO) }),
  )
  await page.route('https://standardebooks.org/**', (r) =>
    r.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/epub+zip' },
      body: epub('A Pequena Viagem', 'Era uma vez um barco pequeno que queria ver o mar.'),
    }),
  )
  await page.route('https://pt.wikisource.org/**', (r) =>
    r.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ parse: { title: 'Contos da Serra', text: '<div><p>Primeiro conto da serra.</p></div>' } }),
    }),
  )
}

/** Perfil de exibição "Infantil" vindo do servidor (é o que o app hidrata ao abrir). */
async function comoCrianca(page: Page) {
  await page.addInitScript(() => localStorage.setItem('babel.age_profile', 'kids'))
  await page.route('**/api/settings', async (r) => {
    if (r.request().method() !== 'GET') return r.continue()
    const resposta = await r.fetch()
    const s = (await resposta.json()) as { ui?: string }
    const ui = ((): Record<string, unknown> => {
      try {
        return s.ui ? (JSON.parse(s.ui) as Record<string, unknown>) : {}
      } catch {
        return {}
      }
    })()
    await r.fulfill({ response: resposta, json: { ...s, ui: JSON.stringify({ ...ui, ageProfile: 'kids' }) } })
  })
}

/** O texto do livro no LEITOR (L2): o capítulo é um iframe `blob:` montado pelo motor. */
async function esperarNoLeitor(page: Page, frase: string) {
  await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  await fecharSobreposicoes(page)
  await expect(async () => {
    const capitulo = page.frames().find((f) => f.url().startsWith('blob:'))
    expect(capitulo).toBeTruthy()
    await expect(capitulo!.getByText(frase)).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

const cartao = (page: Page, id: string) => page.locator(`[data-livro="${id}"]`).first()

test.describe('Livros', () => {
  test('do Início ao detalhe e à leitura, com o texto pedido direto ao Standard Ebooks', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/')
    await clicarRobusto(page, page.getByTestId('livros-no-inicio'))
    await expect(page).toHaveURL(/\/livros$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Livros' })).toBeVisible()

    /* A vitrine: "Comece por aqui" com o livro fácil; o livro de JSON adulterado não aparece em lugar nenhum. */
    const comece = page.locator('[data-prateleira="lv-comece"]')
    await expect(comece.locator('[data-livro="se-teste-pequena-viagem"]')).toBeVisible()
    await expect(page.getByText('Obra Protegida')).toHaveCount(0)

    /* Filtros: o nível B2 deixa só o de 18 anos (o leitor aqui é adulto: self-host). */
    await page.getByRole('button', { name: /Filtros/ }).click()
    await page.getByTestId('filtros-de-livros').getByRole('button', { name: 'B2', exact: true }).click()
    await expect(
      page.getByTestId('resultados-de-livros').getByRole('heading', { name: '1 livro encontrado' }),
    ).toBeVisible()
    await expect(cartao(page, 'pg-9999')).toBeVisible()
    await page.getByRole('button', { name: 'Limpar busca' }).click()

    /* Outro idioma: o português traz o conto da Wikisource. */
    await page.getByTestId('idioma-dos-livros').selectOption('pt')
    await expect(cartao(page, 'ws-pt-contos-da-serra')).toBeVisible()
    await page.getByTestId('idioma-dos-livros').selectOption('en')

    /* Busca e detalhe. */
    await page.getByTestId('busca-de-livros').fill('pequena viagem')
    await cartao(page, 'se-teste-pequena-viagem').click()
    await expect(page).toHaveURL(/\/livros\/se-teste-pequena-viagem$/)
    const detalhe = page.getByTestId('livro-detalhe')
    await expect(detalhe.getByRole('heading', { level: 1, name: 'A Pequena Viagem' })).toBeVisible()
    await expect(detalhe.getByTestId('selo-legal')).toHaveText(
      /Domínio público no Brasil · autor †1900 · fonte Standard Ebooks/,
    )
    await expect(detalhe.getByText('Edição do Standard Ebooks (CC0)', { exact: false })).toBeVisible()
    await expect(detalhe.getByText('Autora Antiga †1900', { exact: false }).first()).toBeVisible()
    await expect(detalhe.getByText('Nível estimado')).toBeVisible()

    /* Ler: o EPUB vem do Standard Ebooks; nada do livro passa pelo servidor do Frasy. */
    /* Só os pedidos de DADOS (fetch/xhr): o código do leitor (`LeitorDoLivro.tsx`…) vem do app, e não é o livro. */
    const pedidos: string[] = []
    page.on('request', (r) => {
      if (['fetch', 'xhr', 'document', 'other'].includes(r.resourceType())) pedidos.push(r.url())
    })
    await detalhe.getByTestId('ler-livro').click()
    await expect(page).toHaveURL(/\/livros\/se-teste-pequena-viagem\/ler$/)
    await esperarNoLeitor(page, 'Era uma vez um barco pequeno')
    expect(pedidos.some((u) => u.startsWith('https://standardebooks.org/'))).toBe(true)
    const origem = new URL(page.url()).origin
    /* As ANOTAÇÕES do leitor sincronizam com o servidor (`/api/leitura/anotacoes`): é o que a pessoa escreveu,
       e não o livro. O livro em si não passa por lá. */
    expect(
      pedidos.filter(
        (u) =>
          u.startsWith(origem) &&
          !u.startsWith(`${origem}/api/leitura/anotacoes`) &&
          /epub|standardebooks|livro|import/i.test(u),
      ),
    ).toEqual([])

    /* Voltar leva ao detalhe; o voltar do navegador também. */
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page).toHaveURL(/\/livros\/se-teste-pequena-viagem$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/livros\/se-teste-pequena-viagem\/ler$/)
  })

  test('a Wikisource abre direto do navegador', async ({ page }) => {
    await prepararFontes(page)
    const pedidos: string[] = []
    page.on('request', (r) => pedidos.push(r.url()))
    await abrirTela(page, '/livros/ws-pt-contos-da-serra/ler')
    await esperarNoLeitor(page, 'Primeiro conto da serra.')
    expect(pedidos.some((u) => u.startsWith('https://pt.wikisource.org/w/api.php'))).toBe(true)
  })

  test('autor protegido: a busca explica os 70 anos e oferece "Trazer o seu"', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByTestId('busca-de-livros').fill('guimarães rosa')
    const porque = page.getByTestId('por-que-nao-esta')
    await expect(porque).toBeVisible()
    await expect(porque).toContainText('Grande Sertão: Veredas')
    await expect(porque).toContainText('O autor morreu há menos de 70 anos')
    await expect(porque).toContainText('70 anos depois do ano seguinte à morte do autor')
    await porque.getByRole('button', { name: 'Trazer o seu' }).click()
    await expect(page.getByTestId('trazer-o-seu')).toBeVisible()
  })

  test('"Trazer o seu": um EPUB do disco abre no aparelho e fica em Meus livros', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    const pedidos: string[] = []
    page.on('request', (r) => pedidos.push(`${r.method()} ${r.url()}`))
    await page.getByTestId('arquivo-do-livro').setInputFiles({
      name: 'meu-livro.epub',
      mimeType: 'application/epub+zip',
      buffer: epub('Meu Livro de Casa', 'Esta frase veio de um arquivo meu.'),
    })
    const trazido = page.getByTestId('trazido')
    await expect(trazido).toContainText('Meu Livro de Casa')
    /* O arquivo não sobe: nenhum POST saiu durante a importação. */
    expect(pedidos.filter((p) => p.startsWith('POST'))).toEqual([])
    await trazido.getByRole('button', { name: 'Ler agora' }).click()
    await expect(page).toHaveURL(/\/livros\/meu-[a-z0-9-]+\/ler$/)
    await esperarNoLeitor(page, 'Esta frase veio de um arquivo meu.')
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await page.getByRole('tab', { name: /Meus livros/ }).click()
    await expect(page.getByTestId('meus-livros')).toContainText('Meu Livro de Casa')
  })

  test('perfil de menor: o livro de 18 anos e o "a revisar" não aparecem na vitrine, na busca nem por link', async ({
    page,
  }) => {
    await prepararFontes(page)
    await comoCrianca(page)
    await abrirTela(page, '/livros')
    await expect(cartao(page, 'se-teste-pequena-viagem')).toBeVisible()
    await expect(page.getByText('Noite Proibida')).toHaveCount(0)
    await expect(page.getByText('Romance Sem Revisão')).toHaveCount(0)

    await page.getByTestId('busca-de-livros').fill('noite proibida')
    await expect(page.getByRole('heading', { name: 'Nenhum livro encontrado' })).toBeVisible()
    await expect(page.getByText('Noite Proibida')).toHaveCount(0)

    /* "Por que não está?" para menor: só a explicação geral, nenhum título excluído. */
    await page.getByTestId('busca-de-livros').fill('guimarães rosa')
    await expect(page.getByTestId('por-que-nao-esta')).toContainText('70 anos')
    await expect(page.getByTestId('por-que-nao-esta')).not.toContainText('Grande Sertão')

    await abrirTela(page, '/livros/pg-9999')
    await expect(page.getByTestId('livro-nao-encontrado')).toBeVisible()
    await expect(page.getByText('Noite Proibida')).toHaveCount(0)
    await abrirTela(page, '/livros/pg-9999/ler')
    await expect(page.getByTestId('livro-nao-encontrado')).toBeVisible()
  })

  test('adulto (o dono da máquina no self-host) abre o mesmo livro pelo link', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros/pg-9999')
    await expect(page.getByTestId('livro-detalhe').getByRole('heading', { name: 'Noite Proibida' })).toBeVisible()
  })

  test('Livros tem item no menu e "Meus livros" mostra capa, progresso, capítulo e tempo que falta', async ({
    page,
  }) => {
    await prepararFontes(page)
    /* A posição que o leitor grava (`leitor:posicao:<id da estante>`, `cat:<id>` no catálogo) e o livro guardado. */
    await page.addInitScript(() => {
      localStorage.setItem(
        'frasy.livros.meus.v1',
        JSON.stringify([
          {
            id: 'se-teste-pequena-viagem',
            titulo: 'A Pequena Viagem',
            autor: 'Autora Antiga',
            origem: 'catalogo',
            idioma: 'en',
            adicionadoEm: 1_000,
            status: 'quero-ler',
            etiquetas: [],
            progresso: null,
          },
        ]),
      )
      localStorage.setItem(
        'leitor:posicao:cat:se-teste-pequena-viagem',
        JSON.stringify({
          livroId: 'cat:se-teste-pequena-viagem',
          cfi: 'epubcfi(/6/4!/4/2)',
          secao: 2,
          fracao: 0.5,
          capitulo: 'Capítulo 2',
          atualizadaEm: Date.now(),
        }),
      )
    })
    await abrirTela(page, '/')
    await fecharSobreposicoes(page)
    /* Acima de 720 px Livros é um item do trilho; no celular mora no "Mais" (a barra de cinco não muda). */
    const noTrilho = trilho(page).locator('.q-item[data-px-rota="livros"]')
    if (await noTrilho.count()) {
      await clicarRobusto(page, noTrilho)
      await expect(page).toHaveURL(/\/livros$/)
      await expect(noTrilho).toHaveAttribute('aria-current', 'page')
    } else {
      await abrirTela(page, '/livros')
    }

    await page.getByRole('tab', { name: /Meus livros/ }).click()
    const item = page.getByTestId('meus-livros').locator('[data-livro="se-teste-pequena-viagem"]')
    await expect(item).toBeVisible()
    await expect(item.locator('.lv-capa')).toBeVisible()
    await expect(item.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    await expect(item).toContainText('50% lido')
    await expect(item).toContainText('Capítulo atual: Capítulo 2')
    await expect(item).toContainText('Faltam cerca de 42 min')
    /* Começou e ainda estava em "Quero ler": sugere "Lendo", e um clique marca. */
    await item.getByRole('button', { name: 'Marcar como lendo' }).click()
    await expect(item.getByLabel(/Status de/)).toHaveValue('lendo')

    await page.getByTestId('busca-meus-livros').fill('zzz')
    await expect(page.getByTestId('meus-livros-sem-resultado')).toBeVisible()
  })

  test('a Biblioteca tem a porta de Livros', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/biblioteca')
    await clicarRobusto(page, page.getByTestId('livros-na-biblioteca'))
    await expect(page).toHaveURL(/\/livros$/)
  })
})
