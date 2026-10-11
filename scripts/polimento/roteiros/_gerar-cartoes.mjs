/**
 * GERA OS ROTEIROS DA TELA CARTÕES (`cartoes-*.json`) para `scripts/polimento/comparar.mjs`.
 *
 *     node scripts/polimento/roteiros/_gerar-cartoes.mjs
 *
 * Cada tela em quatro versões: 1280 e 390 de largura, tema claro e escuro. O app é comparado com o
 * protótipo dos cartões ENXUTOS (`docs/prototipos/cartoes-enxuto.html`, modo faixa, navegação "d"), que
 * abre direto na tela pelo endereço (`?ver=<tela>&quieto`). As folhas e a palavra aberta têm passos.
 *
 * O APP PRECISA DE DADOS: suba um servidor com banco de teste e semeie com
 * `scripts/polimento/semear-cartoes.mjs` (o cabeçalho dele diz como). Os estados da aba Hoje pedem
 * bancos diferentes: `hoje`, `hoje-pilha`, `palavras*`, `palavra-aberta`, `menu`, `ajustes` e `memoria` usam
 * `--estado=normal`; `hoje-feito`, `--estado=feito`; `hoje-primeiro`, `--estado=primeiro`;
 * `hoje-vazio`, `--estado=vazio`.
 *
 * A DIFERENÇA ESPERADA é a do dado real (textos, quantidades) e a do que ficou de fora desta fatia
 * (`fidelidade/ficou-de-fora.md`, "Cartões: fatias seguintes"): a comparação serve para olhar as duas
 * capturas lado a lado e conferir as peças que existem nos dois lados.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

const COMUNS = [
  '.q-palco.ct',
  '.q-cab.ct-cab',
  '.q-cab h1',
  '.fs-ficha',
  '.fs-ficha .fs-abrir',
  '.ct-abas',
  '.ct-abas .q-aba',
  '.q-cab > .q-ctl.ct-so-icone',
  '.ct-painel',
]
const FAIXA = [
  '.ct-atalhos',
  '.ct-atalho',
  '.q-cartao.ct-estado',
  '.ct-estado-mem',
  '.ct-chama i',
  '.px-anel.ct-anel-mini',
  '.ct-estado-teto',
  '.ct-estado-teto .q-barra',
  '.ct-continuar h2',
  '.q-linha.ct-linha-estudar',
  '.q-fim.ct-pilula',
  '.ct-tres b',
]

/** tela → [caminho no app, `?ver=` do protótipo, seletores, o que guardar no navegador do app, passos depois de abrir] */
const TELAS = {
  hoje: [
    '/cartoes',
    'hoje',
    ['.ct-hoje', '.ct-hoje .qv-contagem', '.ct-hoje h2', '.ct-hoje .q-ctl.pri', '.ct-tags-do-dia .q-tag', ...FAIXA],
  ],
  'hoje-pilha': [
    '/cartoes',
    'hoje-pilha',
    ['.ct-hoje', '.ct-hoje .qv-contagem', '.ct-hoje h2', '.ct-hoje-acoes .q-ctl.pri', '.q-ctl.ct-resto', ...FAIXA],
    /* A pilha é "vence mais do que cabe numa rodada": os limites da rodada baixos, no navegador. */
    { 'revisao.novasPorDia': '0', 'revisao.revisoesPorDia': '10' },
  ],
  'hoje-feito': [
    '/cartoes',
    'hoje-feito',
    ['.ct-feito', '.ct-festa', '.ct-feito h2', '.ct-feito .ct-semana li i', '.ct-feito .q-ctl.pri', ...FAIXA],
  ],
  'hoje-primeiro': [
    '/cartoes',
    'hoje-primeiro',
    ['.ct-hoje', '.ct-hoje .qv-contagem', '.ct-hoje h2', '.ct-hoje .q-ctl.pri', '.ct-atalho', '.ct-como', '.q-passos li'],
  ],
  'hoje-vazio': [
    '/cartoes',
    'hoje-vazio',
    ['.ct-vazio', '.ct-vazio h2', '.ct-tres-caminhos', '.ct-tres-caminhos .q-tile', '.ct-tres-caminhos .q-tile.pri'],
  ],
  palavras: [
    '/cartoes/palavras',
    'palavras',
    [
      '.ct-busca-fixa',
      '.ct-busca-fixa .qv-campo-busca',
      '.ct-filtros-botao',
      '.ct-selecionar',
      '.ct-estados',
      '.ct-estados .q-aba',
      '.ct-quantas',
      '.q-tabela.ct-tabela',
      '.q-tabela th',
      '.q-tabela td',
      '.qv-palavra',
      '.qv-estado',
      '.ct-volta',
      '.ct-origem-da-linha',
    ],
  ],
  'palavras-selecao': [
    '/cartoes/palavras',
    'palavras',
    ['.ct-faixa-sel', '.ct-faixa-sel .q-tempo', '.ct-faixa-sel .q-ctl', '.ct-cancelar', '.ct-caixa', '.ct-th-caixa'],
    undefined,
    [{ clicar: '.ct-selecionar' }, { esperar: 500 }],
  ],
  'palavra-aberta': [
    '/cartoes/palavras',
    'palavras',
    [
      'dialog.ct-gaveta',
      'dialog.ct-gaveta .dlg-cab h2',
      '.ct-ouvir .btn',
      '.ct-traducao-t',
      '.ct-cena',
      '.ct-cena-quadro',
      '.ct-cena blockquote',
      '.ct-historico',
      '.ct-pe-da-palavra',
      '.ct-pe-da-palavra .btn',
    ],
    undefined,
    [{ clicar: '.ct-tabela tbody tr' }, { esperar: 1800 }],
  ],
  memoria: [
    '/cartoes/memoria',
    'memoria',
    [
      '.q-cab.ct-cab-dentro',
      '.ct-cab-dentro .q-voltar',
      '.ct-kpis .q-num',
      '.ct-kpis .q-num b',
      '.ct-seq',
      '.ct-seq .ct-semana li i',
      '.ct-prev7',
      '.ct-prev7 .qv-barra',
      '.ct-mem-ret',
      '.ct-graf',
      '.ct-mem-prev',
      '.ct-prev30 i',
      '.ct-mem-cal',
      '.ct-cal i',
      '.ct-mem-botoes',
      '.ct-bh .q-barra',
      '.ct-mem-fases',
      '.ct-leg-fases li',
    ],
  ],
  menu: [
    '/cartoes',
    'hoje',
    ['dialog.ct-menu', 'dialog.ct-menu .dlg-cab h2', '.ct-menu-lista', '.ct-menu-lista .q-linha', '.ct-menu-lista .q-linha b'],
    undefined,
    [{ clicar: '.q-cab > .q-ctl.ct-so-icone' }, { esperar: 900 }],
  ],
  ajustes: [
    '/cartoes',
    'hoje',
    ['dialog.ct-ajustes', 'dialog.ct-ajustes .q-ajuste', '.qr-passo', '.ct-mais-ajustes', 'dialog.ct-ajustes .dlg-pe .q-ctl'],
    undefined,
    [{ clicar: '.ct-estado-teto' }, { esperar: 900 }],
  ],
}

