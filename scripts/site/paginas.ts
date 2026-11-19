/**
 * O TEXTO DAS PÁGINAS PÚBLICAS (pt-BR). Só o que o app faz de verdade (README, `src/core/planos.ts`,
 * `server/routes/billing.ts`), em linguagem de benefício e sem pressão (skill `copy-br-etica`): o
 * produto atende menores, então nada de urgência, contagem regressiva ou promessa de fluência.
 *
 * A home (filme por capítulos, telas reais do app) mora em `home.ts`.
 */
import type { Guia } from './guias';
import { escaparHtml } from './markdown';
import { cartoesDosPlanos, type PlanosDoSite } from './planosDoSite';

export const EMAIL_DE_CONTATO = 'contato@frasy.com.br';

export const listaDeGuias = (guias: Guia[]): string =>
  `<ul class="lista-guias">${guias
    .map(
      (g) =>
        `<li><a href="/guias/${g.slug}"><strong>${escaparHtml(g.titulo)}</strong><span>${escaparHtml(g.descricao)}</span></a></li>`,
    )
    .join('')}</ul>`;

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
<p>Com conta, você pode testar o ${escaparHtml(p.teste.plano)} por ${p.teste.dias} dias ou até ${p.teste.horas === 1 ? '1 hora' : `${p.teste.horas} horas`} de nuvem, o que acabar primeiro. Não pedimos cartão: quando o teste acaba, você volta ao Grátis e nada é cobrado sozinho.</p>
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
