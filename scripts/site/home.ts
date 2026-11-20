/**
 * A HOME (`/`): o filme por capítulos e, depois, o que o Frasy faz além da legenda.
 *
 * O FILME: seis planos contínuos gerados por IA (série, jogo, aula, viagem, família e "a palavra que fica"),
 * rolados pela página por `public/site/rolo.js` (motor portado do scroll-scrub do Higgsfield). Cada capítulo
 * traz a legenda ao vivo no visual das Legendas flutuantes, com o original e a tradução que o Frasy gerou em
 * produção ao ouvir falas assim. Sem JavaScript, as capas ficam paradas e todo o texto continua na página;
 * com movimento reduzido, o filme segue a rolagem, sem nada que se mexa sozinho (ver `rolo.js`).
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
  /** O trecho do plano-sequência (`filme.mp4`) que este capítulo ocupa, em segundos. */
  de: number;
  ate: number;
  rotulo: string;
  kicker: string;
  titulo: string;
  corpo: string;
  /** A fala de exemplo; `[[palavra]]` marca a palavra que a cena explica (e que vai para "Suas palavras"). */
  original?: string;
  traducao?: string;
  /** Como o Frasy ouve esta cena: Microfone, Som do computador ou Conversa. */
  modo?: string;
  /** Nota curta sobre a palavra marcada, quando a tradução precisa do contexto. */
  nota?: string;
  /**
   * Onde está quem fala, no quadro do filme: `segundo:x%:y%` separados por vírgula (a câmera anda, então
   * são pontos no tempo e a marca é interpolada entre eles). Fora desse intervalo, a marca some.
   */
  fonte?: string;
  extra?: string;
  /** As palavras do dia que voltam na revisão (último capítulo): palavra, frase de onde veio e quando volta. */
  cartas?: [string, string, string][];
};

// Os capítulos seguem o plano-sequência (um dia, da manhã à madrugada) e cada um ocupa o seu trecho do
// filme. As falas são exemplos, no visual das Legendas flutuantes, com a tradução revisada à mão.
// O texto saiu da auditoria de 17/11/2026 (personas simuladas e A/B cego, em `reports/auditoria-texto/`) e da
// revisão do protótipo de 20/11/2026. No título, `<em>` é o trecho com marca-texto; no corpo, `<mark>` ganha o
// sublinhado que se desenha quando o capítulo entra (CSS em `.capitulo.atual`, classe posta por `rolo.js`).
const CAPITULOS: Capitulo[] = [
  {
    de: 0,
    ate: 4.5,
    rotulo: 'Manhã',
    kicker: 'Legenda e tradução ao vivo',
    titulo: 'Ouviu outra língua? Entenda e <em>guarde a palavra.</em>',
    corpo:
      'Desenho, série, aula ou conversa. Toque numa palavra e <mark>ela fica guardada</mark>, com a frase. No perfil das crianças, sem compras e sem ofertas.',
    original: "Come on! Let's build a [[rocket]] to the Moon!",
    traducao: 'Vem! Vamos construir um [[foguete]] até a Lua!',
    modo: 'Microfone',
    extra:
      '<div class="acoes"><a class="botao" href="/app">Abrir o Frasy · grátis</a><a class="ver-como" href="#alem">Ver como funciona</a></div><p class="apoio">Sem cartão e sem instalar nada.</p>',
  },
  {
    de: 4.5,
    ate: 10.5,
    rotulo: 'Aula',
    kicker: 'Aulas e reuniões',
    titulo: 'Professor fala rápido? <em>A legenda acompanha.</em>',
    corpo:
      'Aula, palestra ou reunião online: original e tradução aparecem frase por frase. Você presta atenção na aula, <mark>não no dicionário</mark>.',
    original: 'For tomorrow, please read chapter 4 and write a short [[summary]].',
    traducao: 'Para amanhã, leiam o capítulo 4 e escrevam um [[resumo]] curto.',
    modo: 'Microfone',
    fonte: '7.6:93:28,8.2:92:28,9.2:97:26',
  },
  {
    de: 10.5,
    ate: 15,
    rotulo: 'Mercado',
    kicker: 'Compras lá fora',
    titulo: 'Chega de sorrir e acenar <em>sem entender.</em>',
    corpo:
      'No celular, o Frasy ouve pelo microfone e traduz o que o atendente diz. <mark>Você lê, entende e responde.</mark>',
    original: 'Do you need a [[bag]], or are you all set?',
    traducao: 'Precisa de [[sacola]] ou já está tudo certo?',
    modo: 'Microfone',
    fonte: '12:55:52,13:55:50,14.5:69:24',
  },
  {
    de: 15,
    ate: 20,
    rotulo: 'Embarque',
    kicker: 'Aeroporto e viagem',
    titulo: 'Mudaram o portão? <em>Você fica sabendo.</em>',
    corpo:
      'O atendente avisa, a legenda traduz: portão, horário, embarque. Fica mais fácil entender <mark>sem pedir para repetir</mark>.',
    original: 'Your flight was moved to [[Gate]] 12. Boarding starts in 20 minutes.',
    traducao: 'Seu voo mudou para o [[portão]] 12. O embarque começa em 20 minutos.',
    modo: 'Microfone',
    nota: 'No aeroporto, gate é portão, não porta: o Frasy traduz a frase inteira, não a palavra solta.',
  },
  {
    de: 20,
    ate: 24,
    rotulo: 'Jantar',
    kicker: 'Conversa à mesa',
    titulo: 'Um celular no meio da mesa <em>resolve.</em>',
    corpo:
      'Na conversa, cada pessoa fala no seu idioma. O Frasy traduz e <mark>lê em voz alta</mark> para o outro lado.',
    original: "You have to try this. It's my grandma's [[recipe]]!",
    traducao: 'Você tem que provar isso. É [[receita]] da minha avó!',
    modo: 'Conversa',
    fonte: '21:42:52,22:37:51,23.5:16:50',
  },
  {
    de: 24,
    ate: 28,
    rotulo: 'Séries e jogos',
    kicker: 'Séries e jogos',
    titulo: 'Série ou jogo, <em>sem pausar nada.</em>',
    corpo:
      'O Frasy legenda o som do computador enquanto a história segue. Palavra nova? Um clique e <mark>ela fica guardada</mark>.',
    original: "Don't open that [[door]]. Not tonight.",
    traducao: 'Não abra essa [[porta]]. Hoje não.',
    modo: 'Som do computador',
    fonte: '25.2:79:56,25.5:77:56,26.5:61:56,27.5:45:47,28:42:46',
  },
  {
    de: 28,
    ate: 30,
    rotulo: 'Suas palavras',
    kicker: 'Fim do dia',
    titulo: 'O que você ouviu hoje <em>não se perde.</em>',
    corpo:
      'Cada palavra guardada fica com a frase de onde veio e volta numa revisão rápida, em <mark>intervalos cada vez maiores</mark>.',
    cartas: [
      ['foguete', 'Vem! Vamos construir um foguete até a Lua!', 'volta amanhã'],
      ['sacola', 'Precisa de sacola ou já está tudo certo?', 'em 3 dias'],
      ['portão', 'Seu voo mudou para o portão 12.', 'em 1 semana'],
    ],
    extra: '<div class="acoes"><a class="botao vidro" href="#alem">Ver como funciona</a></div>',
  },
];

