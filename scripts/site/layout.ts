/**
 * O LAYOUT DO SITE PÚBLICO — o `<head>` (título, descrição, canonical, Open Graph, JSON-LD), o cabeçalho,
 * o rodapé e o CSS, iguais em todas as páginas estáticas (`scripts/site/gerar.ts`).
 *
 * Páginas LEVES: nada do bundle do app, nenhum JavaScript, CSS em linha (a CSP do app já permite
 * `style-src 'unsafe-inline'`) e as duas fontes do app (Archivo nos títulos, Inter no texto), servidas do
 * próprio domínio e pré-carregadas. O JSON-LD é `application/ld+json`: bloco de dados, que o navegador não
 * executa (a CSP não se aplica a ele).
 *
 * A IDENTIDADE é a do app (`src/index.css`, tema padrão "babel"): papel, tinta, o vermelhão só em ação e
 * destaque, e o amarelo e o verde do logo só como o marca-texto da palavra salva. O escuro espelha o
 * `.dark` do app, por `prefers-color-scheme`. A única animação que roda sozinha é a da legenda da home
 * (CSS puro, uma vez; com `prefers-reduced-motion`, o quadro final parado).
 *
 * As páginas escritas à mão (`public/privacidade.html`, `public/termos.html`) recebem este mesmo layout no
 * build (`paginaLegal` em `gerar.ts`): o texto delas não muda, só a moldura.
 */
import { escaparHtml } from './markdown';

/** O caminho público da fonte dos títulos (com a versão do pacote no nome: o cache pode ser `immutable`). */
export const caminhoDaFonte = (versao: string): string => `/fontes/archivo-${versao}.woff2`;
/** O caminho público da fonte do texto (Inter), no mesmo esquema. */
export const caminhoDaFonteDoTexto = (versao: string): string => `/fontes/inter-${versao}.woff2`;

export interface OpcoesDaPagina {
  /** Caminho público da página (`/`, `/planos`, `/guias/x`). `null` = sem canonical (a 404). */
  caminho: string | null;
  titulo: string;
  descricao: string;
  /** O HTML de dentro de `<main>`. */
  corpo: string;
  urlDoSite: string;
  versaoDaFonte: string;
  /** Versão do pacote da Inter (padrão: a mesma da Archivo). */
  versaoDaFonteDoTexto?: string;
  /** Objetos JSON-LD (cada um vira um `<script type="application/ld+json">`). */
  jsonLd?: object[];
  /** `og:type` (padrão `website`; guia = `article`). */
  tipoOg?: 'website' | 'article';
  /** A 404 não deve ser indexada. */
  naoIndexar?: boolean;
  /** Item do menu (ou do rodapé) marcado como página atual. */
  atual?: string;
}

/*
 * O CSS, em blocos: tokens, base, moldura (topo e rodapé), tipografia, componentes e o que é de cada
 * página. Contraste (WCAG AA) conferido nos dois modos: tinta/papel 12:1, suave/papel 5,3:1, branco sobre
 * o vermelhão de ação (#C93A15) 5,1:1, papel escuro sobre o vermelhão do escuro (#FF6B3D) 6,5:1.
 */
