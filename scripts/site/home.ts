/**
 * A HOME (`/`): o filme por capítulos e, depois, o que o Frasy faz além da legenda.
 *
 * O FILME: seis planos contínuos gerados por IA (série, jogo, aula, viagem, família e "a palavra que fica"),
 * rolados pela página por `public/site/rolo.js` (motor portado do scroll-scrub do Higgsfield). Cada capítulo
 * traz a legenda ao vivo no visual das Legendas flutuantes, com o original e a tradução que o Frasy gerou em
 * produção ao ouvir falas assim. Sem JavaScript (ou com movimento reduzido), as capas ficam paradas e todo o
 * texto continua na página.
 *
 * ALÉM DA LEGENDA: só telas reais do app (gravadas em produção), em laço, tocando quando aparecem. A IA que
 * explica a frase está marcada "em breve" (`ia_de_estudo` ainda não está à venda).
 *
 * As mídias moram em `public/site/midia/` (orçamento: ≤32 MiB no computador, ≤16 MiB no celular; o roteiro de
 * codificação está em `reports/prototipo/codificar-site.sh`, fora do git).
 */
import type { Guia } from './guias';
import { listaDeGuias } from './paginas';

const M = '/site/midia';

type Capitulo = {
  rotulo: string;
  kicker: string;
  titulo: string;
  corpo: string;
  original?: string;
  traducao?: string;
  extra?: string;
};

// O original e a tradução são os que o Frasy gerou em produção (16/11/2026).
const CAPITULOS: Capitulo[] = [
  {
    rotulo: 'Série',
    kicker: 'Séries e filmes',
    titulo: 'Entenda o que você assiste.',
    corpo: 'Legenda e tradução ao vivo do som de qualquer aba. Você continua vendo, e as palavras novas ficam.',
    original: "I can't believe you kept this from me. We were supposed to be a team!",
    traducao: 'Não acredito que escondeu isso de mim. Éramos uma equipe!',
    extra: '<div class="acoes"><a class="botao" href="/app">Abrir o Frasy · grátis</a></div>',
  },
  {
    rotulo: 'Jogo',
    kicker: 'Jogos',
    titulo: 'A missão em inglês, entendida na hora.',
    corpo: 'Diálogos de jogo passam rápido. O Frasy legenda por cima, sem pausar a partida.',
    original: 'The bridge is guarded. Find another way into the castle before sunset.',
    traducao: 'A ponte está guardada. Encontrar outro caminho para o castelo antes do pôr do sol.',
  },
  {
    rotulo: 'Aula',
    kicker: 'Aulas e reuniões',
    titulo: 'Aula rápida? A legenda acompanha.',
    corpo: 'Aula online, reunião ou curso: você lê junto quando apertar e revisa os termos depois.',
    original: 'For tomorrow, please read chapter 4 and write a short summary.',
    traducao: 'Para amanhã, leia o capítulo 4 e escreva um breve resumo.',
  },
  {
    rotulo: 'Viagem',
    kicker: 'Viagem',
    titulo: 'No balcão, no táxi, no hotel.',
    corpo: 'Pelo microfone do celular, ou no modo intérprete: cada um fala no seu idioma.',
    original: 'Your flight was moved to Gate 12, boarding starts in 20 minutes.',
    traducao: 'Seu voo foi transferido para a porta 12, embarque começa em 20 minutos.',
  },
  {
    rotulo: 'Família',
    kicker: 'Para as crianças',
    titulo: 'O desenho favorito vira lição.',
    corpo: 'Perfil protegido para menores: sem compras e sem ofertas. Quem decide é o responsável.',
    original: 'Look! The little fox found his way back home.',
    traducao: 'Veja! A raposa encontrou o caminho de volta para casa.',
  },
  {
    rotulo: 'Palavras',
    kicker: 'E depois?',
    titulo: 'Cada palavra que você toca fica com você.',
    corpo: 'Ela vira cartão, volta em jogos curtos e aparece de novo nas próximas séries. É assim que o idioma fica.',
    extra: '<div class="acoes"><a class="botao vidro" href="#alem">Ver o que mais o Frasy faz</a></div>',
  },
];

const legenda = (c: Capitulo): string =>
  c.original && c.traducao
    ? `<div class="leg" data-leg><span class="selo"><i></i>AO VIVO · EN → PT</span><p class="o" lang="en">${c.original}</p><p class="t">${c.traducao}</p></div>`
    : '';

