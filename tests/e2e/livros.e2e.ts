import { expect, type Page, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

import { cbzMinimo, docxMinimo, fb2Minimo, mobiMinimo } from '../harness/formatosDeTeste'
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
    /* A MESMA OBRA (Q35160) em três idiomas: en e pt revisadas, es ainda "a revisar" (menor não vê), e uma
       edição de 1990 que o filtro legal nunca mostra, para ninguém. */
    livro({
      id: 'pg-1727',
      titulo: 'The Odyssey',
      autores: [{ nome: 'Homer', anoMorte: -700, idiomas: ['grc'] }],
      tradutores: [{ nome: 'Samuel Butler', anoMorte: 1902, idiomas: ['en'] }],
      idioma: 'en',
      fonte: 'gutenberg-curado',
      fonteId: '1727',
      formatos: { r2: 'livros/pg-1727.epub' },
      categorias: ['aventura'],
      classificacao: 'livre',
      nivel: 'C1',
      popularidade: 0.4,
      obra: 'Q35160',
      titulosAlternativos: ['Odisseia', 'La Odisea'],
    }),
    livro({
      id: 'ws-pt-odisseia',
      titulo: 'Odisseia',
      autores: [{ nome: 'Homero', anoMorte: -700, idiomas: ['grc'] }],
      tradutores: [{ nome: 'Tradutor Antigo', anoMorte: 1900, idiomas: ['pt'] }],
      idioma: 'pt',
      fonte: 'wikisource',
      fonteId: 'Odisseia',
      formatos: { wikisource: { api: 'https://pt.wikisource.org/w/api.php', pagina: 'Odisseia' } },
      categorias: ['aventura'],
      classificacao: 'livre',
      nivel: 'C1',
      obra: 'Q35160',
      titulosAlternativos: ['The Odyssey', 'La Odisea'],
    }),
    livro({
      id: 'pg-58221',
      titulo: 'La Odisea',
      autores: [{ nome: 'Homero', anoMorte: -700, idiomas: ['grc'] }],
      tradutores: [{ nome: 'Traductor Antiguo', anoMorte: 1910, idiomas: ['es'] }],
      idioma: 'es',
      fonte: 'gutenberg-curado',
      fonteId: '58221',
      formatos: { r2: 'livros/pg-58221.epub' },
      classificacao: null,
      nivel: 'C1',
      obra: 'Q35160',
      titulosAlternativos: ['The Odyssey', 'Odisseia'],
    }),
    livro({
      id: 'pg-58222',
      titulo: 'Die Odyssee',
      autores: [{ nome: 'Homer', anoMorte: -700, idiomas: ['grc'] }],
      tradutores: [{ nome: 'Übersetzer Neu', anoMorte: 1990, idiomas: ['de'] }],
      idioma: 'de',
      fonte: 'gutenberg-curado',
      fonteId: '58222',
      formatos: { r2: 'livros/pg-58222.epub' },
      classificacao: 'livre',
      nivel: 'C1',
      obra: 'Q35160',
      titulosAlternativos: ['The Odyssey'],
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
function epub(titulo: string, frase: string, extras: Record<string, string> = {}): Buffer {
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
  for (const [nome, texto] of Object.entries(extras)) arquivos[nome] = strToU8(texto)
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

/** Solta de verdade: um DataTransfer com o arquivo, disparado como "drop" na zona. */
async function soltar(page: Page, bytes: Uint8Array | Buffer, nome: string) {
  await page.getByTestId('zona-de-soltar').evaluate(
    (zona, [dados, n]) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(dados as number[])], n as string, { type: '' }))
      zona.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    },
    [[...bytes], nome] as const,
  )
}