// A palavra que a cena explica: sublinhada no original e com marca-texto na tradução (`[[...]]` no texto).
const marcar = (t: string): string => t.replace(/\[\[(.+?)\]\]/g, '<span class="chave">$1</span>');
const semMarca = (t: string): string => t.replace(/\[\[(.+?)\]\]/g, '$1');

const legenda = (c: Capitulo): string =>
  c.original && c.traducao
    ? `<div class="leg" data-leg><span class="selo"><i></i>AO VIVO · EN → PT</span>${c.modo ? `<span class="modo">${c.modo}</span>` : ''}` +
      `<p class="o" lang="en"${c.original.includes('[[') ? ` data-chave="${/\[\[(.+?)\]\]/.exec(c.original)![1]}"` : ''}>${semMarca(c.original)}</p>` +
      `<p class="t">${marcar(c.traducao)}</p>${c.nota ? `<p class="nota-chave">${c.nota}</p>` : ''}</div>`
    : '';

// As cartas chegam uma a uma quando o capítulo entra; sem JavaScript (ou com movimento reduzido), já estão lá.
const cartas = (c: Capitulo): string =>
  c.cartas
    ? `<ul class="dia-cartas" aria-label="Palavras que voltam na revisão">${c.cartas
        .map(
          ([palavra, frase, quando]) =>
            `<li class="dia-carta"><div><b>${palavra}</b><small>${frase}</small></div><em>${quando}</em></li>`,
        )
        .join('')}</ul>`
    : '';

const capitulo = (c: Capitulo, i: number): string => {
  const titulo = i === 0 ? `<h1>${c.titulo}</h1>` : `<h2>${c.titulo}</h2>`;
  return (
    `<article class="capitulo" data-capitulo data-rotulo="${c.rotulo}" data-de="${c.de}" data-ate="${c.ate}"${c.fonte ? ` data-fonte="${c.fonte}"` : ''}>` +
    `<div class="capitulo-fixo"><div class="texto"><p class="kicker">${c.kicker}</p>${titulo}<p class="corpo">${c.corpo}</p>${legenda(c)}${cartas(c)}${c.extra ?? ''}</div></div></article>`
  );
};

type Passo = { nome: string; titulo: string; texto: string; clipe: string; alt: string };

