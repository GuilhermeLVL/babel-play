/**
 * O ESQUELETO DO INÍCIO NO HTML DO `/app` (carga-rapida-no-celular, 2.4).
 *
 * No celular com 4G lento (Lighthouse com estrangulamento real: 1,6 Mbps, 562 ms por ida e volta, CPU 4×), o
 * Início dependia de três levas de rede: o HTML, o JS de entrada (~150 KB) e os pedaços da casca e do Início.
 * Só a segunda já terminava perto de 2,7 s; a auditoria de 17/11/2026 mediu LCP de 7,4 s. Nenhum corte de JS
 * cabe na meta de 2,5 s com três levas.
 *
 * Então o HTML do app já traz o Início que o visitante vê na primeira visita (o cabeçalho, os quatro caminhos e
 * a barra de baixo), com CSS em linha (a CSP aceita `style` em linha; `script` em linha, não). Os caminhos são
 * LINKS de verdade (`/app/capturar`…): um toque antes de o JS chegar abre a tela pela navegação comum. Quando o
 * React desenha o Início (ou qualquer outra tela), `src/lib/esqueleto.ts` tira o esqueleto.
 *
 * QUEM VÊ. Um script externo pequeno (`/assets/esqueleto-<hash>.js`, logo depois do esqueleto; o mesmo domínio,
 * que a CSP aceita) decide antes da primeira pintura: só o visitante do Início (`/app`), sem sessão guardada,
 * sem `?ui=`, sem tema, modo escuro ou perfil escolhidos, numa janela de celular. Para os outros ele some antes de
 * aparecer: quem tem conta ou outra aparência veria um Início diferente do seu.
 *
 * O LCP. O texto do cartão "Legendar agora" é o mesmo, na mesma fonte e nas mesmas medidas do Início de verdade
 * (Inter 600 16/21,6 px, 334 px de largura no Pixel/Moto do Lighthouse). A fonte do esqueleto usa
 * `font-display: block` (o mesmo arquivo pré-carregado): ele pinta já com a Inter, e o Início que chega depois
 * não é maior, então não vira um LCP novo. Os títulos usam a Inter também (a Archivo disputaria a banda com ela).
 *
 * Só no build do modo público (Worker: `VITE_AUTH_REQUIRED=1` com Supabase). Self-host, dev, testes e a edição
 * estática não têm esqueleto.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { Plugin } from 'vite';

interface ItemDoBundle {
  type: 'chunk' | 'asset';
  fileName: string;
  name?: string;
  names?: string[];
}

type NoDoIcone = [string, Record<string, string>][];

const exigir = createRequire(import.meta.url);

/** O SVG de um ícone do lucide (o mesmo desenho do app), sem React. */
export function svgDoIcone(no: NoDoIcone, classe = ''): string {
  const filhos = no
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return `<svg${classe ? ` class="${classe}"` : ''} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${filhos}</svg>`;
}

function icone(nome: string): string {
  const arquivo = exigir.resolve(`lucide-react/dist/esm/icons/${nome}.js`);
  const fonte = readFileSync(arquivo, 'utf8');
  const corpo = /const __iconNode = (\[[\s\S]*?\]);\n/.exec(fonte)?.[1];
  if (!corpo) throw new Error(`ícone ${nome} sem __iconNode`);
  /* Lido como DADO (sem avaliar código): `["path", { d: "…", key: "…" }]`. */
  const no: NoDoIcone = [...corpo.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)].map(([, tag, attrs]) => [
    tag,
    Object.fromEntries([...attrs.matchAll(/([\w-]+): "([^"]*)"/g)].map(([, k, v]) => [k, v])),
  ]);
  if (!no.length) throw new Error(`ícone ${nome} ilegível`);
  return svgDoIcone(no);
}

/**
 * Mostrar o esqueleto? Pura: roda NO NAVEGADOR (vai para o script pelo `toString()`) e no teste. Só o visitante da
 * primeira visita, no Início, com a aparência padrão: é o Início que ele vai ver quando o React chegar.
 */
export function mostrarEsqueleto(s: {
  caminho: string;
  busca: string;
  chaves: string[];
  ler: (k: string) => string | null;
  larguraPx: number;
}): boolean {
  const caminho = s.caminho.replace(/\/+$/, '');
  if (caminho !== '/app') return false;
  if (/[?&]ui=/.test(s.busca)) return false;
  if (s.larguraPx > 720) return false;
  if (s.chaves.some((k) => k.indexOf('sb-') === 0 && /-auth-token$/.test(k))) return false;
  if (s.ler('theme') === 'dark') return false;
  const tema = s.ler('app_theme');
  if (tema && tema !== 'babel') return false;
  const fonte = s.ler('app_fonte');
  if (fonte && fonte !== 'padrao') return false;
  const perfil = s.ler('babel.age_profile');
  if (perfil && perfil !== 'pro') return false;
  return true;
}

