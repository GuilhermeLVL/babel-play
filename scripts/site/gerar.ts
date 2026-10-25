/**
 * O SITE PÚBLICO NO BUILD (Tarefa 1 de `docs/specs/2026-10-25-site-publico-seo-e-anuncios.md`).
 *
 * Gera, como arquivos estáticos ao lado do app em `dist/`:
 *
 *   inicio.html          a home (`/`; o Worker a serve na raiz, porque `index.html` é o app)
 *   planos.html          `/planos`, preços de `src/core/planos.ts`
 *   sobre|contato|ajuda.html, guias.html, guias/<slug>.html
 *   404.html             o `not_found_handling: "404-page"` do `wrangler.jsonc` a devolve com status 404
 *   sitemap.xml, robots.txt, ads.txt (só com `ADSENSE_PUB_ID`)
 *
 * `.html` na raiz, e não `<rota>/index.html`: o Static Assets serve `planos.html` em `/planos` (sem barra
 * final), que é o endereço canônico. O app continua em `dist/index.html` e o Worker o serve em `/app`.
 *
 * Função pura sobre as opções (os guias vêm lidos): os testes chamam `gerarSite` direto.
 */
import { type Guia, lerGuias } from './guias';
import { pagina } from './layout';
import {
  corpoDaAjuda,
  corpoDaHome,
  corpoDoContato,
  corpoDo404,
  corpoDoGuia,
  corpoDosGuias,
  corpoDoSobre,
  corpoDosPlanos,
  EMAIL_DE_CONTATO,
} from './paginas';
import { lerFlagsDoSite, planosDoSite, webApplicationJsonLd } from './planosDoSite';

/** O endereço do site quando o build não diz outro (canonical, sitemap, robots). */
export const URL_PADRAO_DO_SITE = 'https://frasy.com.br';

/**
 * A URL do site: `VITE_PUBLIC_URL` se for `https://` válida (sem barra final), senão a de produção. O
 * staging, que tem a própria `VITE_PUBLIC_URL`, sai com canonical do staging — e é `noindex` pelo Worker.
 */
