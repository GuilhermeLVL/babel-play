// CARTÕES: a tela nova de cartões, a revisão melhorada, a navegação A/B/C e as portas do que estava
// escondido (cartoes.js, cartoes2.js, cartoes3.js + cartoes.css), sobre o
// CLONE do protótipo de polimento com a camada de ANÚNCIOS NO GRÁTIS (anuncios.js + anuncios.css)
// e a dos QUATRO PLANOS, aparelhos e nuvem (planos4.js + planos4.css).
// Monta docs/prototipos/cartoes.html a partir da captura de produção
// (captura.json + casca.json, tiradas com o Playwright em babel-play.pages.dev/?desenho=novo)
// e da camada de polimento (polimento.css + prototipo.js + auditoria.html).
// Uso: node docs/prototipos/cartoes-src/montar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const ler = (n) => readFileSync(join(aqui, n), 'utf8');
const cap = JSON.parse(ler('captura.json'));
const casca = JSON.parse(ler('casca.json'));

const miolo = (rootHtml) => rootHtml.match(/<main[^>]*>([\s\S]*)<\/main>/)[1];

const dados = {
  casca: casca.root,
  telas: {
    inicio: casca.inicio,
    capturar: cap.capturar.main,
    interprete: cap.interprete.main,
    jogar: cap.jogarTrilha.main,
    jogo: miolo(cap.jogo),
  },
  abas: cap.tabs,
  mais: cap.maisFundo,
  maisAvisos: cap.maisAvisos,
  paleta: cap.paleta.html,
  fonte: cap.fonte.html,
  auditoria: ler('auditoria.html'),
  sub: cap.sub,
};

const folhas = cap.css.filter((s) => !s.blocked);
const fontes = cap.css.find((s) => s.blocked)?.href;
const cssDeProducao = `/* questBiblioteca.css (do repositório: a tela pede conta e não dá para capturar) */\n${ler('producao-biblioteca.css')}\n/* modoInterprete.css (do repositório: a conversa pede microfone) */\n${ler('producao-interprete.css')}
/* questSessao.css + questLeitura.css (do repositorio) */
${ler('producao-sessao.css')}
/* questRevisao.css (do repositorio, sem edicao: a revisao pede conta) */
${ler('producao-revisao.css')}
/* questVocabulario.css (do repositorio, sem edicao: o vocabulario pede conta) */
${ler('producao-vocabulario.css')}\n` + folhas.map((s) => `/* ${s.href.split('/').pop()} */\n${s.text}`).join('\n');
const attrs = casca.htmlAttrs.map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`).join(' ');
// "<" vira escape unicode para o JSON nao fechar a tag de script; os separadores de linha saem.
const BARRA = String.fromCharCode(92);
const json = JSON.stringify(dados)
  .split('<')
  .join(BARRA + 'u003c')
  .split(String.fromCharCode(0x2028))
  .join('')
  .split(String.fromCharCode(0x2029))
  .join('');

const saida = `<!doctype html>
<html ${attrs} data-px="on">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Babel Play · protótipo conceitual: Cartões, versão enxuta com práticas novas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontes.replace(/&/g, '&amp;')}">
<style id="producao">
${cssDeProducao.replace(/<\/style/gi, '<\\/style')}
</style>
<style id="polimento">
${ler('polimento.css')}
${ler('efeitos.css')}
${ler('celular.css')}
${ler('telas.css')}
${ler('telas2.css')}
${ler('telas3.css')}
${ler('paineis.css')}
${ler('minis.css')}
${ler('jogos.css')}
${ler('jogos3.css')}
${ler('jogos4.css')}
${ler('agua.css')}
${ler('anuncios.css')}
${ler('planos4.css')}
${ler('cartoes.css')}
${ler('cartoes4.css')}
${ler('fontes.css')}
${ler('seletor.css')}
</style>
</head>
<body class="animations-on">
<div id="root"></div>
<script type="application/json" id="px-dados">${json}</script>
<script>
${ler('prototipo.js').split('/*MODULOS*/').join(ler('telas.js') + '\n' + ler('telas2.js') + '\n' + ler('telas3.js') + '\n' + ler('direto.js') + '\n' + ler('sentidos.js') + '\n' + ler('minis.js') + '\n' + ler('jogos.js') + '\n' + ler('jogos2.js') + '\n' + ler('jogos3.js') + String.fromCharCode(10) + ler('jogos4.js') + String.fromCharCode(10) + ler('jogos5.js') + String.fromCharCode(10) + ler('agua.js') + String.fromCharCode(10) + ler('anuncios.js') + String.fromCharCode(10) + ler('planos4.js') + String.fromCharCode(10) + ler('cartoes.js') + String.fromCharCode(10) + ler('cartoes2.js') + String.fromCharCode(10) + ler('cartoes3.js') + String.fromCharCode(10) + ler('cartoes4.js') + String.fromCharCode(10) + ler('fontes.js') + String.fromCharCode(10) + ler('seletor.js')).replace(/<\/script/gi, '<\\/script')}
</script>
</body>
</html>
`;

const destino = join(aqui, '..', process.env.SAIDA || 'cartoes-enxuto.html');
writeFileSync(destino, saida);
console.log(destino, (saida.length / 1024).toFixed(0) + ' KB');
