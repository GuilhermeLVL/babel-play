/**
 * O SITE PÚBLICO GERADO NO BUILD (`scripts/site/gerar.ts`, Tarefa 1 da spec do site público): cada página
 * com título, descrição e canonical próprios e o texto no HTML (sem JS); só guia `revisado: true` publicado
 * (e no sitemap); preços da matriz; robots, ads.txt e a 404.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { gerarSite, idDoAdsense, opcoesDoAmbiente, robots, urlDoSite } from '../scripts/site/gerar'
import { lerGuias } from '../scripts/site/guias'
import { lerFrontmatter, markdownParaHtml } from '../scripts/site/markdown'
import { guiasRelacionados } from '../scripts/site/paginas'
import { PLAN_MATRIX } from '../src/core/planos'

const PASTA = path.join(__dirname, 'fixtures', 'guias-do-site')
const URL_SITE = 'https://frasy.com.br'

function site(env: Record<string, string | undefined> = {}, pasta = PASTA) {
  return gerarSite(opcoesDoAmbiente({ VITE_PUBLIC_URL: URL_SITE, ...env }, pasta, '5.3.0').opcoes)
}

const titulo = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1]
const canonical = (html: string) => /<link rel="canonical" href="([^"]*)">/.exec(html)?.[1]
const descricao = (html: string) => /<meta name="description" content="([^"]*)">/.exec(html)?.[1]

describe('páginas públicas', () => {
  const arquivos = site()
  const PAGINAS: [string, string, string][] = [
    ['inicio.html', '/', 'Aprenda idiomas com o que você já assiste e escuta'],
    ['planos.html', '/planos', 'Teste sem cartão'],
    ['sobre.html', '/sobre', 'No que acreditamos'],
    ['contato.html', '/contato', 'contato@frasy.com.br'],
    ['ajuda.html', '/ajuda', 'Perguntas frequentes'],
    ['guias.html', '/guias', 'Revisar com calma: um guia de teste'],
  ]

  it.each(PAGINAS)('%s: texto no HTML, canonical %s, título e descrição próprios', (arquivo, caminho, trecho) => {
    const html = arquivos.get(arquivo)!
    expect(html).toContain(trecho)
    expect(canonical(html)).toBe(`${URL_SITE}${caminho}`)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/)
  })

  it('título e descrição não se repetem entre as páginas', () => {
    const htmls = PAGINAS.map(([a]) => arquivos.get(a)!)
    expect(new Set(htmls.map(titulo)).size).toBe(htmls.length)
    expect(new Set(htmls.map(descricao)).size).toBe(htmls.length)
  })

  it('cabeçalho com Entrar → /app e rodapé com privacidade e termos', () => {
    const html = arquivos.get('inicio.html')!
    expect(html).toContain('<a class="botao" href="/app">Entrar</a>')
    for (const href of ['/sobre', '/contato', '/ajuda', '/privacidade', '/termos', '/guias'])
      expect(html).toContain(`href="${href}"`)
  })

  it('home com JSON-LD Organization e WebSite', () => {
    const html = arquivos.get('inicio.html')!
    expect(html).toContain('"@type":"Organization"')
    expect(html).toContain('"@type":"WebSite"')
  })

  it('planos: preços da matriz e WebApplication com offers (sem flags: Grátis + Premium)', () => {
    const html = arquivos.get('planos.html')!
    const preco = PLAN_MATRIX.premium.precoMensalBrl!.toFixed(2)
    expect(html).toContain(`R$ ${preco.replace('.', ',')}`)
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1])
    expect(ld['@type']).toBe('WebApplication')
    expect(ld.offers.map((o: { price: string }) => o.price)).toEqual(['0', preco])
    expect(ld.offers.every((o: { priceCurrency: string }) => o.priceCurrency === 'BRL')).toBe(true)
  })

  it('planos: com a venda v4 ligada, o Plus (e não o Premium) e Família/Pro em breve', () => {
    const html = site({ SITE_FLAGS_DE_VENDA: 'venda_planos_v4' }).get('planos.html')!
    expect(html).toContain(`R$ ${PLAN_MATRIX.plus.precoMensalBrl!.toFixed(2).replace('.', ',')}`)
    expect(html).not.toContain(`R$ ${PLAN_MATRIX.premium.precoMensalBrl!.toFixed(2).replace('.', ',')}`)
    expect(html).toContain('Em breve: Família e Pro')
  })

  it('404: noindex e sem canonical', () => {
    const html = arquivos.get('404.html')!
    expect(html).toContain('<meta name="robots" content="noindex">')
    expect(canonical(html)).toBeUndefined()
  })
})

describe('guias', () => {
  it('revisado: false e arquivo sem frontmatter ficam fora', () => {
    const { publicados, ignorados } = lerGuias(PASTA)
    expect(publicados.map((g) => g.slug)).toEqual(['revisar-com-calma'])
    expect(ignorados.map((i) => i.arquivo).sort()).toEqual(['LEIA-ME.md', 'rascunho-nao-revisado.md'])
    const arquivos = site()
    expect(arquivos.has('guias/revisar-com-calma.html')).toBe(true)
    expect(arquivos.has('guias/rascunho-nao-revisado.html')).toBe(false)
    expect(arquivos.get('guias.html')).not.toContain('Rascunho')
  })

  it('YAML de verdade: data sem aspas e lista em bloco', () => {
    const [g] = lerGuias(PASTA).publicados
    expect(g.publicado).toBe('2026-10-20')
    expect(g.palavrasChave).toEqual(['repetição espaçada', 'revisão'])
    expect(lerFrontmatter("---\nslug: 'a'\nlista: ['x', \"y\"]\n---\ncorpo").dados).toEqual({
      slug: 'a',
      lista: ['x', 'y'],
    })
  })

  it('página do guia: um h1, Article no JSON-LD, sem HTML cru nem link javascript:', () => {
    const html = site().get('guias/revisar-com-calma.html')!
    expect(html.match(/<h1>/g)).toHaveLength(1)
    expect(html).toContain('"@type":"Article"')
    expect(html).toContain('<strong>negrito</strong>')
    expect(html).toContain('<em>itálico</em>')
    expect(html).toContain('href="https://exemplo.com.br/a?b=1&amp;c=2"')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('javascript:alert(1)"')
    expect(html).not.toMatch(/href="javascript:/)
  })

  it('pasta ausente: zero guias e o build segue', () => {
    const arquivos = site({}, path.join(PASTA, 'nao-existe'))
    expect([...arquivos.keys()].some((k) => k.startsWith('guias/'))).toBe(false)
    expect(arquivos.get('guias.html')).toContain('chegam em breve')
  })

  it('guia revisado com frontmatter inválido derruba o build', () => {
    const pasta = mkdtempSync(path.join(tmpdir(), 'guias-'));
    writeFileSync(path.join(pasta, 'x.md'), "---\ntitulo: 'X'\nslug: 'Slug Ruim'\nrevisado: true\n---\ncorpo");
    expect(() => lerGuias(pasta)).toThrow(/frontmatter inválido: x\.md/);
    expect(markdownParaHtml('# só título')).toBe('');
  })

  it('relacionados: não inclui o próprio guia', () => {
    const [g] = lerGuias(PASTA).publicados
    const outro = { ...g, slug: 'outro', titulo: 'Outro sobre revisão', palavrasChave: ['revisão'] }
    expect(guiasRelacionados(g, [g, outro]).map((x) => x.slug)).toEqual(['outro'])
  })
})

describe('sitemap, robots e ads.txt', () => {
  it('sitemap: páginas públicas e só guias publicados, com a URL do site', () => {
    const xml = site().get('sitemap.xml')!
    for (const c of ['/', '/planos', '/guias', '/ajuda', '/sobre', '/contato', '/privacidade', '/termos'])
      expect(xml).toContain(`<loc>${URL_SITE}${c}</loc>`)
    expect(xml).toContain(`<loc>${URL_SITE}/guias/revisar-com-calma</loc><lastmod>2026-10-20</lastmod>`)
    expect(xml).not.toContain('rascunho')
    expect(xml).not.toContain('/app')
  })

  it('robots: bloqueia /api/ e /app e aponta o sitemap', () => {
    expect(site().get('robots.txt')).toBe(robots(URL_SITE))
    expect(robots(URL_SITE)).toContain('Disallow: /api/\nDisallow: /app\n')
    expect(robots(URL_SITE)).toContain(`Sitemap: ${URL_SITE}/sitemap.xml`)
  })

  it('ads.txt só com ADSENSE_PUB_ID válido', () => {
    expect(site().has('ads.txt')).toBe(false)
    expect(site({ ADSENSE_PUB_ID: 'lixo' }).has('ads.txt')).toBe(false)
    expect(site({ ADSENSE_PUB_ID: 'ca-pub-1234567890123456' }).get('ads.txt')).toBe(
      'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n',
    )
    expect(idDoAdsense('pub-1234567890')).toBe('pub-1234567890')
  })

  it('URL do site: VITE_PUBLIC_URL https, senão a de produção', () => {
    expect(urlDoSite({ VITE_PUBLIC_URL: 'https://staging.exemplo.dev/' })).toBe('https://staging.exemplo.dev')
    expect(urlDoSite({ VITE_PUBLIC_URL: 'http://localhost:3000' })).toBe('https://frasy.com.br')
    expect(urlDoSite({})).toBe('https://frasy.com.br')
  })
})