// O fluxo do app, na ordem em que a pessoa usa. Cada clipe é uma tela real, gravada em produção e recortada
// no componente (roteiro em `reports/landing/gravar-fluxo.mjs`, fora do git).
const PASSOS_DO_FLUXO: Passo[] = [
  {
    nome: 'Ouça',
    titulo: 'A legenda chega junto com a voz.',
    texto: 'Vídeo, aula ou conversa. Original e tradução aparecem juntos, frase por frase.',
    clipe: 'fluxo-1-ouvir',
    alt: 'Tela real: falas em inglês chegando ao vivo, cada uma com a tradução em português',
  },
  {
    nome: 'Guarde',
    titulo: 'Toque na palavra que chamou sua atenção.',
    texto: 'Ela vai com a frase de onde veio. Sem pausar o vídeo, sem copiar e colar.',
    clipe: 'fluxo-2-guardar',
    alt: 'Tela real: tocar na fala da raposa, escolher a palavra fox e guardar; ela fica marcada na legenda',
  },
  {
    nome: 'Revise',
    titulo: 'Cada palavra volta, cada vez mais espaçada.',
    texto: 'A palavra reaparece na frase em que você a ouviu. A cada acerto, ela demora mais para voltar.',
    clipe: 'fluxo-3-revisar',
    alt: 'Tela real: a frase da raposa com uma lacuna; tocar em found completa e fica verde',
  },
  {
    nome: 'Jogue',
    titulo: 'Revisar também pode ser jogo.',
    texto: '18 jogos curtos com as suas palavras: memória, frase com lacuna e mais. Sem tempo? Dá para só revisar.',
    clipe: 'fluxo-4-jogar',
    alt: 'Tela real: o jogo da memória encontrando os pares palavra e tradução',
  },
  {
    nome: 'Escreva',
    titulo: 'Agora é você que escreve.',
    texto: 'Você vê o significado e escreve a palavra. As cores mostram quais letras estão no lugar certo.',
    clipe: 'fluxo-5-escrever',
    alt: 'Tela real: a pista semana; WEAK quase acerta e WEEK fica toda verde',
  },
  {
    nome: 'Avance',
    titulo: 'Pontos, nível e missões do dia.',
    texto: 'Cada rodada soma pontos, sobe o seu nível e conta para as missões do dia. Você vê quanto já praticou.',
    clipe: 'fluxo-6-progresso',
    alt: 'Tela real: ao fechar a rodada, o nível sobe e libera visuais novos',
  },
];

const videoDoPasso = (p: Passo, atributo: string): string =>
  `<video ${atributo} src="${M}/${p.clipe}.mp4" poster="${M}/${p.clipe}.jpg" muted loop playsinline preload="none" aria-label="${p.alt}"></video>`;

const passoDoFluxo = (p: Passo, i: number): string =>
  `<li class="passo" data-passo><span class="passo-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>` +
  `<div class="passo-texto"><p class="passo-nome">${p.nome}</p><h3>${p.titulo}</h3><p>${p.texto}</p></div>` +
  `<div class="passo-midia">${videoDoPasso(p, 'data-quando-visivel')}</div></li>`;

