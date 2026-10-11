/**
 * GERA OS ROTEIROS DA REVISÃO ENXUTA E DAS PRÁTICAS (`revisao-enxuta-*.json`) para
 * `scripts/polimento/comparar.mjs`.
 *
 *     node scripts/polimento/roteiros/_gerar-revisao-enxuta.mjs
 *
 * Cada estado em duas larguras (1280 e 390). O app é comparado com o protótipo dos cartões enxutos
 * (`docs/prototipos/cartoes-enxuto.html`), que abre direto no estado pelo endereço (`?cx=<estado>`, os
 * mesmos da barra "Revisão e práticas", `cartoes4.js:1061-1086`).
 *
 * O APP PRECISA DE DADOS: suba um servidor com banco de teste e semeie com
 * `scripts/polimento/semear-revisao.mjs` (o cabeçalho dele diz como). Os roteiros `fim`, `praticar` e
 * `pr-completar` DÃO NOTAS no banco de teste (percorrem a sessão até o fim): semeie de novo antes de
 * cada um deles.
 *
 * A DIFERENÇA ESPERADA é a do dado real (a fila tem os cartões semeados, sem IPA; os intervalos são os
 * do FSRS de verdade) e a do que ficou de fora (`openspec/changes/cartoes/revisao-enxuta.md`).
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

const TOPO = ['.qr-topo', '.qr-topo .q-voltar', '.qr-progresso', '.qr-progresso .q-barra', '.qr-conta', '.cx-desfazer', '.cx-linha']
const CARTAO = ['.qr-cartao', '.ct-selos .qr-selo', '.termo', '.ct-frase', '.ct-frase .exemplo', '.ct-frase .exemplo mark']

/** Dá a nota "Bom" até a sessão acabar (as notas vão ao banco de teste). */
const ATE_O_FIM =
  "(async () => { for (let i = 0; i < 60 && !document.querySelector('[data-estado=\"fim\"]'); i++) { (document.querySelector('.fsrs .b') || document.querySelector('.qr-principal'))?.click(); await new Promise((r) => setTimeout(r, 450)); } })()"

