/**
 * O LAYOUT DO SITE PÚBLICO — o `<head>` (título, descrição, canonical, Open Graph, JSON-LD), o cabeçalho,
 * o rodapé e o CSS, iguais em todas as páginas estáticas (`scripts/site/gerar.ts`).
 *
 * Páginas LEVES: nada do bundle do app, nenhum JavaScript, CSS em linha (a CSP do app já permite
 * `style-src 'unsafe-inline'`) e uma fonte só, servida do próprio domínio e pré-carregada. O JSON-LD é
 * `application/ld+json`: bloco de dados, que o navegador não executa (a CSP não se aplica a ele).
 *
 * Quem quiser o mesmo cabeçalho e rodapé numa página escrita à mão (`public/privacidade.html`,
 * `public/termos.html`) copia `cabecalho()`/`rodape()` e o `CSS` daqui.
 */
import { escaparHtml } from './markdown';

/** O caminho público da fonte (com a versão do pacote no nome: o cache pode ser `immutable`). */
export const caminhoDaFonte = (versao: string): string => `/fontes/archivo-${versao}.woff2`;

export interface OpcoesDaPagina {
  /** Caminho público da página (`/`, `/planos`, `/guias/x`). `null` = sem canonical (a 404). */
  caminho: string | null;
  titulo: string;
  descricao: string;
  /** O HTML de dentro de `<main>`. */
  corpo: string;
  urlDoSite: string;
  versaoDaFonte: string;
  /** Objetos JSON-LD (cada um vira um `<script type="application/ld+json">`). */
  jsonLd?: object[];
  /** `og:type` (padrão `website`; guia = `article`). */
  tipoOg?: 'website' | 'article';
  /** A 404 não deve ser indexada. */
  naoIndexar?: boolean;
  /** Item do menu marcado como página atual. */
  atual?: string;
}

export const CSS = `
@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-display:swap;src:url(%FONTE%) format("woff2")}
:root{color-scheme:light dark;--fundo:#F5F2EA;--painel:#FFFDF8;--tinta:#26241F;--suave:#5E5A50;--borda:#D8D1BF;--acento:#C93A15;--acento-tinta:#fff;--acento-suave:#FBDDD3;--bom:#3E6B44}
@media (prefers-color-scheme:dark){:root{--fundo:#1B1A17;--painel:#24221E;--tinta:#EDE9DF;--suave:#BDB6A6;--borda:#3A372F;--acento:#FF8A65;--acento-tinta:#1B1A17;--acento-suave:#3B2A22;--bom:#9AD29A}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--fundo);color:var(--tinta);font:17px/1.6 Archivo,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--acento);text-underline-offset:.15em}
a:focus-visible,.botao:focus-visible{outline:3px solid var(--acento);outline-offset:2px}
.pular{position:absolute;left:-999px;top:0;background:var(--painel);padding:8px 12px;z-index:2}
.pular:focus{left:8px}
.largura{max-width:1080px;margin:0 auto;padding:0 20px}
.topo{border-bottom:1px solid var(--borda)}
.topo .largura{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;min-height:64px;padding-top:8px;padding-bottom:8px}
.marca{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:20px;color:var(--tinta);text-decoration:none;margin-right:auto}
.marca img{width:28px;height:28px}
.menu{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:0;padding:0;list-style:none}
.menu a{display:inline-block;padding:10px 10px;color:var(--tinta);text-decoration:none;border-radius:8px;font-weight:600;font-size:16px}
.menu a:hover,.menu a[aria-current=page]{background:var(--acento-suave)}
.botao{display:inline-block;padding:12px 20px;border-radius:10px;background:var(--acento);color:var(--acento-tinta);font-weight:700;text-decoration:none;border:2px solid var(--acento)}
.botao.contorno{background:transparent;color:var(--acento)}
.menu .botao{padding:9px 16px;color:var(--acento-tinta)}
.menu .botao:hover{background:var(--acento)}
main{display:block;padding:40px 0 64px}
h1,h2,h3{line-height:1.2;letter-spacing:-.01em}
h1{font-size:clamp(32px,6vw,52px);margin:0 0 16px;font-weight:800}
h2{font-size:clamp(24px,3.6vw,32px);margin:48px 0 12px;font-weight:800}
h3{font-size:20px;margin:24px 0 8px}
.lead{font-size:clamp(18px,2.4vw,21px);color:var(--suave);max-width:46em;margin:0 0 24px}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0 8px}
.nota{font-size:15px;color:var(--suave)}
.grade{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:20px 0}
.cartao{background:var(--painel);border:1px solid var(--borda);border-radius:14px;padding:20px}
.cartao h3{margin-top:0}
.cartao p{margin:0}
.passos{counter-reset:p;list-style:none;padding:0;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.passos li{background:var(--painel);border:1px solid var(--borda);border-radius:14px;padding:20px 20px 20px 64px;position:relative}
.passos li::before{counter-increment:p;content:counter(p);position:absolute;left:20px;top:18px;width:32px;height:32px;border-radius:50%;background:var(--acento);color:var(--acento-tinta);font-weight:800;display:grid;place-items:center}
.texto{max-width:44em}
.texto li{margin:6px 0}
.planos{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:24px 0}
.plano{background:var(--painel);border:1px solid var(--borda);border-radius:16px;padding:24px;display:flex;flex-direction:column}
.plano h2{margin:0 0 4px;font-size:26px}
.preco{font-size:34px;font-weight:800;margin:8px 0 0}
.preco small{font-size:16px;font-weight:600;color:var(--suave)}
.plano ul{padding-left:20px;margin:16px 0}
.plano .botao{margin-top:auto;text-align:center}
.tabela{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:16px}
th,td{text-align:left;padding:10px;border-bottom:1px solid var(--borda);vertical-align:top}
details{background:var(--painel);border:1px solid var(--borda);border-radius:12px;padding:4px 16px;margin:10px 0}
summary{cursor:pointer;font-weight:700;padding:12px 0}
blockquote{margin:16px 0;padding:4px 16px;border-left:4px solid var(--acento-suave);color:var(--suave)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--painel);border:1px solid var(--borda);border-radius:4px;padding:1px 5px}
pre{overflow-x:auto;background:var(--painel);border:1px solid var(--borda);border-radius:10px;padding:14px}
pre code{border:0;padding:0}
.lista-guias{list-style:none;padding:0;display:grid;gap:14px}
.lista-guias a{font-weight:700;font-size:19px}
.lista-guias p{margin:4px 0 0;color:var(--suave)}
.meta{color:var(--suave);font-size:15px;margin:0 0 24px}
.rodape{border-top:1px solid var(--borda);padding:28px 0 40px;font-size:15px;color:var(--suave)}
.rodape ul{display:flex;flex-wrap:wrap;gap:4px 8px;list-style:none;margin:0 0 12px;padding:0}
.rodape a{display:inline-block;padding:8px 6px;color:var(--tinta)}
@media (max-width:480px){.largura{padding:0 16px}.topo .largura{gap:4px 12px}.menu{gap:2px}.menu a{padding:10px 6px;font-size:15px}.menu .botao{padding:8px 12px}.passos li h3{margin-top:4px}}
`
  .trim()
  .replace(/\n/g, '');