export function corpoDaHome(guias: Guia[]): string {
  const recentes = guias.slice(0, 3);
  return `
<section class="rolo" id="rolo" aria-label="Onde o Frasy funciona" data-filme="${M}/filme.mp4" data-filme-celular="${M}/filme-m.mp4">
<div class="rolo-palco">
${CAPITULOS.map((_, i) => `<figure class="camada" data-camada aria-hidden="true"><img src="${M}/filme-${i + 1}.jpg" alt=""${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}></figure>`).join('\n')}
<figure class="camada filme" data-filme-camada aria-hidden="true"></figure>
<div class="rolo-veu" aria-hidden="true"></div><div class="rolo-barra" aria-hidden="true"></div>
<div class="marcas" aria-hidden="true"><svg class="fio-do-som"><path d=""/></svg><span class="pulso-do-som"></span></div>
<p class="contador-de-palavras" aria-live="polite">Suas palavras <b data-contador>0</b></p>
<nav class="rota" aria-label="Capítulos" id="rota"></nav>
<p class="nota-ia">Cenas de exemplo criadas com IA. A legenda mostra o visual real do Frasy.</p>
</div>
<div class="historia-do-rolo">
${CAPITULOS.map(capitulo).join('\n')}
</div>
</section>

<section class="secao-v fluxo" id="alem" aria-labelledby="t-alem">
<div class="larg-v">
<p class="rotulo-v" data-revelar>Como funciona</p>
<h2 id="t-alem" data-revelar>Do vídeo à palavra <mark class="marca-texto">que fica</mark>.</h2>
<p class="lead-v" data-revelar>Seis passos, do primeiro toque à palavra aprendida. As telas abaixo foram gravadas no próprio app.</p>
<div class="fluxo-grade">
<div class="fluxo-tela" aria-hidden="true">
<div class="janela"><div class="janela-barra"><i></i><i></i><i></i><span>frasy.com.br/app</span></div>
<div class="janela-quadros">${PASSOS_DO_FLUXO.map((p, i) => `<div class="quadro${i === 0 ? ' ativo' : ''}" data-quadro>${videoDoPasso(p, 'tabindex="-1"')}</div>`).join('')}</div></div>
<div class="fluxo-pontos">${PASSOS_DO_FLUXO.map((p, i) => `<span${i === 0 ? ' class="ativo"' : ''}>${p.nome}</span>`).join('')}</div>
</div>
<ol class="fluxo-passos">
${PASSOS_DO_FLUXO.map(passoDoFluxo).join('\n')}
</ol>
</div>
<div class="tambem">
<article class="peca-v" data-revelar><div class="midia"><video data-quando-visivel src="${M}/fluxo-7-ler.mp4" poster="${M}/fluxo-7-ler.jpg" muted loop playsinline preload="none" aria-label="Tela real: no leitor, tocar numa palavra do livro mostra a tradução"></video></div><div class="info"><span class="chip">Livros</span><h3>Clássicos para ler de graça.</h3><p>Escolha pelo nível, toque numa palavra para ver a tradução e guarde nas suas palavras.</p></div></article>
<article class="peca-v ia" data-revelar><div class="midia"><div class="bolha"><b>"Circle back"</b> quer dizer retomar um assunto depois. Nesta frase, a pessoa propõe voltar ao orçamento em outra reunião. Outras formas de dizer: <i lang="en">revisit</i>, <i lang="en">come back to</i>.</div></div><div class="info"><span class="chip breve">Em breve</span><h3>Entenda por que a frase é dita assim.</h3><p>Uma explicação curta da frase, outras formas de dizer e o tom da fala. Ainda não está disponível.</p></div></article>
</div>
</div>
</section>

<section class="interprete-v" id="interprete" aria-labelledby="t-int">
<div class="larg-v grade">
<div><p class="rotulo-v">Conversa</p><h2 id="t-int" data-revelar>Você fala português. <em>A outra pessoa ouve em inglês.</em></h2><p class="lead-v">Cada pessoa fala no seu idioma, no mesmo celular. A tradução aparece na tela e é lida em voz alta.</p></div>
<video src="${M}/interprete.mp4" controls playsinline preload="metadata" aria-label="Vídeo: um brasileiro pergunta onde fica o metrô e a moradora responde em inglês, com a tradução do Frasy"></video>
</div>
</section>

<section class="secao-v" aria-labelledby="t-comparar">
<div class="larg-v">
<p class="rotulo-v">Antes e depois</p>
<h2 id="t-comparar" data-revelar>Mesma cena, com e sem o Frasy.</h2>
<p class="lead-v">Arraste a barra e veja a diferença que a legenda faz.</p>
<div class="comparar" id="comparar">
<video class="sem" id="cmp-sem" src="${M}/antes-depois.mp4" muted loop playsinline preload="metadata" aria-hidden="true"></video>
<div class="confuso" aria-hidden="true">???</div>
<div class="com-camada" id="cmp-camada"><video id="cmp-com" src="${M}/antes-depois.mp4" muted loop playsinline preload="metadata" aria-hidden="true"></video>
<div class="lg"><p class="o" lang="en">I can't believe you kept this from me. We were supposed to be a team!</p><p class="t">Não acredito que você escondeu isso de mim. Era para a gente ser uma equipe!</p></div></div>
<span class="marca-lado marca-sem">Sem o Frasy</span><span class="marca-lado marca-com">Com o Frasy</span>
<div class="divisor" id="cmp-divisor"></div>
<input type="range" id="cmp-controle" min="5" max="95" value="50" aria-label="Arraste para comparar sem e com o Frasy">
</div>
</div>
</section>

<section class="secao-v" aria-labelledby="t-conf">
<div class="larg-v">
<p class="rotulo-v">Feito com cuidado</p>
<h2 id="t-conf" data-revelar>Estudo tranquilo, <mark class="marca-texto">sem pegadinha</mark>.</h2>
<div class="tres">
<div><h3>Funciona no seu aparelho</h3><p>A legenda e a tradução são feitas no próprio aparelho, pelo navegador. Se algo precisar ir pela internet, o Frasy pede antes, e os serviços usados não guardam o que recebem nem treinam IA com isso. Veja <a href="/privacidade">como cuidamos dos seus dados</a>.</p></div>
<div><h3>Perfil protegido para menores de 18 anos</h3><p>Quem tem menos de 18 anos não compra nada e não recebe ofertas. Qualquer pagamento é decidido pelo responsável, na conta dele.</p></div>
<div><h3>Progresso de verdade</h3><p>Sem promessa de fluência. Cada episódio, aula ou conversa vira um pouco mais de vocabulário, no seu ritmo.</p></div>
</div>
</div>
</section>
${
  recentes.length
    ? `<section class="secao-v" aria-labelledby="guias-recentes"><div class="larg-v"><h2 id="guias-recentes">Guias para estudar melhor</h2>${listaDeGuias(recentes)}<p><a href="/guias">Ver todos os guias</a></p></div></section>`
    : ''
}
<section class="final-v" aria-labelledby="comece">
<div class="subindo" aria-hidden="true">${['rocket', 'bag', 'gate', 'recipe', 'door', 'summary'].map((p) => `<span lang="en">${p}</span>`).join('')}</div>
<div class="larg-v"><h2 id="comece" data-revelar>Abra um vídeo que você <mark class="marca-texto">já queria ver</mark>.</h2>
<p>Toque ou clique na primeira palavra nova e ela já fica guardada. Vale para aula e conversa também.</p>
<a class="botao" href="/app">Abrir o Frasy · grátis</a>
<p class="apoio">Sem cartão e sem instalar nada.</p></div>
</section>
`;
}