const capitulo = (c: Capitulo, i: number): string => {
  const titulo = i === 0 ? `<h1>${c.titulo}</h1>` : `<h2>${c.titulo}</h2>`;
  return (
    `<article class="capitulo" data-capitulo data-rotulo="${c.rotulo}" data-clipe="${M}/cap-${i + 1}.mp4" data-clipe-celular="${M}/cap-${i + 1}-m.mp4">` +
    `<div class="capitulo-fixo"><div class="texto"><p class="kicker">${c.kicker}</p>${titulo}<p class="corpo">${c.corpo}</p>${legenda(c)}${c.extra ?? ''}</div></div></article>`
  );
};

type Peca = {
  tam: 2 | 3 | 4;
  chip: string;
  titulo: string;
  texto: string;
  video?: string;
  imagem?: string;
  alt: string;
};

const PECAS: Peca[] = [
  {
    tam: 4,
    chip: 'Toque e guarde',
    titulo: 'A palavra vai com a frase de onde veio.',
    texto: 'Toque na fala, escolha a palavra e pronto: ela entra no seu caderno, sem sair da cena.',
    video: 'rec-guardar',
    alt: 'Tela real: tocar na fala, escolher a palavra flight e guardar',
  },
  {
    tam: 2,
    chip: 'Revisão',
    titulo: 'Volta na hora certa.',
    texto: 'A revisão espaçada traz a palavra quando você estaria esquecendo, num jogo curto.',
    video: 'rec-memoria',
    alt: 'Tela real: o jogo da memória com as palavras',
  },
  {
    tam: 2,
    chip: '17 jogos',
    titulo: 'Revisar virou jogar.',
    texto: 'Memória, caça-palavras, Soletrar, frase embaralhada e mais.',
    video: 'rec-jogos',
    alt: 'Tela real: a grade de jogos',
  },
  {
    tam: 2,
    chip: 'Soletrar',
    titulo: 'Escreva a palavra.',
    texto: 'A pista é o significado; as cores dizem quais letras estão certas.',
    video: 'rec-soletrar',
    alt: 'Tela real: o jogo Soletrar',
  },
  {
    tam: 2,
    chip: 'Nível e recompensas',
    titulo: 'Cada rodada conta.',
    texto: 'Monte a frase, ganhe XP, suba de nível e libere visuais novos.',
    video: 'rec-frase',
    alt: 'Tela real: frase embaralhada e a subida de nível',
  },
  {
    tam: 3,
    chip: 'Progresso',
    titulo: 'Missões do dia e o seu nível.',
    texto: 'Revise 10 palavras, salve 5 de uma captura, feche uma rodada: pequenas metas para todo dia.',
    imagem: 'rec-inicio.png',
    alt: 'Tela real: o início do app com nível, XP, Seeds e missões do dia',
  },
  {
    tam: 3,
    chip: 'Livros',
    titulo: '215 clássicos no seu nível.',
    texto: 'Leia e ouça livros em domínio público, ou traga o seu. O nível estimado ajuda a escolher.',
    imagem: 'rec-leitor.png',
    alt: 'Tela real: o leitor de livros com The Blue Castle',
  },
];

const peca = (p: Peca): string => {
  const midia = p.video
    ? `<video data-quando-visivel src="${M}/${p.video}.mp4" poster="${M}/${p.video}.jpg" muted loop playsinline preload="none" aria-label="${p.alt}"></video>`
    : `<img src="${M}/${p.imagem}" alt="${p.alt}" loading="lazy">`;
  return `<article class="peca-v g${p.tam}"><div class="midia">${midia}</div><div class="info"><span class="chip">${p.chip}</span><h3>${p.titulo}</h3><p>${p.texto}</p></div></article>`;
};

