/**
 * O SITE PÚBLICO GERADO NO BUILD (`scripts/site/gerar.ts`, Tarefa 1 da spec do site público): cada página
 * com título, descrição e canonical próprios e o texto no HTML (sem JS); só guia `revisado: true` publicado
 * (e no sitemap); preços da matriz; robots, ads.txt e a 404.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { gerarSite, idDoAdsense, opcoesDoAmbiente, paginaLegal, robots, urlDoSite } from '../scripts/site/gerar'
import { lerGuias } from '../scripts/site/guias'
import { lerFrontmatter, markdownParaHtml } from '../scripts/site/markdown'
import { guiasRelacionados, sumarioDoGuia } from '../scripts/site/paginas'
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
    // Só JSON-LD e, na home, os scripts do próprio domínio do filme (`/site/…`).
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)(?! src="\/site\/)/)
  })

  it('nenhuma promessa de privacidade que a flag nuvem_convidado desmentiria', () => {
    for (const [arquivo] of PAGINAS) {
      const html = arquivos.get(arquivo)!
      expect(html, arquivo).not.toMatch(/sem conta, (nada|o que você ouve)/i)
      expect(html, arquivo).not.toMatch(/não sai do seu (computador|aparelho)/i)
    }
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

  it('planos: com o anual fechado (o padrão), nenhum preço anual nem promessa de anual parcelado', () => {
    for (const flags of ['', 'venda_planos_v4']) {
      const html = site({ SITE_FLAGS_DE_VENDA: flags }).get('planos.html')!
      expect(html, flags).not.toMatch(/por ano/)
      expect(html, flags).not.toMatch(/anual/i)
      expect(html, flags).not.toContain(PLAN_MATRIX.plus.precoAnualBrl!.toFixed(2).replace('.', ','))
    }
  })

  it('planos: com SITE_ANUAL_A_VENDA=1, o preço anual e as perguntas do anual voltam', () => {
    const html = site({ SITE_FLAGS_DE_VENDA: 'venda_planos_v4', SITE_ANUAL_A_VENDA: '1' }).get('planos.html')!
    expect(html).toContain(`ou R$ ${PLAN_MATRIX.plus.precoAnualBrl!.toFixed(2).replace('.', ',')} por ano`)
    expect(html).toContain('No plano anual você pode pagar à vista ou parcelar.')
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
    const pasta = mkdtempSync(path.join(tmpdir(), 'guias-'))
    writeFileSync(path.join(pasta, 'x.md'), "---\ntitulo: 'X'\nslug: 'Slug Ruim'\nrevisado: true\n---\ncorpo")
    expect(() => lerGuias(pasta)).toThrow(/frontmatter inválido: x\.md/)
    expect(markdownParaHtml('# só título')).toBe('')
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

describe('layout do site', () => {
  it('home: um filme em sete trechos contínuos, legenda de exemplo, aviso de IA, texto na página e mídia que existe', () => {
    const html = site().get('inicio.html')!
    expect(html).toContain('data-filme="/site/midia/filme.mp4" data-filme-celular="/site/midia/filme-m.mp4"')
    const trechos = [...html.matchAll(/data-de="([\d.]+)" data-ate="([\d.]+)"/g)].map((m) => [+m[1], +m[2]])
    expect(trechos).toHaveLength(7)
    // os trechos cobrem o filme sem buraco nem sobreposição: um começa onde o outro termina
    trechos.slice(1).forEach(([de], i) => expect(de).toBe(trechos[i][1]))
    expect(html).toContain('Não acredito que você escondeu isso de mim. Era para a gente ser uma equipe!')
    expect(html).toContain('Cenas de exemplo criadas com IA. A legenda mostra o visual real do Frasy.')
    // a tradução de exemplo usa a palavra do contexto (aeroporto: portão)
    expect(html).toContain('<span class="chave">portão</span> 12')
    // números que o site afirma: os jogos da grade e nenhum total de livros que a produção não tem
    expect(html).toContain('18 jogos curtos')
    expect(html).not.toMatch(/\d+ clássicos/)
    // sem jargão de ferramenta no texto da home
    expect(html).not.toMatch(/\b(deck|FSRS|SRS|XP|modo intérprete|revisão espaçada)\b/)
    expect(html).toContain('<span class="chip breve">Em breve</span>')
    // sem JavaScript, o texto de todos os capítulos já está no HTML
    expect(html).toContain('<h1>Ouviu outra língua? Entenda e guarde a palavra.</h1>')
    expect(html).toContain('As palavras do dia ficam com você.')
    // toda mídia citada existe em public/
    const midias = [...html.matchAll(/(?:src|poster|data-filme|data-filme-celular)="(\/site\/[^"]+)"/g)].map(
      (m) => m[1],
    )
    expect(midias.length).toBeGreaterThan(20)
    for (const m of midias) expect(() => readFileSync(path.join(__dirname, '..', 'public', m))).not.toThrow()
  })

  it('home: scripts só do próprio domínio, com defer; as outras páginas seguem sem JavaScript', () => {
    const html = site().get('inicio.html')!
    expect(html).toContain('<script src="/site/lenis.min.js" defer></script>')
    // A ordem importa: `rolo.js` usa o `FrasyRoda` de `roda.js` (defer executa na ordem do documento).
    expect(html).toContain(
      '<script src="/site/lenis.min.js" defer></script>\n<script src="/site/roda.js" defer></script>\n<script src="/site/rolo.js" defer></script>',
    )
    expect(html).not.toMatch(/<script src="https?:/)
    expect(site().get('planos.html')!).not.toMatch(/<script src=/)
  })

  it('home: o filme não depende de movimento (reduzido também carrega) e o de 720p vem primeiro', () => {
    // O motor é JS puro em `public/` (fora do lint e do build); aqui, o contrato que o e2e da home mede.
    const rolo = readFileSync(path.join(__dirname, '..', 'public', 'site', 'rolo.js'), 'utf8')
    const carregar = /async function carregar\(s\) \{\n\s*(.*)\n/.exec(rolo)?.[1] ?? ''
    expect(carregar).toContain('return')
    expect(carregar).not.toContain('menos')
    expect(rolo).toContain('const fonteDe = (f) => f.clipeCelular || f.clipe;')
  })

  it('home: em tela baixa, o primeiro capítulo desconta o cabeçalho e o título escala pela altura', () => {
    const html = site().get('inicio.html')!
    expect(html).toContain('.capitulo:first-child .capitulo-fixo{height:calc(100vh - var(--altura-do-topo))')
    expect(html).toMatch(/\.capitulo h1,\.capitulo h2\{font-size:clamp\(34px,min\(5\.6vw,7\.8vh\),82px\)/)
  })

  it('as duas fontes do app, pré-carregadas', () => {
    const html = site().get('planos.html')!
    expect(html).toContain('<link rel="preload" href="/fontes/archivo-wdth-5.3.0.woff2"')
    expect(html).toContain('<link rel="preload" href="/fontes/inter-5.3.0.woff2"')
  })

  it('guia: sumário lateral a partir dos h2, com âncoras únicas', () => {
    const { html, itens } = sumarioDoGuia(
      '<h2>Uma seção</h2><p>x</p><h2>Uma seção</h2><h2>Ação &amp; <code>y</code></h2>',
    )
    expect(itens.map((i) => i.id)).toEqual(['uma-secao', 'uma-secao-2', 'acao-y'])
    expect(html).toContain('<h2 id="uma-secao-2">Uma seção</h2>')
  })
})

describe('páginas legais com o layout do site', () => {
  it.each([
    ['privacidade.html', '/privacidade'],
    ['termos.html', '/termos'],
  ])('%s: o miolo de <main> passa intacto, com cabeçalho, rodapé e canonical', (arquivo, caminho) => {
    const fonte = readFileSync(path.join('public', arquivo), 'utf8')
    const html = paginaLegal(fonte, { caminho, urlDoSite: URL_SITE, versaoDaFonte: '5.3.0' })
    const miolo = /<main[^>]*>([\s\S]*?)<\/main>/.exec(fonte)![1]
    expect(html).toContain(miolo)
    expect(canonical(html)).toBe(`${URL_SITE}${caminho}`)
    expect(html).toContain('<a class="botao" href="/app">Entrar</a>')
    expect(html).toContain(`<a href="${caminho}" aria-current="page">`)
    expect(html.match(/<h1>/g)).toHaveLength(1)
  })

  it('sem <main>, erro (não publica a política vazia)', () => {
    expect(() => paginaLegal('<p>x</p>', { caminho: '/termos', urlDoSite: URL_SITE, versaoDaFonte: '1' })).toThrow(
      /sem <main>/,
    )
  })
})