/** estado → [`?cx=` do protótipo, passos no app, seletores] */
const ESTADOS = {
  frente: ['frente-inicio', [], [...TOPO, ...CARTAO, '.qr-dica', '.cx-fileira', '.cx-fileira .ct-som', '.qr-principal', '.cx-teclas']],
  'verso-cena': [
    'verso-cena',
    [{ clicar: '.qr-principal' }, { esperar: 1500 }],
    [
      ...TOPO,
      ...CARTAO,
      '.cx-icones',
      '.cx-icones .cx-ic',
      '.cx-resposta',
      '.cx-cena',
      '.cx-cena-quadro',
      '.cx-cena-tempo',
      '.cx-cena-de',
      '.cx-cena .cx-link',
      '.cx-resposta-texto',
      '.cx-resposta-texto b',
      '.ct-trad-da-frase',
      '.fsrs',
      '.fsrs button',
      '.fsrs button small',
      '.cx-teclas',
    ],
  ],
  mais: [
    'mais',
    [{ clicar: '.qr-principal' }, { esperar: 900 }, { clicar: '.cx-topo .cx-ic:not(.cx-desfazer)' }, { esperar: 1200 }],
    [
      'dialog.cx-folha-acoes',
      '.cx-folha-cab',
      '.cx-folha-cab .folha-pal',
      '.cx-folha-cab .folha-glosa',
      '.cx-folha-cab .cx-ic',
      '.cx-tres',
      '.cx-grande',
      '.cx-grande b',
      '.cx-grande small',
      '.cx-menores',
      '.cx-menores .folha-acao',
      '.folha-rotulo',
      '.cx-ajuste',
      '.cx-ajuste b',
      '.cx-ajuste small',
      '.cx-ajuste .q-interruptor',
      '.cx-folha-pe',
      '.cx-folha-pe .q-ctl',
      '.cx-encerrar',
    ],
  ],
  fim: [
    'fim',
    [{ js: ATE_O_FIM }, { esperar: 2600 }],
    [
      '.cx-fim',
      '.cx-fim .cx-topo',
      '.cx-fim .cx-topo h1',
      '.cx-desfazer',
      '.qr-fecho',
      '.qr-fecho .q-ic',
      '.qr-fecho h2',
      '.qr-numeros',
      '.q-num',
      '.q-num .q-rotulo',
      '.q-num b',
      '.cx-ganho',
      '.cx-ganho b',
      '.cx-mudou',
      '.cx-mudou h2',
      '.cx-subiu li',
      '.cx-subiu .q-tag',
      '.cx-subiu .q-chip',
      '.cx-fim-pe',
      '.cx-fim-pe .q-ctl.pri',
      '.cx-fim-pe .q-ctl:not(.pri)',
    ],
  ],
  praticar: [
    'praticar',
    [{ js: ATE_O_FIM }, { esperar: 2200 }, { clicar: '.cx-fim-pe .q-ctl.pri' }, { esperar: 1400 }],
    [
      'dialog.cx-folha-praticar',
      '.cx-folha-cab .folha-pal',
      '.cx-recorte',
      '.cx-recorte .q-tag',
      '.cx-ladrilhos',
      '.cx-ladrilho',
      '.cx-ladrilho .px-mini',
      '.cx-ladrilho b',
      '.cx-ladrilho .q-d',
      '.cx-selo.conta',
      '.cx-selo.leve',
    ],
  ],
  'pr-completar': [
    'pr-completar',
    [
      { js: ATE_O_FIM },
      { esperar: 2200 },
      { clicar: '.cx-fim-pe .q-ctl.pri' },
      { esperar: 1200 },
      { clicar: '[data-pratica="completar"]' },
      { esperar: 1800 },
    ],
    [
      '.cx-pr .cx-topo',
      '.cx-pr .qr-conta',
      '.cx-pr-linha',
      '.cx-pr-linha .q-tag',
      '.cx-pr-linha .cx-selo',
      '.cx-pr-cartao',
      '.cx-pr-cartao > .q-rotulo',
      '.cx-pr-frase-vao',
      '.cx-pr-frase-vao .qr-vao',
      '.cx-pr-quer',
      '.cx-pr-tocar',
      '.cx-pr-tocar .q-ctl',
      '.cx-pr-cartao .q-campo',
      '.cx-pr-cartao .q-campo input',
      '.cx-pr-cartao .cx-fileira',
      '.cx-pr-cartao .cx-fileira .q-ctl',
    ],
  ],
}

/* Os avisos de primeira vez do app (conquista, novidade) fecham antes dos passos. */
const FECHAR_AVISOS =
  "(async () => { for (let i = 0; i < 8; i++) { const d = [...document.querySelectorAll('dialog[open]')].pop(); if (!d) return; (d.querySelector('button.x, [aria-label=\"Fechar\"]') || d.querySelector('button'))?.click(); await new Promise((r) => setTimeout(r, 400)); } })()"

for (const [estado, [cx, passos, seletores]] of Object.entries(ESTADOS))
  for (const celular of [false, true]) {
    const nome = `revisao-enxuta-${estado}${celular ? '-celular' : ''}`
    const roteiro = {
      nome,
      prototipo: 'cartoes-enxuto',
      largura: celular ? 390 : 1280,
      altura: celular ? 844 : 900,
      ...(celular ? { toque: true } : {}),
      app: {
        caminho: '/cartoes/estudar',
        assentar: 3500,
        passos: [{ js: FECHAR_AVISOS }, { esperar: 800 }, ...passos],
      },
      proto: { busca: `?cx=${cx}&quieto&embutido`, assentar: 3500, passos: [{ esperar: 1800 }] },
      seletores,
    }
    writeFileSync(join(AQUI, `${nome}.json`), JSON.stringify(roteiro, null, 2) + '\n')
  }
console.log(`${Object.keys(ESTADOS).length * 2} roteiros da revisão enxuta`)