export function corpoDaHome(guias: Guia[]): string {
  const recentes = guias.slice(0, 3);
  return `
<section class="rolo" id="rolo" aria-label="Onde o Frasy funciona">
<div class="rolo-palco">
${CAPITULOS.map((_, i) => `<figure class="camada" data-camada aria-hidden="true"><img src="${M}/cap-${i + 1}.jpg" alt=""${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}></figure>`).join('\n')}
<div class="rolo-veu" aria-hidden="true"></div><div class="rolo-barra" aria-hidden="true"></div>
<nav class="rota" aria-label="Capítulos" id="rota"></nav>
<p class="nota-ia">Filmes gerados por IA · legenda e tradução geradas pelo Frasy</p>
</div>
<div class="historia-do-rolo">
${CAPITULOS.map(capitulo).join('\n')}
</div>
</section>

<section class="secao-v" id="alem" aria-labelledby="t-alem">
<div class="larg-v">
<p class="rotulo-v">Além da legenda</p>
<h2 id="t-alem">A legenda é só o começo.</h2>
<p class="lead-v">O Frasy transforma o que você ouviu em prática: jogos, revisão no dia certo, livros no seu nível e o seu progresso. Todas as telas abaixo são do app de verdade.</p>
<div class="bento">
${PECAS.map(peca).join('\n')}
<article class="peca-v ia gtodo"><div class="midia"><div class="bolha"><b>"Circle back"</b> quer dizer retomar um assunto depois. Nesta frase, a pessoa propõe voltar ao orçamento em outra reunião. Outras formas de dizer: <i lang="en">revisit</i>, <i lang="en">come back to</i>.</div></div><div class="info"><span class="chip breve">Em breve</span><h3>A IA que explica a frase, do seu jeito.</h3><p>Por que essa palavra aqui, outras formas de dizer, o tom da frase. Para quem quer ir além da tradução.</p></div></article>
</div>
</div>
</section>

<section class="interprete-v" id="interprete" aria-labelledby="t-int">
<div class="larg-v grade">
<div><p class="rotulo-v">Modo intérprete</p><h2 id="t-int">Um celular. <em>Duas línguas.</em></h2><p class="lead-v">Cada pessoa fala no seu idioma. A tradução aparece do outro lado e é lida em voz alta.</p></div>
<video src="${M}/interprete.mp4" controls playsinline preload="metadata" aria-label="Vídeo: um brasileiro pergunta onde fica o metrô e a moradora responde em inglês, com a tradução do Frasy"></video>
</div>
</section>

<section class="secao-v" aria-labelledby="t-comparar">
<div class="larg-v">
<p class="rotulo-v">Antes e depois</p>
<h2 id="t-comparar">Mesma cena. Agora você entende.</h2>
<p class="lead-v">Arraste para comparar.</p>
<div class="comparar" id="comparar">
<video class="sem" id="cmp-sem" src="${M}/antes-depois.mp4" muted loop playsinline preload="metadata" aria-hidden="true"></video>
<div class="confuso" aria-hidden="true">???</div>
<div class="com-camada" id="cmp-camada"><video id="cmp-com" src="${M}/antes-depois.mp4" muted loop playsinline preload="metadata" aria-hidden="true"></video>
<div class="lg"><p class="o" lang="en">I can't believe you kept this from me. We were supposed to be a team!</p><p class="t">Não acredito que escondeu isso de mim. Éramos uma equipe!</p></div></div>
<span class="marca-lado marca-sem">Sem o Frasy</span><span class="marca-lado marca-com">Com o Frasy</span>
<div class="divisor" id="cmp-divisor"></div>
<input type="range" id="cmp-controle" min="5" max="95" value="50" aria-label="Arraste para comparar sem e com o Frasy">
</div>
</div>
</section>

<section class="secao-v" aria-labelledby="t-conf">
<div class="larg-v">
<p class="rotulo-v">Feito com cuidado</p>
<h2 id="t-conf">Estudo tranquilo, do jeito certo.</h2>
<div class="tres">
<div><h3>No seu aparelho primeiro</h3><p>Transcrição e tradução rodam no navegador. A nuvem só entra com o seu consentimento, com provedores que se comprometem a não guardar o que recebem nem usar para treinar modelos. Veja <a href="/privacidade">como tratamos os dados</a>.</p></div>
<div><h3>Perfil protegido para menores</h3><p>Menores de 18 anos não fazem compras nem recebem ofertas de plano. Quem decide qualquer pagamento é o responsável, pela conta dele.</p></div>
<div><h3>Sem pressão</h3><p>O Frasy não promete fluência em poucos dias. Ele ajuda você a entender um pouco mais a cada episódio, aula ou conversa.</p></div>
</div>
</div>
</section>
${
  recentes.length
    ? `<section class="secao-v" aria-labelledby="guias-recentes"><div class="larg-v"><h2 id="guias-recentes">Guias para estudar melhor</h2>${listaDeGuias(recentes)}<p><a href="/guias">Ver todos os guias</a></p></div></section>`
    : ''
}
<section class="final-v" aria-labelledby="comece">
<div class="larg-v"><h2 id="comece">Abra um vídeo que você já queria ver.</h2>
<p>Clique em Legendar agora e guarde a primeira palavra. Leva um minuto.</p>
<a class="botao" href="/app">Abrir o Frasy · grátis</a></div>
</section>
`;
}