/* As recompensas que o banco semeado acabou de ganhar abrem por cima da tela: fechadas uma a uma. */
const FECHAR_DIALOGOS = {
  js: "(async () => { for (let i = 0; i < 14; i++) { const d = [...document.querySelectorAll('dialog[open]')].pop(); if (!d) return; (d.querySelector('button.x, [aria-label=\"Fechar\"]') || [...d.querySelectorAll('button')].find((b) => /Resgatar|Pular|Fechar|Agora não|Entendi|Depois/.test(b.textContent || '')) || d.querySelector('button'))?.click(); await new Promise((r) => setTimeout(r, 500)); } })()",
}
const ESCURO_NO_APP = {
  js: "Promise.all([import('/src/lib/theme.ts').then((m) => m.applyDarkMode(true)), import('/src/lib/i18n.ts').then((m) => m.usarIdioma('pt-BR'))])",
}
const ESCURO_NO_PROTO = {
  js: "[...document.querySelectorAll('.px-barra button')].find((b) => /^Tema/.test(b.textContent.trim()))?.click()",
}

let n = 0
for (const [tela, [caminho, ver, seletores, guardar, depois = []]] of Object.entries(TELAS)) {
  for (const celular of [false, true]) {
    for (const escuro of [false, true]) {
      const nome = `cartoes-${tela}${celular ? '-celular' : ''}${escuro ? '-escuro' : ''}`
      const roteiro = {
        nome,
        prototipo: 'cartoes-enxuto',
        largura: celular ? 390 : 1280,
        altura: celular ? 844 : 960,
        ...(escuro ? { escuro: true } : {}),
        app: {
          caminho,
          ...(guardar ? { guardar } : {}),
          assentar: 3500,
          passos: [...(escuro ? [ESCURO_NO_APP, { esperar: 800 }] : []), FECHAR_DIALOGOS, { esperar: 1200 }, ...depois],
        },
        proto: {
          busca: `?ver=${ver}&quieto`,
          assentar: 3500,
          passos: [...(escuro ? [ESCURO_NO_PROTO, { esperar: 1200 }] : []), { esperar: 600 }, ...depois],
        },
        seletores: [
          ...COMUNS,
          ...seletores,
          ...(celular
            ? ['.q-trilho', '.q-trilho .q-item', '.ct-praticar', '.ct-praticar .q-aba']
            : ['.q-trilho .q-item']),
        ],
      }
      writeFileSync(join(AQUI, `${nome}.json`), JSON.stringify(roteiro, null, 2) + '\n')
      n++
    }
  }
}
console.log(n, 'roteiros')