const CSS_BRUTO = `
@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-display:swap;src:url(%FONTE%) format("woff2")}
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(%FONTE_TEXTO%) format("woff2")}
:root{color-scheme:light dark;
--papel:#E6E2D6;--superficie:#F5F2EA;--superficie-2:#EBE7DB;--tinta:#26241F;--suave:#5E5A50;--borda:#C6BFAC;--borda-fraca:#D8D2C2;
--acento:#F04E23;--acento-2:#F86E44;--acao:#C93A15;--acao-tinta:#FFFFFF;--acento-texto:#A8300E;--acento-suave:#FBDDD3;
--marcador:#FFD166;--marcador-tinta:#26241F;--marcador-verde:#3E8E4E;
--tela:#221B15;--tela-tinta:#FFFFFF;--tela-suave:#F1E3D2;
--sombra:inset 0 1px 0 rgba(255,255,255,.6),0 2px 5px rgba(38,36,31,.08);
--sombra-alta:inset 0 1px 0 rgba(255,255,255,.7),0 2px 4px rgba(38,36,31,.06),0 16px 36px -14px rgba(38,36,31,.28);
--titulo:Archivo,"Arial Narrow",system-ui,sans-serif;--texto:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
--ease:cubic-bezier(.16,1,.3,1);--raio:16px;--raio-btn:12px}
@media (prefers-color-scheme:dark){:root{
--papel:#17130F;--superficie:#211C17;--superficie-2:#2B251F;--tinta:#F3ECE0;--suave:#B5AA98;--borda:#3A3229;--borda-fraca:#2E2721;
--acento:#FF6B3D;--acento-2:#FF8C66;--acao:#FF6B3D;--acao-tinta:#17130F;--acento-texto:#FF8C66;--acento-suave:#3B2219;
--marcador-verde:#6DBE6F;--tela:#0F0C09;
--sombra:inset 0 1px 0 rgba(255,240,220,.04),0 1px 2px rgba(0,0,0,.35),0 6px 18px -8px rgba(0,0,0,.55);
--sombra-alta:inset 0 1px 0 rgba(255,240,220,.05),0 2px 4px rgba(0,0,0,.35),0 18px 40px -14px rgba(0,0,0,.7)}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font:17px/1.6 var(--texto);-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
img,svg{display:block;max-width:100%}
a{color:var(--tinta);text-decoration-color:var(--acento);text-decoration-thickness:2px;text-underline-offset:.2em}
a:hover{color:var(--acento-texto)}
:focus-visible{outline:3px solid var(--acento);outline-offset:3px;border-radius:4px}
.pular{position:absolute;left:-999px;top:8px;background:var(--superficie);color:var(--tinta);padding:10px 14px;border-radius:10px;z-index:5}
.pular:focus{left:8px}
.so-leitor{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.largura{max-width:1160px;margin:0 auto;padding:0 24px}

.topo .largura{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px 28px;min-height:76px}
.marca{display:inline-flex;align-items:center;gap:10px;font:800 23px/1 var(--titulo);letter-spacing:-.03em;color:var(--tinta);text-decoration:none}
.marca:hover{color:var(--tinta)}
.marca img{width:30px;height:30px}
.menu{display:flex;flex-wrap:wrap;gap:2px 4px;margin:0;padding:0;list-style:none}
.menu a{display:inline-block;padding:10px 12px;color:var(--tinta);text-decoration:none;border-radius:10px;font-weight:550;font-size:16px}
.menu a:hover{background:var(--superficie-2);color:var(--tinta)}
.menu a[aria-current=page]{background:var(--superficie);box-shadow:inset 0 0 0 1.5px var(--borda)}
.botao{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:var(--raio-btn);background:var(--acao);color:var(--acao-tinta);font:700 16px/1.2 var(--texto);text-decoration:none;border:2px solid var(--acao);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 2px 0 rgba(0,0,0,.16);transition:transform .12s var(--ease),filter .12s}
.botao:hover{color:var(--acao-tinta);filter:brightness(1.06)}
.botao:active{transform:translateY(1px)}
.botao.contorno{background:transparent;color:var(--tinta);border-color:var(--borda);box-shadow:none}
.botao.contorno:hover{background:var(--superficie);color:var(--tinta)}
.topo .botao{min-height:44px;padding:0 18px}

main{display:block;padding:24px 0 96px}
h1,h2,h3{font-family:var(--titulo);font-weight:800;line-height:1.08;letter-spacing:-.025em;margin:0;text-wrap:balance}
h1{font-size:clamp(36px,5.4vw,58px);letter-spacing:-.035em;margin:0 0 18px}
h2{font-size:clamp(28px,3.4vw,40px);margin:0 0 14px}
h3{font-size:21px;letter-spacing:-.015em;margin:0 0 8px}
p{margin:0 0 16px}
.lead{font-size:clamp(18px,2vw,21px);line-height:1.5;color:var(--suave);max-width:36em;margin:0 0 28px;text-wrap:pretty}
.acoes{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 18px}
.nota,.muted,.revisao{font-size:15px;line-height:1.5;color:var(--suave)}
.cabeca{padding:40px 0 32px;max-width:46em}
.secao{padding:72px 0 0}
.secao>h2{max-width:20em}
.secao-lead{color:var(--suave);font-size:18px;max-width:38em;margin:0 0 36px}
.prosa{max-width:70ch}
.prosa h2{font-size:clamp(25px,2.8vw,31px);margin:44px 0 12px;scroll-margin-top:24px}
.prosa h3{margin:28px 0 8px}
.prosa ul,.prosa ol{padding-left:22px;margin:0 0 18px}
.prosa li{margin:6px 0}
.prosa li::marker{color:var(--suave)}
.prosa hr{border:0;border-top:1.5px solid var(--borda);margin:36px 0}
.tabela{overflow-x:auto;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:15.5px}
th,td{text-align:left;padding:12px 12px 12px 0;border-bottom:1px solid var(--borda);vertical-align:top}
th{font-weight:650}
blockquote{margin:20px 0;padding:2px 0 2px 18px;border-left:3px solid var(--acento);color:var(--suave)}
code,kbd{font-family:var(--mono);font-size:.86em;background:var(--superficie);border:1px solid var(--borda);border-radius:6px;padding:1px 6px}
kbd{border-bottom-width:2px}
pre{overflow-x:auto;background:var(--superficie);border:1px solid var(--borda);border-radius:12px;padding:16px}
pre code{border:0;padding:0;background:none}
details.pergunta{border-bottom:1px solid var(--borda)}
details.pergunta:first-of-type{border-top:1px solid var(--borda)}
details.pergunta summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;font-weight:650;font-size:17.5px}
details.pergunta summary::-webkit-details-marker{display:none}
details.pergunta summary::after{content:"";flex:none;width:11px;height:11px;margin-right:4px;border-right:2.5px solid var(--suave);border-bottom:2.5px solid var(--suave);transform:translateY(-3px) rotate(45deg);transition:transform .2s var(--ease)}
details.pergunta[open] summary::after{transform:translateY(3px) rotate(-135deg)}
details.pergunta p{margin:0;padding:0 0 20px;color:var(--suave);max-width:62ch}
.perguntas{max-width:52em;margin:0 0 48px}

.rodape{border-top:1.5px solid var(--borda);padding:40px 0 48px;font-size:15px;color:var(--suave)}
.rodape .largura{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px 40px;align-items:start}
.rodape .marca{font-size:20px;margin-bottom:12px}
.rodape .marca img{width:24px;height:24px}
.rodape p{margin:0;max-width:30em}
.rodape ul{display:flex;flex-wrap:wrap;gap:0 4px;list-style:none;margin:0;padding:0;justify-content:flex-end}
.rodape nav a{display:inline-block;padding:8px;color:var(--tinta);text-decoration:none;border-radius:8px}
.rodape nav a:hover{background:var(--superficie-2)}
.rodape nav a[aria-current=page]{text-decoration:underline;text-decoration-color:var(--acento);text-decoration-thickness:2px}

.peca{background:var(--superficie);border:1.5px solid var(--borda-fraca);border-radius:var(--raio);box-shadow:var(--sombra)}
.miudo{font:600 13px/1.3 var(--texto);color:var(--suave)}
.num{font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums;color:var(--suave)}
.marcado{background:var(--marcador);color:var(--marcador-tinta);border-radius:5px;padding:0 .16em;box-shadow:inset 0 -.12em 0 var(--marcador-verde)}

.heroi{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:48px;align-items:center;padding:40px 0 16px}
.heroi h1{font-size:clamp(42px,5.4vw,70px);line-height:.96;letter-spacing:-.045em;margin-bottom:24px}
.cena{position:relative;margin:0;container-type:inline-size;aspect-ratio:10/7.8}
.tela{position:relative;aspect-ratio:16/10.4;border-radius:22px;overflow:hidden;background:var(--tela);box-shadow:var(--sombra-alta),0 0 0 1px rgba(0,0,0,.08);color:var(--tela-tinta);width:90cqw}
.tela svg{position:absolute;inset:0;width:100%;height:100%}
.tela-topo{position:absolute;left:3.6cqw;right:3.6cqw;top:3.4cqw;display:flex;justify-content:space-between;gap:2cqw;font:600 2.6cqw/1 var(--texto)}
.tela-topo span{display:inline-flex;align-items:center;gap:1.4cqw;padding:1.5cqw 2.4cqw;border-radius:99px;background:rgba(15,12,9,.66);color:var(--tela-suave)}
.tela-topo i{width:1.5cqw;height:1.5cqw;border-radius:50%;background:var(--acento-2)}
.legenda{position:absolute;left:4cqw;right:4cqw;bottom:10.6cqw;text-align:center}
.legenda p{margin:0}
.fala{font:650 4.6cqw/1.4 var(--texto);letter-spacing:-.01em}
.fala>span{display:inline-block;padding:.5cqw .8cqw;background:rgba(15,12,9,.8)}
.fala>span:first-child{padding-left:1.8cqw;border-radius:1.4cqw 0 0 1.4cqw}
.fala>span:last-child{padding-right:1.8cqw;border-radius:0 1.4cqw 1.4cqw 0}
.traducao{margin-top:1.6cqw!important;font:500 3.5cqw/1.4 var(--texto);color:var(--tela-suave)}
.traducao span{padding:.4cqw 1.6cqw;border-radius:1.2cqw;background:rgba(15,12,9,.7)}
.fala .salva{background:var(--marcador);color:var(--marcador-tinta);border-radius:.8cqw;padding:0 .7cqw;box-shadow:inset 0 -.55cqw 0 var(--marcador-verde)}
.voo{--voo-x:31.6cqw;--voo-y:26.6cqw;position:absolute;z-index:3;left:38.8cqw;top:34.8cqw;font:650 4.6cqw/1.21 var(--texto);letter-spacing:-.01em;padding:0 .7cqw;border-radius:.8cqw;background:var(--marcador);color:var(--marcador-tinta);box-shadow:inset 0 -.55cqw 0 var(--marcador-verde),0 2cqw 4cqw -1cqw rgba(0,0,0,.45);opacity:0;pointer-events:none}
.tela-barra{position:absolute;left:3.6cqw;right:3.6cqw;bottom:3.4cqw;display:flex;align-items:center;gap:2.4cqw;font:500 2.5cqw/1 var(--mono);color:var(--tela-suave)}
.tela-barra b{flex:1;height:.8cqw;border-radius:9px;background:rgba(255,255,255,.22);overflow:hidden}
.tela-barra b::before{content:"";display:block;width:46%;height:100%;background:var(--acento-2)}
.pilha{position:absolute;right:0;bottom:0;width:33cqw;height:27cqw}
.carta{position:absolute;inset:0;border-radius:3cqw;background:var(--superficie);border:1.5px solid var(--borda);box-shadow:var(--sombra-alta)}
.carta.c1{transform:rotate(-8deg) translate(-2.4cqw,1.2cqw)}
.carta.c2{transform:rotate(4deg) translate(1cqw,-.4cqw)}
.carta.c3{display:flex;flex-direction:column;justify-content:space-between;padding:2.8cqw 3.2cqw}
.carta.c3 .miudo{font-size:2.5cqw}
.carta.c3 strong{font:800 5.6cqw/1.1 var(--titulo);letter-spacing:-.03em;align-self:flex-start;padding:0 .8cqw;border-radius:.8cqw;background:var(--marcador);color:var(--marcador-tinta);box-shadow:inset 0 -.6cqw 0 var(--marcador-verde)}
.carta.c3 em{font:500 2.9cqw/1.25 var(--texto);font-style:normal;color:var(--suave)}
.contagem{position:absolute;right:2cqw;top:-3.4cqw;z-index:2;display:flex;align-items:center;gap:1.2cqw;padding:1.2cqw 2.2cqw;border-radius:99px;background:var(--tinta);color:var(--papel);font:600 2.5cqw/1 var(--texto);box-shadow:var(--sombra)}
.contagem b{display:inline-grid;font:600 2.7cqw/1 var(--mono)}
.contagem b span{grid-area:1/1}
.contagem .antes{opacity:0}
@keyframes palavra{from{opacity:0;transform:translateY(.8cqw)}}
@keyframes surgir{from{opacity:0}}
@keyframes marcar{from{background-color:transparent;color:inherit;box-shadow:inset 0 0 0 var(--marcador-verde)}}
@keyframes voar{0%{opacity:0;transform:none}10%{opacity:1;transform:translateY(-1.4cqw) scale(1.08)}80%{opacity:1;transform:translate(var(--voo-x),var(--voo-y)) scale(1.2) rotate(-3deg)}100%{opacity:0;transform:translate(var(--voo-x),var(--voo-y)) scale(1.05)}}
@keyframes chegar{from{opacity:0;transform:translateY(-3cqw) rotate(-2deg)}}
@keyframes sair{from{opacity:1}to{opacity:0}}
@media (prefers-reduced-motion:no-preference){
.fala>span{animation:palavra .38s var(--ease) both}
.fala>span:nth-child(1){animation-delay:.5s}
.fala>span:nth-child(2){animation-delay:.82s}
.fala>span:nth-child(4){animation-delay:1.46s}
.fala>span:nth-child(5){animation-delay:1.78s}
.fala>span:nth-child(3){animation-delay:1.14s}
.fala .salva{animation:marcar .45s ease 3.1s both}
.traducao{animation:surgir .7s ease 2.3s both}
.voo{animation:voar 1.15s var(--ease) 3.65s both}
.carta.c3{animation:chegar .45s var(--ease) 4.55s both}
.contagem .antes{animation:sair .25s ease 4.75s backwards}
.contagem .depois{animation:palavra .35s var(--ease) 4.8s both}}

.passos{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}
.passos>li{display:flex;flex-direction:column}
.vinheta{min-height:264px;padding:20px;margin:0 0 22px;display:flex;flex-direction:column;justify-content:center;gap:10px}
.passo-n{display:flex;align-items:center;gap:12px;margin:0 0 14px;font:600 13px/1 var(--mono);color:var(--suave)}
.passo-n::after{content:"";flex:1;height:1.5px;background:var(--borda)}
.passos li>p:not(.passo-n){color:var(--suave);margin:0}
.opcao{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--borda-fraca);background:var(--papel);font-weight:600;font-size:15px}
.opcao.sim{border-color:var(--acento);background:var(--superficie);box-shadow:0 0 0 3px var(--acento-suave)}
.opcao svg{width:20px;height:20px;flex:none}
.bolha-legenda{background:var(--tela);color:var(--tela-tinta);border-radius:14px;padding:16px 16px 14px}
.bolha-legenda p{margin:0;font:600 17px/1.4 var(--texto);color:var(--tela-tinta)}
.bolha-legenda p+p{margin-top:6px;font-weight:500;font-size:15px;color:var(--tela-suave)}
.sublinhada{text-decoration:underline dotted var(--acento-2) 2px;text-underline-offset:.22em}
.popover{align-self:flex-start;margin:4px 0 0 18px;position:relative;display:flex;align-items:center;gap:14px;padding:10px 10px 10px 14px;border-radius:12px;background:var(--superficie);border:1.5px solid var(--borda);box-shadow:var(--sombra-alta);font-size:14.5px}
.popover::before{content:"";position:absolute;left:22px;top:-7.5px;width:12px;height:12px;background:inherit;border-left:1.5px solid var(--borda);border-top:1.5px solid var(--borda);transform:rotate(45deg)}
.popover b{display:block;font-weight:700}
.popover div span{display:block;color:var(--suave)}
.mini-btn{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:9px;background:var(--acao);color:var(--acao-tinta);font-weight:700;font-size:13.5px;white-space:nowrap}
.cartao-revisao{display:flex;flex-direction:column;gap:6px}
.cartao-revisao .palavra{align-self:flex-start;font:800 30px/1.1 var(--titulo);letter-spacing:-.03em;margin:6px 0 2px}
.cartao-revisao .sig{font-weight:650;margin:0}
.cartao-revisao .ex{font-size:14.5px;color:var(--suave);margin:0}
.respostas{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px}
.respostas span{display:grid;place-items:center;min-height:36px;border-radius:9px;background:var(--papel);border:1.5px solid var(--borda-fraca);font-size:13px;font-weight:650}
.respostas span:nth-child(3){border-color:var(--tinta)}
.topo-peca{display:flex;justify-content:space-between;align-items:center;gap:10px}
.topo-peca.sob{margin-bottom:12px}
.coluna{display:grid;gap:12px}
.coluna>p{margin:0}

.faixas{display:grid}
.faixa{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:24px 72px;align-items:center;padding:44px 0;border-top:1.5px solid var(--borda)}
.faixa:nth-child(even){grid-template-columns:minmax(0,6fr) minmax(0,5fr)}
.faixa:nth-child(even) .faixa-texto{order:2}
.faixa-texto{max-width:30em}
.faixa-texto h3{font-size:clamp(24px,2.6vw,30px);letter-spacing:-.025em;margin-bottom:12px}
.faixa-texto p{color:var(--suave);font-size:18px;margin:0}
.faixa-peca{padding:28px;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:12px}
.virar{position:relative;perspective:1200px;max-width:380px;width:100%;margin:0 auto}
.virar summary{display:block;list-style:none;cursor:pointer;position:relative;z-index:2;border-radius:18px}
.virar summary::-webkit-details-marker{display:none}
.face{display:flex;flex-direction:column;justify-content:space-between;gap:16px;min-height:196px;padding:22px 24px;border-radius:18px;background:var(--papel);border:1.5px solid var(--borda);box-shadow:var(--sombra-alta);backface-visibility:hidden;-webkit-backface-visibility:hidden;transition:transform .6s var(--ease)}
.face .palavra{align-self:flex-start;font:800 40px/1.05 var(--titulo);letter-spacing:-.035em}
.face .dica{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;color:var(--suave)}
.face .dica b{color:var(--acento-texto);font-weight:650}
.verso{position:absolute;inset:0;z-index:1;transform:rotateY(-180deg)}
.verso p{margin:0}
.verso .sig{font:750 26px/1.2 var(--titulo);letter-spacing:-.02em}
.virar[open] summary .face{transform:rotateY(180deg)}
.virar[open] .verso{transform:none}
@starting-style{.virar[open] .verso{transform:rotateY(-180deg)}}
.memoria{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.memoria span{aspect-ratio:1/1.1;display:grid;place-items:center;border-radius:12px;font:700 15px/1.1 var(--texto);text-align:center;padding:6px;background:var(--papel);border:1.5px solid var(--borda-fraca)}
.memoria .fechada{background:var(--superficie-2);border-style:dashed}
.memoria .par{color:var(--suave);font-weight:550;background:var(--superficie-2);border-color:transparent}
.memoria .aberta{border-color:var(--acento);background:var(--superficie);box-shadow:0 0 0 3px var(--acento-suave)}
.conversa{display:flex;flex-direction:column;gap:14px}
.fala-de{max-width:84%;padding:14px 16px;border-radius:18px;background:var(--papel);border:1.5px solid var(--borda-fraca)}
.fala-de p{margin:0;font-weight:600}
.fala-de p+p{margin-top:4px;font-weight:450;color:var(--suave);font-size:15px}
.fala-de .num{display:block;margin-bottom:4px;font-size:12px}
.fala-de.a{border-bottom-left-radius:6px}
.fala-de.b{align-self:flex-end;border-bottom-right-radius:6px;background:var(--tela);color:var(--tela-tinta);border-color:var(--tela)}
.fala-de.b p+p,.fala-de.b .num{color:var(--tela-suave)}
.voz{display:inline-flex;align-items:center;gap:8px;align-self:flex-end;font-size:13.5px;color:var(--suave)}
.voz svg{width:18px;height:18px}
.arquivos{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.arquivos li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:var(--papel);border:1.5px solid var(--borda-fraca)}
.arquivos .tipo{display:grid;place-items:center;min-width:48px;height:30px;padding:0 8px;border-radius:8px;background:var(--superficie-2);font:700 12px/1 var(--mono)}
.arquivos .nome{font-family:var(--mono);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.niveis{display:flex;flex-wrap:wrap;gap:8px}
.niveis span{min-width:50px;padding:9px 10px;text-align:center;border-radius:10px;border:1.5px solid var(--borda-fraca);background:var(--papel);font:700 14px/1 var(--mono)}
.niveis .feito{color:var(--suave)}
.niveis .agora{background:var(--tinta);border-color:var(--tinta);color:var(--papel)}
.barra-nivel{height:8px;border-radius:9px;background:var(--superficie-2);overflow:hidden}
.barra-nivel::before{content:"";display:block;width:38%;height:100%;border-radius:inherit;background:var(--acento)}
.palavras-nivel{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.palavras-nivel li{padding:6px 12px;border-radius:99px;background:var(--papel);border:1.5px solid var(--borda-fraca);font-size:14.5px;font-weight:600}

.editorial{max-width:40em;padding:96px 0 0}
.editorial p{font-size:19px;line-height:1.65;margin:0 0 20px}
.lista-guias{list-style:none;margin:0 0 20px;padding:0;max-width:52em}
.lista-guias li{border-top:1px solid var(--borda)}
.lista-guias li:last-child{border-bottom:1px solid var(--borda)}
.lista-guias a{display:block;padding:20px 0;text-decoration:none;color:var(--tinta)}
.lista-guias strong{display:block;font:750 20px/1.25 var(--titulo);letter-spacing:-.015em}
.lista-guias span{display:block;margin-top:6px;color:var(--suave);font-size:16px}
.lista-guias a:hover strong{text-decoration:underline;text-decoration-color:var(--acento);text-decoration-thickness:2px;text-underline-offset:.2em}
.fim{margin-top:96px;padding-top:36px;border-top:1.5px solid var(--borda);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 40px}
.fim h2{font-size:clamp(24px,2.8vw,30px);margin:0 0 6px}
.fim p{margin:0;color:var(--suave);max-width:34em}
.fim .acoes{margin:0}

.planos{max-width:1000px;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));margin:8px 0 20px;align-items:stretch}
.plano{display:flex;flex-direction:column;padding:26px 24px 24px}
.plano h2{font-size:26px;margin:0 0 4px}
.plano .quem{color:var(--suave);font-size:15px;margin:0}
.preco{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin:18px 0 0}
.preco b{font:800 40px/1 var(--titulo);letter-spacing:-.03em;white-space:nowrap}
.preco span{font-size:15px;color:var(--suave)}
.plano .nota{margin:8px 0 0}
.plano ul{list-style:none;margin:20px 0 24px;padding:20px 0 0;border-top:1px solid var(--borda-fraca);display:grid;gap:12px;align-content:start}
.plano li{position:relative;padding-left:28px;font-size:15.5px;line-height:1.45}
.plano li::before{content:"";position:absolute;left:5px;top:.3em;width:6px;height:11px;border-right:2.5px solid var(--acento);border-bottom:2.5px solid var(--acento);transform:rotate(45deg)}
.plano .botao{margin-top:auto}
.aviso{padding:22px 24px;max-width:46em;margin:0 0 8px}
.aviso p:last-child{margin:0}

.trilha{margin:12px 0 0;font-size:15px}
.trilha a{color:var(--suave)}
.guia-grade{display:grid;grid-template-columns:minmax(0,70ch) minmax(200px,1fr);gap:72px;align-items:start}
.guia-grade .prosa h1{margin-top:20px}
.meta{display:flex;flex-wrap:wrap;gap:6px 20px;color:var(--suave);font-size:15px;margin:0 0 36px;padding-bottom:22px;border-bottom:1.5px solid var(--borda)}
.prosa p,.prosa li{font-size:18px;line-height:1.7}
.sumario{position:sticky;top:24px;margin-top:120px;font-size:15px;padding-left:20px;border-left:1.5px solid var(--borda)}
.sumario p{font-weight:650;margin:0 0 10px}
.sumario ol{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.sumario a{display:block;padding:5px 0;color:var(--suave);text-decoration:none;line-height:1.35}
.sumario a:hover{color:var(--tinta);text-decoration:underline;text-decoration-color:var(--acento)}
.pratique{max-width:70ch;margin-top:56px;padding:26px 28px}
.pratique h2{font-size:24px;margin-bottom:8px}
.pratique p{color:var(--suave)}
.pratique .acoes{margin:0}
.relacionados{margin-top:64px}
.relacionados h2{font-size:24px}

.perdido{max-width:40em;padding:48px 0 0}
.perdido .bolha-legenda{display:inline-block;margin:0 0 36px;padding:14px 20px}
.legal{padding-top:24px}
.legal h1{margin-top:0}
.legal .revisao{padding:12px 16px;border:1.5px dashed var(--borda);border-radius:12px}

@media (max-width:960px){
.heroi{grid-template-columns:1fr;gap:40px;padding-top:24px}
.cena{max-width:600px}
.passos{grid-template-columns:1fr;gap:44px;max-width:560px}
.vinheta{min-height:0}
.faixa,.faixa:nth-child(even){grid-template-columns:1fr}
.faixa:nth-child(even) .faixa-texto{order:0}
.guia-grade{grid-template-columns:1fr}
.sumario{display:none}
.rodape .largura{grid-template-columns:1fr}
.rodape ul{justify-content:flex-start;margin-left:-8px}}
@media (max-width:640px){
.largura{padding:0 16px}
.topo .largura{grid-template-columns:1fr auto;gap:0 12px;min-height:0;padding-top:12px;padding-bottom:4px}
.topo nav{grid-column:1/-1;grid-row:2;margin:6px 0 0 -10px}
.menu a{padding:10px;font-size:15.5px}
main{padding-top:8px}
.heroi h1{font-size:clamp(38px,11.4vw,54px)}
.secao{padding-top:64px}
.faixa{padding:32px 0;gap:20px}
.faixa-peca{padding:18px;min-height:0}
.face .palavra{font-size:34px}
.editorial{padding-top:72px}
.editorial p{font-size:18px}
.respostas span{font-size:12px}
.fim{margin-top:72px}
.prosa p,.prosa li{font-size:17px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}}
`;