/**
 * Os estilos só da home (cores explícitas: o filme é sempre noite; o resto segue os tokens do site).
 *
 * Telas baixas (notebook 1366×768, 1536×730 com escala 125%): no topo da página o primeiro capítulo divide
 * a tela com o cabeçalho, então a caixa dele desconta `--altura-do-topo` (76px; 111px quando o menu desce
 * para a segunda linha, até 640px), e o título escala também pela altura (`7.8vh`), não só pela largura.
 * Sem isso o texto centralizado transbordava para cima do logo e o cartão da legenda saía da tela.
 */
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
.camada.filme{opacity:1;z-index:2}
.rolo-veu{position:absolute;inset:0;z-index:3;pointer-events:none;background:linear-gradient(90deg,rgba(14,11,9,.74) 0%,rgba(14,11,9,.2) 46%,rgba(14,11,9,0) 65%),linear-gradient(0deg,rgba(14,11,9,.55) 0%,rgba(14,11,9,0) 30%)}
.rolo-barra{position:absolute;z-index:3;left:0;bottom:0;height:3px;width:100%;transform-origin:left;transform:scaleX(var(--progresso,0));background:#EF4E22}
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
.capitulo:first-child .capitulo-fixo{height:calc(100vh - var(--altura-do-topo));height:calc(100svh - var(--altura-do-topo))}
.rolo{--altura-do-topo:76px}
.texto{max-width:620px;padding:0 max(24px,env(safe-area-inset-left,0px));margin-left:max(0px,calc((100vw - 1200px)/2))}
.capitulo .kicker{font:700 13px/1 var(--texto);letter-spacing:.12em;text-transform:uppercase;color:#F4774F;margin:0 0 clamp(10px,1.8vh,16px)}
.capitulo h1,.capitulo h2{font-size:clamp(34px,min(5.6vw,7.8vh),82px);line-height:.98;letter-spacing:-.04em;margin:0 0 18px;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,.45)}
.capitulo .corpo{font-size:clamp(17px,1.5vw,20px);color:#F3ECE0;max-width:30em;margin:0;text-shadow:0 2px 16px rgba(0,0,0,.5)}
.capitulo .acoes{margin-top:clamp(14px,2.4vh,26px)}
.leg{margin-top:clamp(14px,2.6vh,28px);max-width:560px;padding:18px 22px 20px;border-radius:18px;background:rgba(20,17,14,.8)}
.leg .selo{display:inline-flex;align-items:center;gap:8px;font:700 11px/1 var(--texto);letter-spacing:.1em;color:#fff;background:#EF4E22;padding:6px 9px;border-radius:999px;margin-bottom:10px}
.leg .selo i{width:7px;height:7px;border-radius:50%;background:#fff}
.leg .o{font:600 18px/1.35 var(--texto);color:#fff;margin:0}
.leg .o span{transition:opacity .12s}
.leg .t{margin:6px 0 0;font:800 24px/1.2 var(--titulo);color:#FFEA00;transition:opacity .2s,transform .2s}
.leg .t.oculta{opacity:0;transform:translateY(6px)}
.leg .modo{display:inline-flex;align-items:center;margin:0 0 10px 6px;padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.92);color:#26241F;font:700 11px/1 var(--texto);letter-spacing:.04em}
.leg .o .chave{position:relative;display:inline-block}
.leg .o .chave::after{content:"";position:absolute;left:0;right:6px;bottom:-2px;height:3px;border-radius:2px;background:#FFD166;transform-origin:left;transform:scaleX(0);transition:transform .45s cubic-bezier(.2,.7,.2,1)}
.leg .o .chave.acesa::after{transform:scaleX(1)}
.leg .t .chave{border-radius:4px;padding:0 3px;margin:0 -3px;transition:background .35s .15s,color .35s .15s}
.leg .t:not(.oculta) .chave{background:#FFD166;color:#26241F}
.leg .nota-chave{margin:8px 0 0;font:500 13px/1.35 var(--texto);color:#F3ECE0;opacity:.85;transition:opacity .3s .3s}
.leg .t.oculta+.nota-chave{opacity:0}
.marcas{position:absolute;inset:0;z-index:3;pointer-events:none}
.fio-do-som{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fio-do-som path{fill:none;stroke:#FF9A75;stroke-width:2;stroke-dasharray:6 6;animation:fio-anda 1.2s linear infinite;opacity:0;transition:opacity .3s}
.marcas.ligadas .fio-do-som path{opacity:.9}
@keyframes fio-anda{to{stroke-dashoffset:-24}}
.pulso-do-som{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#EF4E22;box-shadow:0 0 0 0 rgba(239,78,34,.7);opacity:0;transition:opacity .3s;animation:pulso-som 1.6s infinite}
.marcas.ligadas .pulso-do-som{opacity:1}
@keyframes pulso-som{to{box-shadow:0 0 0 26px rgba(239,78,34,0)}}
.contador-de-palavras{position:absolute;z-index:4;top:max(20px,env(safe-area-inset-top,0px));right:max(20px,env(safe-area-inset-right,0px));margin:0;display:flex;align-items:center;gap:8px;padding:8px 10px 8px 14px;border-radius:999px;background:rgba(255,255,255,.94);color:#26241F;font:700 13px/1 var(--texto);box-shadow:0 10px 24px rgba(0,0,0,.3)}
.contador-de-palavras b{display:inline-grid;place-items:center;min-width:26px;height:26px;padding:0 6px;border-radius:999px;background:#EF4E22;color:#fff;font-size:13px;font-variant-numeric:tabular-nums;transition:transform .25s}
.contador-de-palavras b.bateu{transform:scale(1.35)}
.palavra-voando{position:fixed;z-index:50;left:0;top:0;margin:0;padding:3px 7px;border-radius:6px;background:#FFD166;color:#26241F;font:800 18px/1.1 var(--titulo);pointer-events:none;transition:transform .7s cubic-bezier(.5,0,.2,1),opacity .7s}
@media (prefers-reduced-motion:reduce){.fio-do-som path,.pulso-do-som{animation:none}.leg .o .chave::after{transition:none}}
.secao-v{padding:110px 0 0}
.secao-v h2{font-size:clamp(36px,5vw,64px);margin:14px 0 18px;max-width:15em}
.peca-v{background:var(--superficie);border-radius:24px;overflow:hidden;box-shadow:0 0 0 1px var(--borda-fraca),var(--sombra-alta);display:flex;flex-direction:column}
.peca-v .midia{background:var(--superficie-2);aspect-ratio:16/10;overflow:hidden}
.peca-v .midia video,.peca-v .midia img{width:100%;height:100%;object-fit:cover;object-position:top left}
.peca-v .info{padding:20px 22px 24px}
.peca-v h3{font-size:26px;margin:0 0 8px}
.peca-v p{color:var(--suave);font-size:16px;margin:0}
.peca-v .chip{display:inline-block;margin-bottom:10px;font:700 12px/1 var(--texto);letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:999px;background:var(--acao);color:var(--acao-tinta)}
.peca-v .chip.breve{background:#211E19;color:#fff}
.capitulo h1,.capitulo h2,.secao-v h2,.interprete-v h2,.final-v h2,.peca-v h3,.passo h3{font-stretch:112%}
.marca-texto{color:inherit;padding:0 .12em;border-radius:.12em;background:linear-gradient(var(--marcador),var(--marcador)) no-repeat 0 100%/0% 100%;box-shadow:inset 0 -.1em 0 transparent;transition:background-size .9s cubic-bezier(.2,.7,.2,1) .25s,box-shadow .3s 1.1s,color .3s .5s}
.visto .marca-texto,.marca-texto.visto{background-size:100% 100%;box-shadow:inset 0 -.1em 0 var(--marcador-verde);color:var(--marcador-tinta)}
.js [data-revelar]{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.js [data-revelar].visto{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.js [data-revelar]{opacity:1;transform:none;transition:none}.marca-texto{transition:none}}
.fluxo-grade{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:56px;margin-top:40px;align-items:start}
.fluxo-tela{position:sticky;top:0;height:100vh;height:100svh;display:flex;flex-direction:column;justify-content:center;gap:16px}
.janela{border-radius:18px;overflow:hidden;background:var(--superficie);box-shadow:0 0 0 1px var(--borda-fraca),0 30px 60px -24px rgba(38,36,31,.35)}
.janela-barra{display:flex;align-items:center;gap:7px;padding:11px 14px;background:var(--superficie-2);border-bottom:1px solid var(--borda-fraca)}
.janela-barra i{width:11px;height:11px;border-radius:50%;background:var(--borda-fraca)}
.janela-barra span{margin-left:10px;font:600 12px/1 var(--texto);color:var(--suave);letter-spacing:.01em}
.janela-quadros{position:relative;aspect-ratio:4/3;background:var(--superficie-2)}
.quadro{position:absolute;inset:0;opacity:0;transition:opacity .45s ease}
.quadro.ativo{opacity:1}
.quadro video{width:100%;height:100%;object-fit:cover;display:block}
.fluxo-pontos{display:flex;flex-wrap:wrap;gap:6px 14px;font:600 13px/1 var(--texto);color:var(--suave)}
.fluxo-pontos span{display:flex;align-items:center;gap:7px;transition:color .3s}
.fluxo-pontos span::before{content:"";width:18px;height:3px;border-radius:2px;background:var(--borda-fraca);transition:background .3s,width .3s}
.fluxo-pontos .ativo{color:var(--tinta)}
.fluxo-pontos .ativo::before{width:30px;background:var(--acao)}
.fluxo-passos{list-style:none;margin:0;padding:10vh 0;counter-reset:passo}
.passo{min-height:80vh;display:flex;flex-direction:column;justify-content:center;gap:12px;position:relative;padding-left:30px;border-left:2px solid var(--borda-fraca);transition:border-color .3s}
.passo.ativo{border-left-color:var(--acao)}
.passo-n{font:800 15px/1 var(--titulo);font-stretch:112%;color:var(--acento-texto);letter-spacing:.04em}
.passo-nome{margin:0;font:700 13px/1 var(--texto);letter-spacing:.12em;text-transform:uppercase;color:var(--suave)}
.passo h3{font-size:clamp(28px,2.8vw,40px);margin:8px 0 10px;letter-spacing:-.03em}
.passo .passo-texto>p:last-child{margin:0;color:var(--suave);font-size:17px;max-width:30em}
.passo:not(.ativo) .passo-texto{opacity:.42;transition:opacity .35s}
.passo.ativo .passo-texto{opacity:1;transition:opacity .35s}
.passo-midia{display:none}
.tambem{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:72px}
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
.capitulo .acoes{display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px}
.ver-como{color:#fff;font:600 16px/1.2 var(--texto);text-decoration:none;border-bottom:1px solid rgba(255,255,255,.5);padding-bottom:2px;text-shadow:0 2px 12px rgba(0,0,0,.5)}
.ver-como:hover{color:#fff;border-bottom-color:#fff}
.capitulo .apoio{margin:12px 0 0;font:500 14px/1.4 var(--texto);color:#F3ECE0;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.capitulo .kicker{display:flex;align-items:center;gap:12px}
.capitulo h1 em,.capitulo h2 em{font-style:normal;padding:.01em .18em .04em;margin:0 -.04em;border-radius:.18em;-webkit-box-decoration-break:clone;box-decoration-break:clone;color:#26241F;text-shadow:none;background:linear-gradient(#FFD166,#FFD166) 0 56%/100% 88% no-repeat}
.capitulo .corpo mark{color:inherit;padding:0 .1em;margin:0 -.1em;background:linear-gradient(transparent 62%,rgba(255,209,102,.45) 62%) 0 0/100% 100% no-repeat}
.dia-cartas{list-style:none;margin:clamp(14px,2.4vh,24px) 0 0;padding:0;display:flex;flex-direction:column;gap:10px;max-width:480px}
.dia-carta{display:flex;justify-content:space-between;align-items:center;gap:14px;background:rgba(255,255,255,.95);color:#26241F;border-radius:14px;padding:11px 16px;box-shadow:0 14px 30px rgba(0,0,0,.35)}
.dia-carta:nth-child(2){margin-left:22px}.dia-carta:nth-child(3){margin-left:44px}
.dia-carta b{font:800 21px/1.1 var(--titulo);letter-spacing:-.02em}
.dia-carta small{display:block;margin-top:3px;font-size:13px;color:#5E5A50}
.dia-carta em{font:800 12px/1 var(--texto);font-style:normal;background:#FFD166;border-radius:999px;padding:5px 10px;white-space:nowrap}
.js .capitulo .kicker::before{content:"";height:2px;width:0;border-radius:2px;background:#F4774F;transition:width .7s cubic-bezier(.2,.7,.2,1)}
.js .capitulo.atual .kicker::before{width:30px}
.js .capitulo h1 em,.js .capitulo h2 em{color:inherit;text-shadow:inherit;background-size:0% 88%;transition:background-size .75s cubic-bezier(.2,.7,.2,1) .45s,color .3s ease .8s}
.js .capitulo.atual h1 em,.js .capitulo.atual h2 em{background-size:100% 88%;color:#26241F;text-shadow:none}
.js .capitulo .corpo mark{background-size:0% 100%;transition:background-size .9s cubic-bezier(.2,.7,.2,1) .9s}
.js .capitulo.atual .corpo mark{background-size:100% 100%}
.js .dia-carta{opacity:0;transform:translateY(-28px) rotate(-2deg);transition:opacity .45s ease,transform .45s cubic-bezier(.2,.7,.2,1)}
.js .capitulo.atual .dia-carta{opacity:1;transform:none;transition-delay:.25s}
.js .capitulo.atual .dia-carta:nth-child(2){transition-delay:.75s}.js .capitulo.atual .dia-carta:nth-child(3){transition-delay:1.25s}
.contador-de-palavras b.troca{animation:numero-entra .35s cubic-bezier(.2,.7,.2,1)}
@keyframes numero-entra{from{opacity:0;transform:translateY(8px)}}
.comparar .divisor::after{content:"⇄";display:grid;place-items:center;font:800 18px/1 var(--texto);color:#26241F;box-shadow:0 8px 22px rgba(0,0,0,.4)}
.comparar:focus-within .divisor::after{outline:3px solid #FFD166;outline-offset:2px}
.secao-v .lista-guias a{position:relative;padding-right:44px}
.secao-v .lista-guias a::after{content:"→";position:absolute;right:8px;top:50%;transform:translateY(-50%);font:800 20px/1 var(--texto);color:var(--acento-texto);transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.secao-v .lista-guias a:hover::after,.secao-v .lista-guias a:focus-visible::after{transform:translate(6px,-50%)}
.final-v{position:relative;overflow:hidden;isolation:isolate}
.final-v .apoio{margin:14px 0 0;font-size:14px;color:#C9BFAE}
.subindo{position:absolute;inset:0;z-index:-1;pointer-events:none}
.subindo span{position:absolute;bottom:-40px;padding:6px 14px;border-radius:999px;background:rgba(255,209,102,.14);color:rgba(255,255,255,.55);font:800 15px/1 var(--texto);animation:subir linear infinite}
.subindo span:nth-child(1){left:6%;animation-duration:19s;animation-delay:-3s}
.subindo span:nth-child(2){left:20%;animation-duration:24s;animation-delay:-12s}
.subindo span:nth-child(3){left:36%;animation-duration:21s;animation-delay:-8s}
.subindo span:nth-child(4){left:56%;animation-duration:26s;animation-delay:-18s}
.subindo span:nth-child(5){left:72%;animation-duration:20s;animation-delay:-5s}
.subindo span:nth-child(6){left:86%;animation-duration:23s;animation-delay:-14s}
@keyframes subir{to{transform:translateY(-900px)}}
@media (prefers-reduced-motion:reduce){
.js .capitulo .kicker::before{width:30px;transition:none}
.js .capitulo h1 em,.js .capitulo h2 em{background-size:100% 88%;color:#26241F;text-shadow:none;transition:none}
.js .capitulo .corpo mark{background-size:100% 100%;transition:none}
.js .dia-carta{opacity:1;transform:none;transition:none}
.contador-de-palavras b.troca{animation:none}
.subindo{display:none}}
@media (max-width:900px){
.dia-cartas{gap:8px}.dia-carta{padding:9px 13px}.dia-carta small{display:none}.dia-carta:nth-child(n){margin-left:0}
.ver-como{display:none}
.capitulo .apoio{font-size:13px}
.rota{display:none}
.fio-do-som{display:none}
.contador-de-palavras{font-size:12px;padding:6px 8px 6px 12px}
.rolo-veu{background:linear-gradient(0deg,rgba(14,11,9,.9) 0%,rgba(14,11,9,.25) 55%,rgba(14,11,9,.1) 100%)}
.capitulo-fixo{align-items:flex-end;padding-bottom:max(36px,env(safe-area-inset-bottom,0px))}
.capitulo h1,.capitulo h2{font-size:clamp(34px,10vw,52px)}
.leg{margin-top:18px}.leg .t{font-size:20px}
.fluxo-grade{grid-template-columns:1fr;gap:0}
.fluxo-tela{display:none}
.passo{min-height:0;padding:28px 0 28px 20px}
.passo:not(.ativo) .passo-texto{opacity:1}
.passo-midia{display:block;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px var(--borda-fraca),var(--sombra-alta);aspect-ratio:4/3;background:var(--superficie-2)}
.passo-midia video{width:100%;height:100%;object-fit:cover;display:block}
.tambem{grid-template-columns:1fr;margin-top:40px}
.interprete-v .grade,.tres{grid-template-columns:1fr}}
@media (max-width:640px){.rolo{--altura-do-topo:111px}}
`;