/** O script que decide antes da primeira pintura (sem `script` em linha: a CSP só aceita do próprio domínio). */
export function scriptDoEsqueleto(): string {
  return `(function(){var mostrar=${mostrarEsqueleto.toString()};
var e=document.getElementById('esqueleto');if(!e)return;var ok=false;
try{var ls=window.localStorage;ok=mostrar({caminho:location.pathname,busca:location.search,chaves:Object.keys(ls),ler:function(k){return ls.getItem(k)},larguraPx:window.innerWidth});}catch(_){ok=false}
if(!ok){e.parentNode.removeChild(e);return}
var h=new Date().getHours();var s=e.querySelector('.esq-sobre');if(s)s.textContent=h<5?'Boa noite':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
document.documentElement.setAttribute('data-esqueleto','');})();`;
}

/** O HTML e o CSS do esqueleto, com as URLs das fontes do build. */
export function htmlDoEsqueleto(fontes: { inter: string }): string {
  const mic = icone('mic');
  const css = `
@font-face{font-family:'Inter Esq';font-style:normal;font-weight:100 900;font-display:block;src:url(${fontes.inter}) format('woff2')}
#esqueleto{visibility:hidden;position:fixed;inset:0;z-index:5;overflow:hidden;background:#d9d5c8;color:#26241f;font:400 14px/21px 'Inter Esq',sans-serif;-webkit-font-smoothing:antialiased}
#esqueleto a{color:inherit;text-decoration:none}
#esqueleto svg{width:24px;height:24px}
.esq-palco{display:flex;flex-direction:column;gap:16px;padding:18px 18px 156px}
.esq-cab{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:108px}
.esq-sobre{margin:0 0 6px;font:700 14px/14px ui-monospace,'Courier New',monospace;letter-spacing:1.12px;text-transform:uppercase;color:#a82e0d}
.esq-cab h1{margin:0;font:900 28px/29.4px 'Inter Esq',sans-serif;letter-spacing:-0.616px;max-width:160px}
.esq-chip{flex:none;display:flex;align-items:center;gap:8px;height:44px;padding:0 18px;border:1px solid #db8768;border-radius:999px;background:#edeae0;font:700 16px/16px 'Inter Esq',sans-serif}
.esq-chip svg{width:20px;height:20px}
.esq-grade{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.esq-tile{position:relative;display:grid;gap:10px;align-content:start;justify-items:start;padding:20px;border:1px solid #c6bfac;border-radius:20px;background:#edeae0;box-shadow:0 1px 0 0 rgba(255,255,255,.55) inset,0 1px 2px 0 rgba(38,36,31,.05),0 8px 18px -12px rgba(38,36,31,.22)}
.esq-tile b{font:800 20px/23px 'Inter Esq',sans-serif;letter-spacing:-0.24px}
.esq-d{display:block;font:600 14px/18.9px 'Inter Esq',sans-serif;color:#5e5a50}
.esq-ic{display:grid;place-items:center;width:46px;height:46px;border-radius:13px;background:#fbddd3}
.esq-pri{grid-column:1/-1;min-height:148px;border-color:transparent;background:linear-gradient(135deg,#f26c47,#ef5225);color:#3d1105}
.esq-pri .esq-ic{background:rgba(61,17,5,.22)}
.esq-pri .esq-d{font-size:16px;line-height:21.6px;color:#3d1105}
.esq-larga{grid-column:1/-1;grid-template-columns:46px 1fr;gap:2px 14px;padding:16px;align-items:center}
.esq-larga .esq-ic{grid-row:1/3}
.esq-barra{position:absolute;left:12px;right:12px;bottom:12px;height:68px;display:flex;align-items:center;justify-content:space-around;padding:6px 8px;border:1px solid rgba(198,191,172,.7);border-radius:26px;background:rgba(237,234,224,.92);box-shadow:0 1px 0 0 rgba(255,255,255,.5) inset,0 18px 40px -14px rgba(0,0,0,.45)}
.esq-barra span{display:grid;justify-items:center;gap:2px;font:600 12px/14px 'Inter Esq',sans-serif;color:#5e5a50}
.esq-barra .esq-mic{display:grid;place-items:center;width:64px;height:64px;margin-top:-30px;border-radius:50%;background:linear-gradient(135deg,#f26c47,#ef5225);color:#3d1105;box-shadow:0 0 0 8px #e7e3d7}
html[data-esqueleto] #esqueleto{visibility:visible}
html[data-esqueleto] #root{visibility:hidden}
@media (min-width:721px){#esqueleto{display:none}}
`.replace(/\n/g, '');
  const tile = (href: string, ic: string, titulo: string, d: string, classe = '') =>
    `<a class="esq-tile${classe}" href="${href}"><span class="esq-ic">${icone(ic)}</span><b>${titulo}</b><span class="esq-d">${d}</span></a>`;
  return (
    `<style>${css}</style>` +
    `<div id="esqueleto"><div class="esq-palco">` +
    `<div class="esq-cab"><div><p class="esq-sobre">Olá</p><h1>O que vamos fazer?</h1></div>` +
    `<a class="esq-chip" href="/app/plano">${icone('sparkles')} Grátis · Ver planos</a></div>` +
    `<div class="esq-grade">` +
    `<a class="esq-tile esq-pri" href="/app/capturar"><span class="esq-ic">${mic}</span><b>Legendar agora</b><span class="esq-d">Vídeo, jogo, aula ou conversa, com tradução ao vivo.</span></a>` +
    tile(
      '/app/cartoes',
      'layers',
      'Cartões',
      'Guarde palavras e o app traz cada uma de volta na hora certa.',
      ' esq-larga',
    ) +
    tile('/app/interprete', 'languages', 'Conversar', 'Intérprete frente a frente: cada pessoa fala no seu idioma.') +
    tile('/app/jogar', 'gamepad-2', 'Jogar', 'Jogos com as palavras das suas sessões.') +
    `</div></div>` +
    `<div class="esq-barra" aria-hidden="true"><span>${icone('layout-dashboard')}Início</span><span>${icone('layers')}Cartões</span><span class="esq-mic">${mic}</span><span>${icone('gamepad-2')}Jogar</span><span>${icone('ellipsis')}Mais</span></div>` +
    `</div>`
  );
}