export function urlDoSite(env: Record<string, string | undefined>): string {
  const bruta = (env.VITE_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  try {
    if (bruta && new URL(bruta).protocol === 'https:') return bruta;
  } catch {
    /* inválida: a padrão */
  }
  return URL_PADRAO_DO_SITE;
}

/** O id do AdSense no formato do `ads.txt` (`pub-` + dígitos), ou `null`. Aceita `ca-pub-…`. */
export function idDoAdsense(valor: string | undefined): string | null {
  const v = (valor ?? '').trim().replace(/^ca-/, '');
  return /^pub-\d{10,20}$/.test(v) ? v : null;
}

export interface OpcoesDoSite {
  urlDoSite: string;
  guias: Guia[];
  /** Flags de venda ligadas (`SITE_FLAGS_DE_VENDA`). */
  flags: Set<string>;
  adsensePubId: string | null;
  versaoDaFonte: string;
}

/** As páginas indexáveis, na ordem do sitemap: [caminho, arquivo]. */
const FIXAS: [string, string][] = [
  ['/', 'inicio.html'],
  ['/planos', 'planos.html'],
  ['/guias', 'guias.html'],
  ['/ajuda', 'ajuda.html'],
  ['/sobre', 'sobre.html'],
  ['/contato', 'contato.html'],
];

/** As páginas escritas à mão em `public/` que também entram no sitemap. */
const DE_PUBLIC = ['/privacidade', '/termos'];

function sitemap(url: string, guias: Guia[]): string {
  const entradas = [
    ...FIXAS.map(([c]) => ({ loc: `${url}${c}`, lastmod: undefined as string | undefined })),
    ...DE_PUBLIC.map((c) => ({ loc: `${url}${c}`, lastmod: undefined as string | undefined })),
    ...guias.map((g) => ({ loc: `${url}/guias/${g.slug}`, lastmod: g.publicado })),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entradas
      .map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
      .join('\n') +
    '\n</urlset>\n'
  );
}

/** O `robots.txt` da produção (fora dela, o Worker responde `Disallow: /`). */
export function robots(url: string): string {
  return `User-agent: *\nDisallow: /api/\nDisallow: /app\nDisallow: /auth/\n\nSitemap: ${url}/sitemap.xml\n`;
}

/** Todos os arquivos do site: caminho relativo a `dist/` → conteúdo. */
export function gerarSite(o: OpcoesDoSite): Map<string, string> {
  const url = o.urlDoSite;
  const base = { urlDoSite: url, versaoDaFonte: o.versaoDaFonte };
  const planos = planosDoSite(o.flags);
  const arquivos = new Map<string, string>();
  const organizacao = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Frasy',
    url: `${url}/`,
    logo: `${url}/icones/icone-512.png`,
    email: EMAIL_DE_CONTATO,
  };

  arquivos.set(
    'inicio.html',
    pagina({
      ...base,
      caminho: '/',
      titulo: 'Frasy: aprenda idiomas com o que você já assiste e escuta',
      descricao:
        'Legenda e tradução ao vivo em vídeos, aulas, podcasts e chamadas, rodando no seu navegador. As palavras que você salva viram revisão espaçada e jogos curtos.',
      corpo: corpoDaHome(o.guias),
      jsonLd: [
        organizacao,
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Frasy', url: `${url}/`, inLanguage: 'pt-BR' },
      ],
    }),
  );
  arquivos.set(
    'planos.html',
    pagina({
      ...base,
      caminho: '/planos',
      atual: '/planos',
      titulo: 'Planos e preços | Frasy',
      descricao:
        'O que roda no seu aparelho é grátis. Veja o que os planos pagos acrescentam, quanto custam e como funciona o teste sem cartão.',
      corpo: corpoDosPlanos(planos),
      jsonLd: [webApplicationJsonLd(planos, url)],
    }),
  );
  arquivos.set(
    'sobre.html',
    pagina({
      ...base,
      caminho: '/sobre',
      atual: '/sobre',
      titulo: 'Sobre o Frasy',
      descricao:
        'Por que o Frasy existe, no que acreditamos (seu aparelho primeiro, nuvem só quando você pede, estudo sem pressão) e quem faz.',
      corpo: corpoDoSobre(),
      jsonLd: [organizacao],
    }),
  );
  arquivos.set(
    'contato.html',
    pagina({
      ...base,
      caminho: '/contato',
      titulo: 'Contato | Frasy',
      descricao: `Fale com o Frasy pelo e-mail ${EMAIL_DE_CONTATO}: suporte, pagamento, privacidade e pedidos sobre seus dados.`,
      corpo: corpoDoContato(),
    }),
  );
  arquivos.set(
    'ajuda.html',
    pagina({
      ...base,
      caminho: '/ajuda',
      atual: '/ajuda',
      titulo: 'Ajuda | Frasy',
      descricao:
        'Perguntas frequentes sobre o Frasy: navegadores, como colocar legenda num vídeo, o que roda no aparelho, revisão, Anki, planos e privacidade.',
      corpo: corpoDaAjuda(),
    }),
  );
  arquivos.set(
    'guias.html',
    pagina({
      ...base,
      caminho: '/guias',
      atual: '/guias',
      titulo: 'Guias para aprender idiomas | Frasy',
      descricao:
        'Guias práticos para aprender idiomas com séries, podcasts, músicas e conversas, e para fazer a revisão espaçada trabalhar a seu favor.',
      corpo: corpoDosGuias(o.guias),
    }),
  );
  for (const g of o.guias) {
    arquivos.set(
      `guias/${g.slug}.html`,
      pagina({
        ...base,
        caminho: `/guias/${g.slug}`,
        atual: '/guias',
        tipoOg: 'article',
        titulo: `${g.titulo} | Frasy`,
        descricao: g.descricao,
        corpo: corpoDoGuia(g, o.guias),
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: g.titulo,
            description: g.descricao,
            datePublished: g.publicado,
            inLanguage: 'pt-BR',
            keywords: g.palavrasChave.join(', '),
            mainEntityOfPage: `${url}/guias/${g.slug}`,
            author: { '@type': 'Organization', name: 'Frasy', url: `${url}/` },
            publisher: { '@type': 'Organization', name: 'Frasy', logo: `${url}/icones/icone-512.png` },
          },
        ],
      }),
    );
  }
  arquivos.set(
    '404.html',
    pagina({
      ...base,
      caminho: null,
      naoIndexar: true,
      titulo: 'Página não encontrada | Frasy',
      descricao: 'Este endereço não existe no Frasy.',
      corpo: corpoDo404(),
    }),
  );
  arquivos.set('sitemap.xml', sitemap(url, o.guias));
  arquivos.set('robots.txt', robots(url));
  if (o.adsensePubId) arquivos.set('ads.txt', `google.com, ${o.adsensePubId}, DIRECT, f08c47fec0942fa0\n`);
  return arquivos;
}

/** As opções a partir do ambiente do build e da pasta dos guias. */
export function opcoesDoAmbiente(
  env: Record<string, string | undefined>,
  pastaDosGuias: string,
  versaoDaFonte: string,
): { opcoes: OpcoesDoSite; ignorados: { arquivo: string; motivo: string }[] } {
  const { publicados, ignorados } = lerGuias(pastaDosGuias);
  return {
    opcoes: {
      urlDoSite: urlDoSite(env),
      guias: publicados,
      flags: lerFlagsDoSite(env.SITE_FLAGS_DE_VENDA),
      adsensePubId: idDoAdsense(env.ADSENSE_PUB_ID),
      versaoDaFonte,
    },
    ignorados,
  };
}
