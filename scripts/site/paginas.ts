/**
 * O TEXTO DAS PÁGINAS PÚBLICAS (pt-BR). Só o que o app faz de verdade (README, `src/core/planos.ts`,
 * `server/routes/billing.ts`), em linguagem de benefício e sem pressão (skill `copy-br-etica`): o
 * produto atende menores, então nada de urgência, contagem regressiva ou promessa de fluência.
 *
 * As PEÇAS de interface desenhadas nas páginas (seletor de som, legenda, cartão de revisão…) são
 * ilustração: `aria-hidden`, porque o texto ao lado já diz o mesmo. A exceção é o cartão que vira, na
 * faixa da revisão: é um `<details>` de verdade (o leitor de tela anuncia e abre a resposta).
 */
import type { Guia } from './guias';
import { escaparHtml } from './markdown';
import { cartoesDosPlanos, type PlanosDoSite } from './planosDoSite';

export const EMAIL_DE_CONTATO = 'contato@frasy.com.br';

const listaDeGuias = (guias: Guia[]): string =>
  `<ul class="lista-guias">${guias
    .map(
      (g) =>
        `<li><a href="/guias/${g.slug}"><strong>${escaparHtml(g.titulo)}</strong><span>${escaparHtml(g.descricao)}</span></a></li>`,
    )
    .join('')}</ul>`;