/**
 * Põe o esqueleto logo depois do `#root` e LEVA A FOLHA DE ESTILO DO APP PARA DEPOIS DELE. No `<head>` ela bloqueia
 * a primeira pintura até chegar (43 KB no 4G lento, ~2 s); no `<body>`, o Chrome pinta o que vem antes dela. O
 * esqueleto tem o próprio CSS em linha e o `#root` está vazio (e escondido), então nada aparece sem estilo; o
 * React só monta depois do JS de entrada, que chega depois da folha. Pura, para o teste.
 */
export function comEsqueleto(html: string, bloco: string): string {
  if (!html.includes('<div id="root"></div>')) throw new Error('esqueleto do Início: sem <div id="root"></div>');
  const folhas = [...html.matchAll(/\s*<link rel="stylesheet"[^>]*href="[^"]*\/assets\/[^"]+\.css"[^>]*>/g)].map(
    (m) => m[0],
  );
  let saida = html;
  for (const f of folhas) saida = saida.replace(f, '');
  return saida.replace('<div id="root"></div>', `<div id="root"></div>${bloco}${folhas.map((f) => f.trim()).join('')}`);
}

const FONTES = {
  inter: /^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/,
};

export function esqueletoDoInicio(ativo: boolean): Plugin {
  let base = '/';
  return {
    name: 'esqueleto-do-inicio',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    buildStart() {
      if (ativo) this.emitFile({ type: 'asset', name: 'esqueleto.js', source: scriptDoEsqueleto() });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ativo || !ctx.bundle) return html;
        const itens = Object.values(ctx.bundle as Record<string, ItemDoBundle>);
        const achar = (re: RegExp) => itens.find((i) => i.type === 'asset' && re.test(i.fileName))?.fileName;
        const inter = achar(FONTES.inter);
        const script = itens.find(
          (i) => i.type === 'asset' && (i.name === 'esqueleto.js' || i.names?.includes('esqueleto.js')),
        )?.fileName;
        if (!inter || !script) throw new Error('esqueleto do Início: faltam as fontes ou o script no bundle');
        const bloco = `${htmlDoEsqueleto({ inter: base + inter })}<script src="${base}${script}"></script>`;
        return comEsqueleto(html, bloco);
      },
    },
  };
}
