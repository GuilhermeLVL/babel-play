/**
 * GERA OS ROTEIROS DA TELA CARTÕES (`cartoes-*.json`) para `scripts/polimento/comparar.mjs`.
 *
 *     node scripts/polimento/roteiros/_gerar-cartoes.mjs
 *
 * Cada aba em quatro versões: 1280 e 390 de largura, tema claro e escuro. O app é comparado com o
 * protótipo dos cartões (`docs/prototipos/cartoes.html`), que abre direto na tela pelo endereço
 * (`?ver=<tela>&quieto&nav=a`; no celular, `nav=b`, a barra com o "Praticar").
 *
 * O APP PRECISA DE DADOS: suba um servidor com banco de teste e semeie com
 * `scripts/polimento/semear-cartoes.mjs` (o cabeçalho dele diz como). Os estados da aba Hoje pedem
 * bancos diferentes: `hoje`, `hoje-pilha`, `baralhos`, `palavras`, `trazer` e `memoria` usam
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
  '.q-cab',
  '.q-cab .q-sobre',
  '.q-cab h1',
  '.q-cab > .q-ctl',
  '.ct-abas',
  '.ct-abas .q-aba',
  '.ct-painel',
]

/** tela → [caminho no app, `?ver=` do protótipo, seletores da aba, o que guardar no navegador do app] */
const TELAS = {
  hoje: [
    '/cartoes',
    'hoje',
    [
      '.ct-hoje',
      '.ct-hoje .qv-contagem',
      '.ct-hoje h2',
      '.ct-hoje .q-ctl.pri',
      '.ct-tags-do-dia .q-tag',
      '.ct-recortes .q-chip',
      '.ct-ret',
      '.ct-ret .px-anel',
      '.ct-ret .px-anel b',
      '.ct-ret > .q-ctl',
      '.ct-prev7',
      '.ct-prev7 .qv-barras',
      '.ct-prev7 .qv-barra',
      '.q-linha.ct-linha-b',
      '.ct-tres',
      '.ct-tres b',
    ],
  ],
  'hoje-pilha': [
    '/cartoes',
    'hoje-pilha',
    ['.ct-hoje', '.ct-hoje .qv-contagem', '.ct-hoje h2', '.ct-hoje .q-ctl.pri', '.ct-recortes .q-chip', '.ct-prev7'],
    /* A pilha é "vence mais do que cabe numa rodada": os limites da rodada baixos, no navegador. */
    { 'revisao.novasPorDia': '0', 'revisao.revisoesPorDia': '10' },
  ],
  'hoje-feito': [
    '/cartoes',
    'hoje-feito',
    ['.ct-feito', '.ct-feito .q-ic', '.ct-feito h2', '.ct-depois-do-dia .q-ctl', '.ct-ret', '.ct-prev7'],
  ],
  'hoje-primeiro': [
    '/cartoes',
    'hoje-primeiro',
    [
      '.ct-hoje',
      '.ct-hoje .qv-contagem',
      '.ct-hoje h2',
      '.ct-hoje .q-ctl.pri',
      '.q-passos',
      '.q-passos li',
      '.ct-tres-caminhos .q-tile',
    ],
  ],
  'hoje-vazio': [
    '/cartoes',
    'hoje-vazio',
    [
      '.ct-vazio',
      '.ct-vazio h2',
      '.ct-tres-caminhos',
      '.ct-tres-caminhos .q-tile',
      '.ct-tres-caminhos .q-tile.pri',
      '.q-aviso',
    ],
  ],
  baralhos: [
    '/cartoes/baralhos',
    'baralhos',
    [
      '.ct-legenda',
      '.ct-legenda .q-tag',
      '.ct-bar-corpo',
      '.ct-bar-col',
      '.q-linha.ct-linha-b',
      '.ct-linha-b .q-ic',
      '.ct-tres',
      '.ct-tres b',
      '.ct-grupo h3',
      '.ct-novo-baralho',
      '.ct-bar-det',
      '.ct-bar-det h2',
      '.q-bib-fatos',
      '.q-bib-fatos dd',
      '.q-bib-acoes > .q-ctl.pri',
      '.q-bib-acoes .q-acoes > .q-ctl',
    ],
  ],
  palavras: [
    '/cartoes/palavras',
    'palavras',
    [
      "[data-testid='fases-do-baralho']",
      '.q-num',
      '.q-num b',
      '.qv-catalogo',
      '.qv-catalogo > header h2',
      '.qv-busca',
      '.qv-campo-busca',
      '.q-tabela',
      '.q-tabela th',
      '.q-tabela td',
      '.qv-palavra',
      '.qv-estado',
    ],
  ],
  trazer: [
    '/cartoes/trazer',
    'trazer',
    [
      '.ct-trazer-topo',
      '.ct-anki',
      '.ct-anki h2',
      '.ct-soltar',
      '.ct-soltar .q-ic',
      '.ct-soltar b',
      '.ct-soltar small',
      '.ct-levar',
      '.ct-levar h2',
      '.ct-levar .q-tile',
      '.ct-levar .q-tile b',
      '.ct-levar .q-tile .q-d',
    ],
  ],
  memoria: [
    '/cartoes/memoria',
    'memoria',
    [
      '.ct-kpis',
      '.ct-kpis .q-num',
      '.ct-kpis .q-num b',
      '.ct-mem-ret',
      '.ct-graf',
      '.ct-mem-prev',
      '.ct-prev30',
      '.ct-prev30 i',
      '.ct-mem-cal',
      '.ct-cal',
      '.ct-cal i',
      '.ct-cal-fatos',
      '.ct-mem-botoes',
      '.ct-bh',
      '.ct-bh .q-barra',
      '.ct-mem-fases',
      '.ct-pilha-h',
      '.ct-leg-fases li',
    ],
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
for (const [tela, [caminho, ver, seletores, guardar]] of Object.entries(TELAS)) {
  for (const celular of [false, true]) {
    for (const escuro of [false, true]) {
      const nome = `cartoes-${tela}${celular ? '-celular' : ''}${escuro ? '-escuro' : ''}`
      const roteiro = {
        nome,
        prototipo: 'cartoes',
        largura: celular ? 390 : 1280,
        altura: celular ? 844 : 960,
        ...(escuro ? { escuro: true } : {}),
        app: {
          caminho,
          ...(guardar ? { guardar } : {}),
          assentar: 3500,
          passos: [...(escuro ? [ESCURO_NO_APP, { esperar: 800 }] : []), FECHAR_DIALOGOS, { esperar: 1200 }],
        },
        proto: {
          busca: `?ver=${ver}&quieto&nav=${celular ? 'b' : 'a'}`,
          assentar: 3500,
          passos: [...(escuro ? [ESCURO_NO_PROTO, { esperar: 1200 }] : []), { esperar: 600 }],
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