const abrirAgora = (page: Page) => page.getByTestId('trazido').getByRole('button', { name: 'Abrir agora' }).click()

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

  test('"Trazer o seu": soltar um EPUB mostra "Pronto!", abre no leitor e o livro fica em Meus livros', async ({
    page,
  }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await expect(page.getByTestId('aviso-de-direitos')).toContainText('Traga só livros que você tem o direito de ler')
    const pedidos: string[] = []
    page.on('request', (r) => pedidos.push(`${r.method()} ${r.url()}`))
    /* Soltar de verdade: um DataTransfer com o arquivo, disparado como "drop" na zona. */
    await soltar(page, epub('Meu Livro de Casa', 'Esta frase veio de um arquivo meu.'), 'sem-extensao')
    await expect(page.getByTestId('trazido')).toContainText('Pronto!')
    await abrirAgora(page)
    await expect(page).toHaveURL(/\/livros\/meu-[a-z0-9-]+\/ler$/)
    await esperarNoLeitor(page, 'Esta frase veio de um arquivo meu.')
    /* O arquivo não sobe: nenhum POST saiu durante a importação. */
    /* (o POST de erro do cliente, por ruído do ResizeObserver do navegador, não leva o arquivo) */
    expect(pedidos.filter((p) => p.startsWith('POST') && !p.includes('/api/erros-do-cliente'))).toEqual([])
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await page.getByRole('tab', { name: /Meus livros/ }).click()
    await expect(page.getByTestId('meus-livros')).toContainText('Meu Livro de Casa')
  })

  test('"Trazer o seu": EPUB com proteção (DRM) é recusado com gentileza, sem abrir', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    const protegido = epub('Livro Protegido', 'Texto cifrado.', {
      'META-INF/encryption.xml':
        '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OEBPS/cap1.xhtml"/></CipherData></EncryptedData></encryption>',
    })
    await page.getByTestId('arquivo-do-livro').setInputFiles({
      name: 'comprado.epub',
      mimeType: 'application/epub+zip',
      buffer: protegido,
    })
    const erro = page.getByTestId('erro-do-trazer')
    await expect(erro).toContainText('proteção (DRM) e o Frasy não consegue abrir')
    await expect(erro).toContainText('Não é culpa sua')
    await expect(page.getByTestId('ajuda-kindle')).toBeVisible()
    await expect(page).not.toHaveURL(/\/ler$/)
  })

  test('"Trazer o seu": link do raw do GitHub é baixado pelo navegador e abre; página de loja é explicada', async ({
    page,
  }) => {
    await prepararFontes(page)
    const pedidos: string[] = []
    await page.route('https://raw.githubusercontent.com/**', (r) => {
      pedidos.push(r.request().url())
      return r.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/octet-stream' },
        body: epub('Livro do GitHub', 'Esta frase veio de um repositório.'),
      })
    })
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await page.getByTestId('link-do-livro').fill('https://www.amazon.com.br/dp/B000000000')
    await page.getByRole('button', { name: 'Trazer livro' }).click()
    await expect(page.getByTestId('erro-do-trazer')).toContainText('uma página, não um arquivo de livro')
    expect(pedidos).toEqual([])

    await page.getByTestId('link-do-livro').fill('https://raw.githubusercontent.com/usuario/repo/main/livro.epub')
    await page.getByRole('button', { name: 'Trazer livro' }).click()
    await abrirAgora(page)
    await expect(page).toHaveURL(/\/livros\/meu-[a-z0-9-]+\/ler$/)
    await esperarNoLeitor(page, 'Esta frase veio de um repositório.')
    expect(pedidos).toEqual(['https://raw.githubusercontent.com/usuario/repo/main/livro.epub'])
  })

  test('"Trazer o seu": o guia abre a fonte em outra aba e, ao voltar, lembra de soltar o arquivo', async ({
    page,
    context,
  }) => {
    await prepararFontes(page)
    await context.route('https://www.gutenberg.org/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Gutenberg de teste</body></html>' }),
    )
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    const guia = page.getByTestId('onde-achar-livros')
    await expect(guia).toContainText('70 anos depois da morte do autor')
    const link = guia.getByTestId('fonte-gutenberg').getByRole('link')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const popup = page.waitForEvent('popup')
    await link.click()
    await (await popup).close()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    const lembrete = page.getByTestId('lembrete-de-volta')
    await expect(lembrete).toContainText('Baixou um livro? Solte o arquivo aqui')
    await lembrete.getByRole('button').click()
    await expect(page.getByTestId('zona-de-soltar')).toBeFocused()
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

  test('a mesma obra em outros idiomas: buscar pelo título traduzido, ver os idiomas e trocar de edição', async ({
    page,
  }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')

    /* "Odisseia" é o título em português: a edição em inglês é achada pelo título alternativo da obra. */
    await page.getByTestId('busca-de-livros').fill('odisseia')
    const resultados = page.getByTestId('resultados-de-livros')
    await expect(resultados.getByRole('heading', { name: '1 livro encontrado' })).toBeVisible()
    await expect(cartao(page, 'pg-1727')).toBeVisible()
    /* O cartão diz em que outros idiomas a obra existe (o adulto vê as três edições visíveis; a de 1990 nunca). */
    await expect(cartao(page, 'pg-1727').getByTestId('tambem-em')).toContainText('Também em português, espanhol')
    await expect(page.getByText('Die Odyssee')).toHaveCount(0)

    /* Um erro de digitação de uma letra também acha. */
    await page.getByTestId('busca-de-livros').fill('odyssy')
    await expect(cartao(page, 'pg-1727')).toBeVisible()
    await page.getByTestId('busca-de-livros').fill('odisseia')

    await cartao(page, 'pg-1727').click()
    await expect(page).toHaveURL(/\/livros\/pg-1727$/)
    const outros = page.getByTestId('outros-idiomas')
    await expect(outros.getByRole('heading', { name: 'Ler esta obra em outros idiomas' })).toBeVisible()
    await expect(outros.locator('[data-edicao]')).toHaveCount(2)
    await expect(outros.locator('[data-edicao="ws-pt-odisseia"]')).toContainText('Tradutor Antigo (†1900)')
    await expect(outros.locator('[data-edicao="pg-58222"]')).toHaveCount(0)

    /* Trocar de edição: o título leva ao detalhe da irmã, que lista as outras (inclusive a inglesa). */
    await outros.locator('[data-edicao="ws-pt-odisseia"]').getByRole('button', { name: 'Odisseia' }).click()
    await expect(page).toHaveURL(/\/livros\/ws-pt-odisseia$/)
    const detalhe = page.getByTestId('livro-detalhe')
    await expect(detalhe.getByRole('heading', { level: 1, name: 'Odisseia' })).toBeVisible()
    await expect(page.getByTestId('outros-idiomas').locator('[data-edicao="pg-1727"]')).toBeVisible()

    /* "Ler" na irmã abre a leitura daquela edição. */
    await page.getByTestId('outros-idiomas').locator('[data-edicao="pg-1727"]').getByTestId('ler-outra-edicao').click()
    await expect(page).toHaveURL(/\/livros\/pg-1727\/ler$/)
  })

  test('busca fora do idioma da vitrine: conta obras e abre a edição certa', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByTestId('idioma-dos-livros').selectOption('pt')
    /* O conto só existe em português: na vitrine em inglês a busca não acha, mas diz onde está. */
    await page.getByTestId('busca-de-livros').fill('contos da serra')
    await expect(cartao(page, 'ws-pt-contos-da-serra')).toBeVisible()
    await page.getByTestId('idioma-dos-livros').selectOption('en')
    await page.getByTestId('busca-de-livros').fill('contos da serra')
    await expect(page.getByRole('heading', { name: 'Nenhum livro encontrado' })).toBeVisible()
    await expect(page.getByText('Há 1 resultado em português.')).toBeVisible()
    await page.getByTestId('abrir-em-outro-idioma').click()
    await expect(page).toHaveURL(/\/livros\/ws-pt-contos-da-serra$/)
  })

  test('perfil de menor: só vê as irmãs com faixa etária aprovada', async ({ page }) => {
    await prepararFontes(page)
    await comoCrianca(page)
    await abrirTela(page, '/livros')
    await page.getByTestId('busca-de-livros').fill('odisseia')
    await expect(cartao(page, 'pg-1727')).toBeVisible()
    /* A edição em espanhol está "a revisar": nem como idioma do cartão, nem no bloco do detalhe. */
    await expect(cartao(page, 'pg-1727').getByTestId('tambem-em')).toContainText('Também em português')
    await expect(cartao(page, 'pg-1727').getByTestId('tambem-em')).not.toContainText('espanhol')
    await cartao(page, 'pg-1727').click()
    const outros = page.getByTestId('outros-idiomas')
    await expect(outros.locator('[data-edicao]')).toHaveCount(1)
    await expect(outros.locator('[data-edicao="ws-pt-odisseia"]')).toBeVisible()
    await abrirTela(page, '/livros/pg-58221')
    await expect(page.getByTestId('livro-nao-encontrado')).toBeVisible()
  })

  test('cabeçalho: "Trazer um livro seu" em todas as abas leva ao passo a passo com os formatos aceitos', async ({
    page,
  }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    const botao = page.getByTestId('trazer-um-livro-seu')
    await expect(botao).toBeVisible()
    await page.getByRole('tab', { name: /Meus livros/ }).click()
    await expect(page.getByTestId('meus-livros')).toBeVisible()
    await expect(botao).toBeVisible()
    await botao.click()
    await expect(page.getByTestId('trazer-o-seu')).toBeVisible()
    await expect(page.getByTestId('passos-de-trazer')).toContainText('Tenha o arquivo')
    await expect(page.getByTestId('formatos-livros')).toContainText('MOBI')
    await expect(page.getByTestId('formatos-documentos')).toContainText('Markdown')
    await expect(page.getByTestId('formatos-quadrinhos')).toContainText('CBZ')
    await expect(page.getByTestId('linha-drm')).toContainText('Livros com proteção (DRM) não abrem')
    await page.screenshot({ path: test.info().outputPath('trazer-o-seu.png'), fullPage: true })
  })

  test('"Trazer o seu": MOBI, TXT e DOCX abrem; MOBI com DRM e formato desconhecido são recusados com gentileza', async ({
    page,
  }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()

    await soltar(page, mobiMinimo({ titulo: 'Livro Mobi de Teste' }), 'renomeado.bin')
    await expect(page.getByTestId('trazido')).toContainText('Livro Mobi de Teste')
    await abrirAgora(page)
    await esperarNoLeitor(page, 'Era uma vez um barco pequeno')
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()

    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await soltar(
      page,
      Buffer.from('Capítulo 1\n\nO texto do arquivo TXT começa aqui.\n\nCapítulo 2\n\nE continua.'),
      'diario.txt',
    )
    await expect(page.getByTestId('trazido')).toContainText('diario')
    await page.getByTestId('trazido').getByRole('button', { name: 'Ver em Meus livros' }).click()
    await expect(page.getByTestId('meus-livros')).toContainText('Livro Mobi de Teste')
    await expect(page.getByTestId('meus-livros')).toContainText('diario')

    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await soltar(page, docxMinimo(), 'trabalho.docx')
    await expect(page.getByTestId('trazido')).toContainText('trabalho')

    await soltar(page, mobiMinimo({ encryption: 2 }), 'comprado.azw3')
    await expect(page.getByTestId('erro-do-trazer')).toContainText('proteção (DRM)')
    await page.screenshot({ path: test.info().outputPath('erro-drm.png'), fullPage: true })

    await soltar(page, Buffer.from('AT&TFORM....DJVM'), 'livro.djvu')
    await expect(page.getByTestId('erro-do-trazer')).toContainText('Ainda não abrimos arquivos DJVU')
  })

  test('"Trazer o seu": FB2 e CBZ abrem no leitor', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await soltar(page, fb2Minimo({ titulo: 'Livro FB2 de Teste' }), 'x.fb2')
    await abrirAgora(page)
    await esperarNoLeitor(page, 'Era uma vez um barco pequeno')
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await soltar(page, cbzMinimo(), 'gibi.cbz')
    await expect(page.getByTestId('trazido')).toContainText('gibi')
    await abrirAgora(page)
    await expect(page.locator('[data-testid=leitor][data-estado=pronto]')).toBeVisible({ timeout: 30_000 })
  })

  test('backup da estante e restauração: o livro volta depois de apagado', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Trazer o seu/ }).click()
    await soltar(page, Buffer.from('Um texto para guardar no backup, bem simples e curto.'), 'cofre.txt')
    await expect(page.getByTestId('trazido')).toBeVisible()
    await page.getByTestId('trazido').getByRole('button', { name: 'Ver em Meus livros' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('baixar-backup').click()])
    const caminho = test.info().outputPath('backup.zip')
    await download.saveAs(caminho)
    await expect(page.getByTestId('aviso-do-backup')).toContainText('Backup pronto')

    /* apaga o livro e restaura do arquivo */
    await page.evaluate(() => localStorage.removeItem('frasy.livros.meus.v1'))
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Meus livros/ }).click()
    await expect(page.getByTestId('meus-livros')).not.toContainText('cofre')
    await page.getByTestId('arquivo-do-backup').setInputFiles(caminho)
    await expect(page.getByTestId('aviso-do-backup')).toContainText('Restaurados: 1')
    await expect(page.getByTestId('meus-livros')).toContainText('cofre')
  })

  test('arquivo que não é backup é recusado, sem restaurar nada', async ({ page }) => {
    await prepararFontes(page)
    await abrirTela(page, '/livros')
    await page.getByRole('tab', { name: /Meus livros/ }).click()
    await page.getByTestId('arquivo-do-backup').setInputFiles({
      name: 'falso.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ 'qualquer.txt': strToU8('oi') })),
    })
    await expect(page.getByTestId('aviso-do-backup')).toContainText('não é um backup do Frasy')
  })
})