/** Os estilos só da home (cores explícitas: o filme é sempre noite; o resto segue os tokens do site). */
export const CSS_DA_HOME = `
#conteudo.inteiro{padding:0}
.larg-v{max-width:1200px;margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.rotulo-v{font:700 13px/1.2 var(--texto);letter-spacing:.14em;text-transform:uppercase;color:var(--acento-texto);margin:0}
.lead-v{font-size:clamp(17px,1.6vw,20px);color:var(--suave);max-width:38em}
.botao.vidro{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.4);box-shadow:none}
.rolo{position:relative;background:#0E0B09;color:#fff}
.rolo-palco{position:sticky;top:0;height:100vh;height:100svh;overflow:hidden;z-index:0}
.camada{position:absolute;inset:0;margin:0;opacity:0;will-change:opacity}
.camada:first-child{opacity:1}
.camada img,.camada video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.camada video{opacity:0}
.camada[data-pintado] video{opacity:1}
.rolo-veu{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(14,11,9,.74) 0%,rgba(14,11,9,.2) 46%,rgba(14,11,9,0) 65%),linear-gradient(0deg,rgba(14,11,9,.55) 0%,rgba(14,11,9,0) 30%)}
.rolo-barra{position:absolute;left:0;bottom:0;height:3px;width:100%;transform-origin:left;transform:scaleX(var(--progresso,0));background:#EF4E22}
.rota{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:8px;z-index:3}
.rota button{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:flex-end;gap:10px;font:600 13px/1 var(--texto);color:rgba(255,255,255,.6);padding:6px 0}
.rota button::after{content:"";width:22px;height:2px;border-radius:2px;background:currentColor;transition:width .25s}
.rota button[aria-current]{color:#fff}
.rota button[aria-current]::after{width:40px;background:#EF4E22}
.rota button:focus-visible{outline:2px solid #EF4E22;outline-offset:4px}
.nota-ia{position:absolute;left:max(20px,env(safe-area-inset-left,0px));bottom:14px;margin:0;font:500 12px/1.3 var(--texto);color:rgba(255,255,255,.7);z-index:3}
.historia-do-rolo{position:relative;z-index:2;margin-top:-100vh;margin-top:-100svh;pointer-events:none}
.historia-do-rolo .texto{pointer-events:auto}
.capitulo{min-height:150vh;min-height:150svh;position:relative}
.capitulo-fixo{position:sticky;top:0;height:100vh;height:100svh;display:flex;align-items:center}
.texto{max-width:560px;padding:0 max(24px,env(safe-area-inset-left,0px));margin-left:max(0px,calc((100vw - 1200px)/2))}
.capitulo .kicker{font:700 13px/1 var(--texto);letter-spacing:.12em;text-transform:uppercase;color:#F4774F;margin:0 0 16px}
.capitulo h1,.capitulo h2{font-size:clamp(40px,5.6vw,82px);line-height:.98;letter-spacing:-.04em;margin:0 0 18px;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,.45)}
.capitulo .corpo{font-size:clamp(17px,1.5vw,20px);color:#F3ECE0;max-width:30em;margin:0;text-shadow:0 2px 16px rgba(0,0,0,.5)}
.capitulo .acoes{margin-top:26px}
.leg{margin-top:28px;max-width:560px;padding:18px 22px 20px;border-radius:18px;background:rgba(20,17,14,.8)}
.leg .selo{display:inline-flex;align-items:center;gap:8px;font:700 11px/1 var(--texto);letter-spacing:.1em;color:#fff;background:#EF4E22;padding:6px 9px;border-radius:999px;margin-bottom:10px}
.leg .selo i{width:7px;height:7px;border-radius:50%;background:#fff}
.leg .o{font:600 18px/1.35 var(--texto);color:#fff;margin:0}
.leg .o span{transition:opacity .12s}
.leg .t{margin:6px 0 0;font:800 24px/1.2 var(--titulo);color:#FFEA00;transition:opacity .2s,transform .2s}
.leg .t.oculta{opacity:0;transform:translateY(6px)}
.secao-v{padding:110px 0 0}
.secao-v h2{font-size:clamp(36px,5vw,64px);margin:14px 0 18px;max-width:15em}
.bento{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px;margin-top:44px}
.peca-v{background:var(--superficie);border-radius:24px;overflow:hidden;box-shadow:0 0 0 1px var(--borda-fraca),var(--sombra-alta);display:flex;flex-direction:column}
.peca-v .midia{background:var(--superficie-2);aspect-ratio:16/10;overflow:hidden}
.peca-v .midia video,.peca-v .midia img{width:100%;height:100%;object-fit:cover;object-position:top left}
.peca-v .info{padding:20px 22px 24px}
.peca-v h3{font-size:26px;margin:0 0 8px}
.peca-v p{color:var(--suave);font-size:16px;margin:0}
.peca-v .chip{display:inline-block;margin-bottom:10px;font:700 12px/1 var(--texto);letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:var(--acao);color:var(--acao-tinta)}
.peca-v .chip.breve{background:#211E19;color:#fff}
.g2{grid-column:span 2}.g3{grid-column:span 3}.g4{grid-column:span 4}.gtodo{grid-column:1/-1}
.peca-v.ia{background:#0E0B09;color:#F3ECE0}
.peca-v.ia h3{color:#fff}
.peca-v.ia p{color:#C9BFAE}
.peca-v.ia .midia{aspect-ratio:auto;min-height:200px;background:radial-gradient(120% 90% at 30% 20%,#3a2a1f 0%,#0E0B09 70%);display:flex;align-items:center;justify-content:center;padding:28px}
.bolha{background:#F3F0E8;color:#211E19;border-radius:16px;padding:16px 18px;max-width:440px;font-size:15px;line-height:1.5}
.interprete-v{margin-top:110px;background:#0E0B09;color:#F3ECE0;padding:100px 0}
.interprete-v .grade{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:48px;align-items:center}
.interprete-v h2{color:#fff;font-size:clamp(40px,5.4vw,72px);margin:14px 0 0}
.interprete-v h2 em{font-style:normal;color:#F4774F}
.interprete-v .lead-v{color:#C9BFAE;margin-top:18px}
.interprete-v .rotulo-v{color:#F4774F}
.interprete-v video{width:100%;border-radius:20px}
.comparar{position:relative;margin-top:36px;border-radius:22px;overflow:hidden;aspect-ratio:16/9;background:#0E0B09}
.comparar video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.comparar .sem{filter:grayscale(.65) brightness(.75)}
.comparar .com-camada{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}
.comparar .marca-lado{position:absolute;top:18px;padding:10px 16px;border-radius:999px;font:800 15px/1 var(--texto);color:#fff}
.comparar .marca-sem{left:18px;background:rgba(40,40,40,.85)}
.comparar .marca-com{right:18px;background:#EF4E22}
.comparar .confuso{position:absolute;left:0;width:50%;bottom:16%;text-align:center;font:900 clamp(40px,8vw,110px)/1 var(--titulo);color:#fff}
.comparar .lg{position:absolute;right:3%;width:44%;bottom:7%;padding:14px 18px;border-radius:14px;background:rgba(20,17,14,.82);text-align:center}
.comparar .lg .o{font:600 clamp(12px,1.4vw,18px)/1.3 var(--texto);color:#fff;margin:0}
.comparar .lg .t{margin:4px 0 0;font:800 clamp(14px,1.8vw,24px)/1.2 var(--titulo);color:#FFEA00}
.comparar .divisor{position:absolute;top:0;bottom:0;left:50%;width:3px;margin-left:-1.5px;background:#fff;pointer-events:none}
.comparar .divisor::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:#fff}
.comparar input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.tres{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin-top:40px}
.tres>div{border-top:3px solid var(--tinta);padding-top:18px}
.tres h3{font-size:24px;margin:0 0 8px}
.tres p{color:var(--suave);font-size:16px;margin:0}
.final-v{margin-top:120px;background:#0E0B09;color:#fff;padding:110px 0;text-align:center}
.final-v h2{font-size:clamp(42px,6.4vw,92px);margin:0 auto 20px;max-width:12em;color:#fff}
.final-v p{color:#C9BFAE;font-size:20px;margin:0 0 30px}
@media (max-width:900px){
.rota{display:none}
.rolo-veu{background:linear-gradient(0deg,rgba(14,11,9,.9) 0%,rgba(14,11,9,.25) 55%,rgba(14,11,9,.1) 100%)}
.capitulo-fixo{align-items:flex-end;padding-bottom:max(36px,env(safe-area-inset-bottom,0px))}
.capitulo h1,.capitulo h2{font-size:clamp(34px,10vw,52px)}
.leg{margin-top:18px}.leg .t{font-size:20px}
.camada:nth-child(1) :is(img,video){object-position:42% 50%}
.camada:nth-child(2) :is(img,video){object-position:56% 50%}
.camada:nth-child(3) :is(img,video){object-position:74% 50%}
.camada:nth-child(4) :is(img,video){object-position:30% 50%}
.camada:nth-child(5) :is(img,video){object-position:52% 50%}
.bento{grid-template-columns:1fr}
.g2,.g3,.g4{grid-column:auto}
.interprete-v .grade,.tres{grid-template-columns:1fr}}
`;