/* Ícones de traço (24×24, cor do texto), no desenho dos do app (lucide). */
const icone = (d: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE_ABA = icone('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01"/>');
const ICONE_TELA = icone('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>');
const ICONE_MIC = icone('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>');
const ICONE_VOZ = icone('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>');

/**
 * A CENA DA HOME: um quadro de vídeo desenhado (SVG) onde a fala em inglês aparece palavra por palavra,
 * a tradução surge embaixo, "beat" ganha o marca-texto e voa para a pilha de cartões. CSS puro, roda uma
 * vez (`layout.ts`, `.cena`); sem movimento, o quadro final. A frase é real e a tradução, correta.
 */
const CENA = `
<figure class="cena">
<div class="tela" aria-hidden="true">
<svg viewBox="0 0 320 208" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
<rect width="320" height="208" fill="#3B2D23"/>
<rect x="0" y="150" width="320" height="58" fill="#2A2019"/>
<rect x="30" y="22" width="132" height="98" rx="3" fill="#B9512C"/>
<circle cx="118" cy="78" r="17" fill="#F48A5C"/>
<path d="M30 120V92h14V80h12v14h10V70h16v22h12V84h14v16h12V76h18v44Z" fill="#7E3418"/>
<path d="M96 22v98M30 71h132" stroke="#2A2019" stroke-width="5"/>
<rect x="26" y="18" width="140" height="106" rx="5" fill="none" stroke="#2A2019" stroke-width="7"/>
<circle cx="262" cy="70" r="46" fill="#F6D9B8" opacity=".09"/>
<path d="M246 52h32l-7 22h-18Z" fill="#E7CBA6"/>
<path d="M262 74v76" stroke="#1E1712" stroke-width="4"/>
<rect x="244" y="148" width="36" height="6" rx="3" fill="#1E1712"/>
<rect x="150" y="116" width="100" height="40" rx="12" fill="#6A4733"/>
<rect x="142" y="104" width="116" height="22" rx="10" fill="#7A533C"/>
<circle cx="196" cy="84" r="11" fill="#1B1511"/>
<path d="M178 126c0-20 8-30 18-30s18 10 18 30Z" fill="#1B1511"/>
</svg>
<p class="tela-topo"><span>Aba do navegador</span><span><i></i>Ao vivo</span></p>
<div class="legenda">
<p class="fala" lang="en"><span>I'm</span><span>pretty</span><span><span class="salva">beat</span></span><span>after</span><span>work</span></p>
<p class="traducao"><span>Estou bem cansado depois do trabalho</span></p>
</div>
<p class="tela-barra"><span>18:42</span><b></b><span>41:05</span></p>
</div>
<span class="voo" aria-hidden="true" lang="en">beat</span>
<div class="pilha" aria-hidden="true">
<span class="carta c1"></span><span class="carta c2"></span>
<span class="carta c3"><span class="miudo">Palavra salva</span><strong lang="en">beat</strong><em>cansado, exausto</em></span>
<span class="contagem">Para revisar <b><span class="antes">12</span><span class="depois">13</span></b></span>
</div>
<figcaption class="so-leitor">Exemplo: num vídeo em inglês, a fala “I'm pretty beat after work” vira legenda com a tradução “Estou bem cansado depois do trabalho”. A palavra “beat” é salva e vai para os cartões de revisão.</figcaption>
</figure>`;

const PASSOS = `
<ol class="passos">
<li>
<div class="vinheta peca" aria-hidden="true">
<p class="miudo">De onde vem o som?</p>
<span class="opcao sim">${ICONE_ABA}Uma aba do navegador</span>
<span class="opcao">${ICONE_TELA}O áudio do computador</span>
<span class="opcao">${ICONE_MIC}O microfone</span>
</div>
<p class="passo-n">1</p>
<h3>Escolha o som</h3><p>Uma aba do navegador com vídeo ou aula, o áudio do computador ou o microfone, para uma conversa ao vivo.</p>
</li>
<li>
<div class="vinheta peca" aria-hidden="true">
<div class="bolha-legenda"><p lang="en">Can we <span class="sublinhada">push</span> the meeting to Friday?</p><p>Podemos adiar a reunião para sexta?</p></div>
<div class="popover"><div><b lang="en">push (to)</b><span>adiar (para)</span></div><span class="mini-btn">Salvar</span></div>
</div>
<p class="passo-n">2</p>
<h3>Entenda na hora</h3><p>A fala vira legenda no idioma original, com a tradução logo abaixo. Viu uma palavra nova? Salve com um toque.</p>
</li>
<li>
<div class="vinheta peca" aria-hidden="true">
<div class="topo-peca"><span class="miudo">Revisão de hoje</span><span class="num">3 de 13</span></div>
<div class="cartao-revisao">
<span class="palavra marcado" lang="en">beat</span>
<p class="sig">cansado, exausto</p>
<p class="ex" lang="en">I'm pretty beat after work.</p>
<div class="respostas"><span>Errei</span><span>Difícil</span><span>Bom</span><span>Fácil</span></div>
</div>
</div>
<p class="passo-n">3</p>
<h3>Pratique depois</h3><p>O que você salvou volta em revisões espaçadas e em jogos curtos, feitos com o seu próprio vocabulário.</p>
</li>
</ol>`;

/** As faixas de "O que você encontra": [título, texto (revisado: não acrescentar promessa), peça]. */
const FAIXAS: [string, string, string][] = [
  [
    'Revisão que respeita sua memória',
    'A revisão espaçada traz cada palavra de volta perto da hora em que você esqueceria, e não todo dia.',
    `<details class="virar"><summary><span class="face"><span class="palavra marcado" lang="en">push (to)</span>` +
      `<span class="dica"><span>Lembra o que é?</span><b>Virar o cartão</b></span></span></summary>` +
      `<div class="face verso"><p class="miudo">Resposta</p><p class="sig">adiar (para)</p>` +
      `<p class="ex" lang="en">Can we push the meeting to Friday?</p></div></details>`,
  ],
  [
    'Jogos com as suas palavras',
    'Memória, ditado, caça-palavras e outros jogos curtos. O que você acerta conta na revisão.',
    `<div aria-hidden="true"><div class="topo-peca sob"><span class="miudo">Memória</span><span class="num">2 de 4 pares</span></div>` +
      `<div class="memoria"><span class="par" lang="en">beat</span><span class="fechada"></span><span class="aberta" lang="en">deadline</span><span class="par">cansado</span>` +
      `<span class="fechada"></span><span class="par" lang="en">push</span><span class="aberta">prazo</span><span class="par">adiar</span></div></div>`,
  ],
  [
    'Modo intérprete',
    'Duas pessoas que não falam a mesma língua conversam com um aparelho só, e a tradução é lida em voz alta.',
    `<div class="conversa" aria-hidden="true">` +
      `<div class="fala-de a"><span class="num">pt</span><p>Onde fica a estação de trem?</p><p lang="en">Where is the train station?</p></div>` +
      `<div class="fala-de b"><span class="num">en</span><p lang="en">Two blocks that way, on the left.</p><p>Duas quadras para lá, à esquerda.</p></div>` +
      `<span class="voz">${ICONE_VOZ}Lendo a tradução em voz alta</span></div>`,
  ],
  [
    'Traga o que você já estuda',
    'Importe baralhos do Anki, textos em PDF, DOCX ou TXT e legendas SRT, VTT ou ASS. Tudo é lido no navegador.',
    `<ul class="arquivos" aria-hidden="true">` +
      `<li><span class="tipo">APKG</span><span class="nome">vocabulario-ingles.apkg</span><span class="num">1.240 notas</span></li>` +
      `<li><span class="tipo">PDF</span><span class="nome">capitulo-3.pdf</span><span class="num">18 págs.</span></li>` +
      `<li><span class="tipo">SRT</span><span class="nome">episodio-05.srt</span><span class="num">612 falas</span></li></ul>`,
  ],
  [
    'Uma trilha por nível',
    'Listas de palavras reais organizadas por nível (do A1 ao C2) em 16 idiomas, para saber o que estudar a seguir.',
    `<div class="coluna" aria-hidden="true"><div class="niveis"><span class="feito">A1</span><span class="feito">A2</span><span class="agora">B1</span><span>B2</span><span>C1</span><span>C2</span></div>` +
      `<div class="barra-nivel"></div><div class="topo-peca"><span class="miudo">Inglês, nível B1</span><span class="num">38%</span></div>` +
      `<ul class="palavras-nivel" lang="en"><li>although</li><li>borrow</li><li>complain</li><li>deadline</li></ul></div>`,
  ],
  [
    'No seu aparelho primeiro',
    'Por padrão, a transcrição e a tradução rodam no navegador. A nuvem só entra com o seu consentimento: quando você a escolhe ou quando o aparelho não dá conta.',
    `<div class="coluna" aria-hidden="true"><p class="miudo">Onde a fala é processada</p>` +
      `<span class="opcao sim">${ICONE_TELA}Neste aparelho</span>` +
      `<span class="opcao">${icone('<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12.5 3.5 3.5 0 0 0 6 19Z"/>')}Na nuvem, só se você permitir</span></div>`,
  ],
];

export function corpoDaHome(guias: Guia[]): string {
  const recentes = guias.slice(0, 3);
  const faixas = FAIXAS.map(
    ([t, p, peca]) =>
      `<div class="faixa"><div class="faixa-texto"><h3>${t}</h3><p>${p}</p></div><div class="faixa-peca peca">${peca}</div></div>`,
  ).join('\n');
  return `
<section class="heroi">
<div>
<h1>Aprenda idiomas com o que você já assiste e escuta</h1>
<p class="lead">O Frasy coloca legenda e tradução ao vivo em vídeos, aulas, podcasts e chamadas. As palavras que você salvar viram revisão e jogos curtos, no seu ritmo.</p>
<div class="acoes"><a class="botao" href="/app">Abrir o Frasy</a><a class="botao contorno" href="/planos">Ver os planos</a></div>
<p class="nota">Grátis e sem conta para começar. Funciona no navegador; no computador, o Chrome e o Edge capturam o som de uma aba.</p>
</div>
${CENA}
</section>

<section class="secao" aria-labelledby="como-funciona">
<h2 id="como-funciona">Como funciona</h2>
<p class="secao-lead">Três passos, do som que você já ouve até a palavra que fica.</p>
${PASSOS}
</section>

<section class="secao" aria-labelledby="o-que-encontra">
<h2 id="o-que-encontra">O que você encontra no Frasy</h2>
<div class="faixas">
${faixas}
</div>
</section>

<section class="editorial" aria-labelledby="tranquilidade">
<h2 id="tranquilidade">Feito para estudar com tranquilidade</h2>
<p>O Frasy não promete fluência em poucos dias. Ele ajuda você a entender um pouco mais a cada episódio, aula ou conversa, e a não esquecer o que aprendeu.</p>
<p>Menores de 18 anos usam um perfil protegido: não fazem compras nem recebem ofertas de plano, e quem decide qualquer pagamento é o responsável, pela conta dele vinculada à do estudante.</p>
<p>Quando você quiser mais qualidade, pode ligar a nuvem, sempre com o seu consentimento e com provedores que se comprometem a não guardar o que recebem nem usar para treinar modelos. Veja <a href="/privacidade">como tratamos os dados</a>.</p>
</section>
${
  recentes.length
    ? `<section class="secao" aria-labelledby="guias-recentes"><h2 id="guias-recentes">Guias para estudar melhor</h2>${listaDeGuias(recentes)}<p><a href="/guias">Ver todos os guias</a></p></section>`
    : ''
}
<section class="fim" aria-labelledby="comece">
<div><h2 id="comece">Comece agora</h2>
<p>Abra o Frasy, escolha um vídeo que você já queria ver e salve as primeiras palavras. Leva um minuto.</p></div>
<div class="acoes"><a class="botao" href="/app">Abrir o Frasy</a></div>
</section>
`;
}

export function corpoDosPlanos(p: PlanosDoSite): string {
  const emBreve = p.emBreve.length
    ? `<p class="nota">Em breve: ${p.emBreve.map(escaparHtml).join(' e ')}. Ainda não estão à venda.</p>`
    : '';
  return `
<div class="cabeca">
<h1>Planos</h1>
<p class="lead">Tudo o que roda no seu aparelho é grátis. Os planos pagos acrescentam a nuvem, para quando você quiser mais qualidade ou o aparelho não der conta.</p>
</div>
${cartoesDosPlanos(p)}
${emBreve}
<section class="secao" aria-labelledby="teste">
<h2 id="teste">Teste sem cartão</h2>
<div class="aviso peca">
<p>Com conta, você pode testar o ${escaparHtml(p.teste.plano)} por ${p.teste.dias} dias ou até ${p.teste.horas} horas de nuvem, o que acabar primeiro. Não pedimos cartão: quando o teste acaba, você volta ao Grátis e nada é cobrado sozinho.</p>
</div>
</section>
<section class="secao" aria-labelledby="pagamento">
<h2 id="pagamento">Perguntas sobre pagamento</h2>
<div class="perguntas">
<details class="pergunta"><summary>Como eu pago?</summary><p>O pagamento é feito pelo Asaas, com Pix, boleto ou cartão. No plano anual você pode pagar à vista ou parcelar.</p></details>
<details class="pergunta"><summary>Posso cancelar quando quiser?</summary><p>Sim. Pelo próprio app, em Planos, na aba Sua assinatura. Você continua com o plano até o fim do período pago, e o seu progresso fica guardado. No anual parcelado, a tela mostra as condições antes de você confirmar.</p></details>
<details class="pergunta"><summary>Menores de idade podem assinar?</summary><p>Não sozinhos. Contas de menores de 18 anos não compram nem começam o teste: o responsável faz isso pela conta dele, vinculada à do estudante.</p></details>
<details class="pergunta"><summary>O que acontece quando acabam as horas de nuvem do mês?</summary><p>A legenda e a tradução continuam no aparelho, sem custo. As horas voltam no mês seguinte.</p></details>
</div>
<p class="nota">Os preços desta página saem da mesma tabela que o app usa. Antes de assinar, o app mostra o valor final.</p>
</section>
`;
}

export function corpoDoSobre(): string {
  return `
<article class="prosa cabeca">
<h1>Sobre o Frasy</h1>
<p class="lead">O Frasy nasceu de uma ideia simples: quem gosta de uma série, de um jogo ou de um podcast em outro idioma já está estudando um pouco. Falta só não deixar as palavras passarem.</p>
<h2>O que ele faz</h2>
<p>O Frasy transcreve e traduz ao vivo o som que você escolhe: uma aba do navegador, o áudio do computador ou o microfone. Você salva as palavras e frases que quiser aprender, e elas voltam em revisões espaçadas e em jogos curtos. Também dá para importar baralhos do Anki, documentos e legendas.</p>
<h2>No que acreditamos</h2>
<ul>
<li><strong>Seu aparelho primeiro.</strong> Por padrão, os modelos de transcrição e tradução rodam no navegador, e o que você salva sem conta fica no próprio aparelho.</li>
<li><strong>Nuvem só com o seu sim.</strong> A nuvem é opcional: entra quando você a escolhe ou quando o aparelho não dá conta, sempre depois do seu consentimento, que você pode retirar em Ajustes. Ela usa provedores que se comprometem a não guardar o que recebem nem usar para treinar modelos.</li>
<li><strong>Estudo sem pressão.</strong> Nada de contagem regressiva, de culpa ou de promessa de fluência. O Frasy é usado também por crianças e adolescentes, com um perfil protegido, sem compras nem ofertas.</li>
<li><strong>Transparência.</strong> O código é aberto, e a <a href="/privacidade">Política de Privacidade</a> diz o que roda no aparelho e o que vai para a nuvem.</li>
</ul>
<h2>Quem faz</h2>
<p>O Frasy é feito por Guilherme, desenvolvedor independente no Brasil. O código está no <a href="https://github.com/GuilhermeLVL/babel-play" rel="noopener">GitHub</a>, onde você também pode sugerir melhorias.</p>
<p>Dúvidas, ideias ou problemas? <a href="/contato">Fale com a gente</a>.</p>
</article>
`;
}

export function corpoDoContato(): string {
  return `
<article class="prosa cabeca">
<h1>Contato</h1>
<p class="lead">Escreva para <a href="mailto:${EMAIL_DE_CONTATO}">${EMAIL_DE_CONTATO}</a>. Respondemos por ordem de chegada, em dias úteis.</p>
<h2>Para ajudar a gente a ajudar você</h2>
<ul>
<li>Conte o que você tentou fazer e o que aconteceu.</li>
<li>Diga o navegador e o aparelho (por exemplo, Chrome no Windows ou Safari no iPhone).</li>
<li>Se apareceu um código de erro na tela, copie no e-mail.</li>
<li>Nunca envie senhas nem dados do cartão.</li>
</ul>
<h2>Assuntos frequentes</h2>
<ul>
<li><strong>Pagamento, nota fiscal ou cancelamento:</strong> inclua o e-mail da sua conta.</li>
<li><strong>Privacidade e seus dados:</strong> pedidos de acesso, correção ou exclusão também vão para este e-mail. No app, em Ajustes, você já pode baixar uma cópia dos seus dados (aba Privacidade) ou excluir a conta (aba Conta).</li>
<li><strong>Responsáveis por menores:</strong> escreva do e-mail da conta do responsável.</li>
</ul>
<p>Antes de escrever, talvez a resposta já esteja na <a href="/ajuda">Ajuda</a>.</p>
</article>
`;
}

const PERGUNTAS: [string, string][] = [
  [
    'Preciso criar uma conta?',
    'Não. Sem conta, tudo o que roda no aparelho funciona, e o que você salva fica no próprio navegador. A conta serve para guardar o progresso entre aparelhos e para usar a nuvem dos planos.',
  ],
  [
    'Em quais navegadores o Frasy funciona?',
    'O melhor é o Chrome ou o Edge no computador: são eles que capturam o som de uma aba. No celular e em outros navegadores, o Frasy usa o microfone.',
  ],
  [
    'Como coloco legenda num vídeo do navegador?',
    'Abra o Frasy, vá em Capturar e escolha a aba do vídeo. Na janela do navegador, marque a opção de compartilhar o áudio da aba. A legenda e a tradução aparecem enquanto o vídeo toca.',
  ],
  [
    'O que roda no aparelho e o que vai para a nuvem?',
    'Por padrão, a transcrição e a tradução rodam no navegador, com modelos baixados uma vez. A nuvem (e o reconhecimento de voz do próprio navegador, a opção Rápido do microfone) só é usada depois do seu consentimento, que você pode retirar em Ajustes. A nuvem usa provedores que se comprometem a não guardar o que recebem nem usar para treinar modelos. Detalhes na Política de Privacidade.',
  ],
  [
    'A primeira vez demora. É normal?',
    'Sim. Na primeira vez o navegador baixa os modelos de transcrição e tradução. Depois eles ficam guardados no aparelho e o Frasy abre mais rápido.',
  ],
  [
    'Como funciona a revisão?',
    'É a repetição espaçada: cada palavra volta em intervalos que crescem conforme você lembra dela. Errou? Ela volta mais cedo. Assim você revisa pouco e esquece menos.',
  ],
  [
    'Posso trazer meu baralho do Anki?',
    'Pode. O arquivo .apkg é lido no próprio navegador, assim como textos em PDF, DOCX e TXT e legendas SRT, VTT e ASS.',
  ],
  [
    'Quanto custa?',
    'O que roda no aparelho é grátis. Os planos pagos acrescentam horas de nuvem e outros recursos; os valores estão na página de planos.',
  ],
  [
    'Como cancelo a assinatura?',
    'No app, em Planos, na aba Sua assinatura. O plano continua até o fim do período pago, e o seu progresso fica guardado.',
  ],
  [
    'O Frasy é seguro para crianças e adolescentes?',
    'Menores de 18 anos usam um perfil protegido: sem compras e sem ofertas de plano. O teste e a assinatura só podem ser feitos pelo responsável, pela conta dele vinculada à do estudante.',
  ],
  [
    'Como excluo minha conta e meus dados?',
    'No app, em Ajustes: na aba Privacidade você baixa uma cópia dos seus dados, e na aba Conta você exclui a conta. Se precisar de ajuda, escreva para ' +
      EMAIL_DE_CONTATO +
      '.',
  ],
];

export function corpoDaAjuda(): string {
  const faq = PERGUNTAS.map(
    ([p, r]) => `<details class="pergunta"><summary>${escaparHtml(p)}</summary><p>${escaparHtml(r)}</p></details>`,
  ).join('\n');
  return `
<div class="cabeca">
<h1>Ajuda</h1>
<p class="lead">Respostas rápidas para as dúvidas mais comuns. Não achou? Escreva para <a href="mailto:${EMAIL_DE_CONTATO}">${EMAIL_DE_CONTATO}</a>.</p>
</div>
<section aria-labelledby="faq">
<h2 id="faq">Perguntas frequentes</h2>
<div class="perguntas">
${faq}
</div>
</section>
<section class="secao prosa" aria-labelledby="atalhos">
<h2 id="atalhos">Atalhos de teclado</h2>
<div class="tabela"><table><thead><tr><th scope="col">Tecla</th><th scope="col">O que faz</th></tr></thead><tbody>
<tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd></td><td>Buscar gravação, palavra ou tela</td></tr>
<tr><td><kbd>Espaço</kbd></td><td>Mostrar a resposta na revisão</td></tr>
<tr><td><kbd>1</kbd> a <kbd>4</kbd></td><td>Responder a revisão</td></tr>
<tr><td><kbd>Esc</kbd></td><td>Fechar painel ou diálogo</td></tr>
</tbody></table></div>
<p>Quer ir além? Os <a href="/guias">guias</a> mostram como estudar com séries, podcasts e reuniões.</p>
</section>
`;
}

export function corpoDosGuias(guias: Guia[]): string {
  return `
<div class="cabeca">
<h1>Guias</h1>
<p class="lead">Como aprender idiomas com séries, podcasts, músicas e conversas, e como fazer a revisão trabalhar a seu favor.</p>
</div>
${guias.length ? listaDeGuias(guias) : '<p>Os primeiros guias estão sendo revisados e chegam em breve.</p>'}
`;
}

const dataPorExtenso = (iso: string): string => {
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${meses[m - 1]} de ${a}`;
};

/** Os relacionados: os que dividem palavras-chave (mais em comum primeiro); completa com os mais recentes. */
export function guiasRelacionados(guia: Guia, todos: Guia[], quantos = 3): Guia[] {
  const minhas = new Set(guia.palavrasChave.map((c) => c.toLowerCase()));
  const palavrasDoTitulo = (g: Guia) =>
    new Set(
      `${g.titulo} ${g.palavrasChave.join(' ')}`
        .toLowerCase()
        .split(/[^a-zà-ú0-9]+/)
        .filter((p) => p.length > 3),
    );
  const meu = palavrasDoTitulo(guia);
  const pontos = (g: Guia) =>
    g.palavrasChave.filter((c) => minhas.has(c.toLowerCase())).length * 10 +
    [...palavrasDoTitulo(g)].filter((p) => meu.has(p)).length;
  return todos
    .filter((g) => g.slug !== guia.slug)
    .map((g, i) => ({ g, p: pontos(g), i }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, quantos)
    .map((x) => x.g);
}

/** Âncora de um título: minúsculas sem acento, hífens. */
const ancora = (texto: string): string =>
  texto
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * O SUMÁRIO DO GUIA: dá `id` a cada `<h2>` do corpo (únicos) e devolve a lista para a coluna lateral.
 * O texto do título já vem escapado do Markdown; o sumário reaproveita o mesmo HTML.
 */
export function sumarioDoGuia(html: string): { html: string; itens: { id: string; titulo: string }[] } {
  const itens: { id: string; titulo: string }[] = [];
  const usados = new Set<string>();
  const comIds = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, titulo: string) => {
    const base = ancora(titulo) || 'secao';
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
    usados.add(id);
    itens.push({ id, titulo });
    return `<h2 id="${id}">${titulo}</h2>`;
  });
  return { html: comIds, itens };
}

export function corpoDoGuia(guia: Guia, todos: Guia[]): string {
  const minutos = Math.max(1, Math.round(guia.palavras / 200));
  const relacionados = guiasRelacionados(guia, todos);
  const { html, itens } = sumarioDoGuia(guia.html);
  const sumario =
    itens.length > 1
      ? `<aside class="sumario" aria-labelledby="nesta-pagina"><p id="nesta-pagina">Nesta página</p><ol>${itens
          .map((i) => `<li><a href="#${i.id}">${i.titulo.replace(/<[^>]*>/g, '')}</a></li>`)
          .join('')}</ol></aside>`
      : '';
  return `
<nav aria-label="Trilha" class="trilha"><a href="/guias">Guias</a></nav>
<div class="guia-grade">
<article class="prosa">
<h1>${escaparHtml(guia.titulo)}</h1>
<p class="meta"><span>Publicado em <time datetime="${guia.publicado}">${dataPorExtenso(guia.publicado)}</time></span><span>Leitura de ${minutos} min</span></p>
${html}
</article>
${sumario}
</div>
<section class="pratique peca" aria-labelledby="pratique">
<h2 id="pratique">Pratique com o Frasy</h2>
<p>Abra um vídeo ou podcast, ligue a legenda com tradução e salve as palavras novas. Elas voltam na revisão no momento certo.</p>
<div class="acoes"><a class="botao" href="/app">Abrir o Frasy</a></div>
</section>
${relacionados.length ? `<section class="relacionados" aria-labelledby="relacionados"><h2 id="relacionados">Guias relacionados</h2>${listaDeGuias(relacionados)}</section>` : ''}
`;
}

export function corpoDo404(): string {
  return `
<div class="perdido">
<div class="bolha-legenda" aria-hidden="true"><p lang="en">Sorry, this page isn't here.</p><p>Desculpe, esta página não está aqui.</p></div>
<h1>Página não encontrada</h1>
<p class="lead">O endereço pode ter mudado ou ter sido digitado com algum erro. Para voltar, comece pelo início ou abra o app.</p>
<div class="acoes"><a class="botao" href="/">Ir para o início</a><a class="botao contorno" href="/app">Abrir o Frasy</a></div>
<p class="nota">Procurando ajuda? Veja a <a href="/ajuda">Ajuda</a> ou os <a href="/guias">guias</a>.</p>
</div>
`;
}