export const CSS = CSS_BRUTO.trim().replace(/\n\s*/g, '');

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

const corrente = (href: string, atual?: string): string => (href === atual ? ' aria-current="page"' : '');

const itensDe = (lista: [string, string][], atual?: string): string =>
  lista.map(([href, rotulo]) => `<li><a href="${href}"${corrente(href, atual)}>${rotulo}</a></li>`).join('');

export function cabecalho(atual?: string): string {
  return (
    `<header class="topo"><div class="largura">` +
    `<a class="marca" href="/"><img src="/favicon.svg" alt="" width="30" height="30">Frasy</a>` +
    `<nav aria-label="Principal"><ul class="menu">${itensDe(MENU, atual)}</ul></nav>` +
    `<a class="botao" href="/app">Entrar</a>` +
    `</div></header>`
  );
}

export function rodape(atual?: string): string {
  return (
    `<footer class="rodape"><div class="largura">` +
    `<div><a class="marca" href="/"><img src="/favicon.svg" alt="" width="24" height="24">Frasy</a>` +
    `<p>Aprenda idiomas com o que você já assiste e escuta. Fale com a gente: ` +
    `<a href="mailto:contato@frasy.com.br">contato@frasy.com.br</a></p></div>` +
    `<nav aria-label="Rodapé"><ul>${itensDe(RODAPE, atual)}</ul></nav>` +
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
  const fonteDoTexto = caminhoDaFonteDoTexto(o.versaoDaFonteDoTexto ?? o.versaoDaFonte);
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titulo}</title>`,
    `<meta name="description" content="${descricao}">`,
    o.naoIndexar ? '<meta name="robots" content="noindex">' : '',
    url ? `<link rel="canonical" href="${escaparHtml(url)}">` : '',
    '<meta name="theme-color" content="#E6E2D6" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#17130F" media="(prefers-color-scheme: dark)">',
    `<link rel="preload" href="${fonte}" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="${fonteDoTexto}" as="font" type="font/woff2" crossorigin>`,
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
    `<style>${CSS.replace('%FONTE%', fonte).replace('%FONTE_TEXTO%', fonteDoTexto)}</style>`,
    ...(o.jsonLd ?? []).map((j) => `<script type="application/ld+json">${jsonSeguro(j)}</script>`),
  ].filter(Boolean);
  return (
    `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head.join('\n')}\n</head>\n<body>\n` +
    `<a class="pular" href="#conteudo">Pular para o conteúdo</a>\n` +
    `${cabecalho(o.atual)}\n<main id="conteudo"><div class="largura">\n${o.corpo}\n</div></main>\n${rodape(o.atual)}\n</body>\n</html>\n`
  );
}