/** O menu do topo: [caminho, rótulo]. */
const MENU: [string, string][] = [
  ['/planos', 'Planos'],
  ['/guias', 'Guias'],
  ['/ajuda', 'Ajuda'],
  ['/sobre', 'Sobre'],
];

/** O rodapé: [caminho, rótulo]. */
const RODAPE: [string, string][] = [
  ['/sobre', 'Sobre'],
  ['/contato', 'Contato'],
  ['/ajuda', 'Ajuda'],
  ['/guias', 'Guias'],
  ['/planos', 'Planos'],
  ['/privacidade', 'Privacidade'],
  ['/termos', 'Termos de uso'],
];

export function cabecalho(atual?: string): string {
  const itens = MENU.map(
    ([href, rotulo]) => `<li><a href="${href}"${href === atual ? ' aria-current="page"' : ''}>${rotulo}</a></li>`,
  ).join('');
  return (
    `<header class="topo"><div class="largura">` +
    `<a class="marca" href="/"><img src="/favicon.svg" alt="" width="28" height="28">Frasy</a>` +
    `<nav aria-label="Principal"><ul class="menu">${itens}<li><a class="botao" href="/app">Entrar</a></li></ul></nav>` +
    `</div></header>`
  );
}

export function rodape(): string {
  const itens = RODAPE.map(([href, rotulo]) => `<li><a href="${href}">${rotulo}</a></li>`).join('');
  return (
    `<footer class="rodape"><div class="largura">` +
    `<nav aria-label="Rodapé"><ul>${itens}</ul></nav>` +
    `<p>Frasy: aprenda idiomas com o que você já assiste e escuta. Contato: <a href="mailto:contato@frasy.com.br">contato@frasy.com.br</a></p>` +
    `</div></footer>`
  );
}

/** JSON dentro de `<script>`: `<` escapado, para nenhum texto fechar a tag. */
const jsonSeguro = (o: object): string => JSON.stringify(o).replace(/</g, '\\u003c');

export function pagina(o: OpcoesDaPagina): string {
  const url = o.caminho === null ? null : `${o.urlDoSite}${o.caminho === '/' ? '/' : o.caminho}`;
  const titulo = escaparHtml(o.titulo);
  const descricao = escaparHtml(o.descricao);
  const fonte = caminhoDaFonte(o.versaoDaFonte);
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titulo}</title>`,
    `<meta name="description" content="${descricao}">`,
    o.naoIndexar ? '<meta name="robots" content="noindex">' : '',
    url ? `<link rel="canonical" href="${escaparHtml(url)}">` : '',
    '<meta name="theme-color" content="#26241F">',
    `<link rel="preload" href="${fonte}" as="font" type="font/woff2" crossorigin>`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="/icones/favicon-48.png" type="image/png" sizes="48x48">',
    '<link rel="apple-touch-icon" href="/icones/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta property="og:type" content="${o.tipoOg ?? 'website'}">`,
    '<meta property="og:site_name" content="Frasy">',
    '<meta property="og:locale" content="pt_BR">',
    `<meta property="og:title" content="${titulo}">`,
    `<meta property="og:description" content="${descricao}">`,
    url ? `<meta property="og:url" content="${escaparHtml(url)}">` : '',
    `<meta property="og:image" content="${escaparHtml(o.urlDoSite)}/og.png">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<style>${CSS.replace('%FONTE%', fonte)}</style>`,
    ...(o.jsonLd ?? []).map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`),
  ].filter(Boolean);
  return (
    `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head.join('\n')}\n</head>\n<body>\n` +
    `<a class="pular" href="#conteudo">Pular para o conteúdo</a>\n` +
    `${cabecalho(o.atual)}\n<main id="conteudo"><div class="largura">\n${o.corpo}\n</div></main>\n${rodape()}\n</body>\n</html>\n`
  );
}
