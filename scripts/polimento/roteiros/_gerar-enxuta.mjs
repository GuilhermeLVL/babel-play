/**
 * GERA OS ROTEIROS DAS TELAS ENXUTAS (`enxuta-*.json`), para o comparador.
 *
 *     node scripts/polimento/roteiros/_gerar-enxuta.mjs
 *     APP_URL=http://localhost:3201 node scripts/polimento/comparar.mjs scripts/polimento/roteiros/enxuta-capturar.json
 *
 * O protótipo é o `telas-enxutas.html`, aberto no endereço pronto de cada ponto
 * (`?telas=enxuta&ir=capturar|gravando|estado|jogar|organizar|favoritos|porque&limpo`, `enxuto.js:413-437`).
 * O app é levado ao MESMO ponto: o plano Grátis e o aparelho pelo modo de prova, que só existe em
 * desenvolvimento (`src/lib/polimento/planos.ts`), e a captura gravando com a mídia falsa do Chromium
 * (`midiaFalsa`, em `comparar.mjs`) e as falas da bancada da tela (`window.__simFalas`).
 *
 * Cada ponto sai em quatro roteiros: 1280 e 390 de largura, claro e escuro.
 * Para ver a arrumação de ANTES no app, acrescente `"babel.px.telasDeProva": "atual"` ao `guardar`.
 *
 * O arquivo começa com `_` e não é um roteiro: gera os que são.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

const PROPS = [
  'alignItems',
  'justifyContent',
  'flexWrap',
  'flexDirection',
  'minHeight',
  'maxWidth',
  'marginTop',
  'marginLeft',
  'whiteSpace',
  'textAlign',
  'gridTemplateColumns',
  'gridColumnStart',
  'order',
  'borderTopStyle',
  'textOverflow',
]

const USO_DO_GRATIS = {
  plano: 'free',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado: 0, teto: 0 },
  porNivel: { trechos: { usado: 0, teto: 0, restante: 0 }, aovivo: { usado: 0, teto: 0, restante: 0 } },
  tokensDeLlm: { usado: 0, teto: 0 },
  iaDeNuvem: { disponivel: true, motivo: null, mensagem: null },
  alivio: null,
  hoje: null,
}
/** A resposta de `/api/me/uso`, trocada na página antes de a captura abrir (o servidor local é self-host). */
const SERVIDOR = `(() => { const f = window.fetch; window.fetch = (u, o) => { const s = String(u && u.url ? u.url : u); if (s.includes('/api/me/uso')) return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(USO_DO_GRATIS)}), { status: 200, headers: { 'Content-Type': 'application/json' } })); return f(u, o); }; })()`

const tema = (escuro) =>
  `Promise.all([import('/src/lib/theme.ts').then((m) => m.applyDarkMode(${escuro})), import('/src/lib/i18n.ts').then((m) => m.usarIdioma('pt-BR'))])`
/** Banco novo abre apresentações e recompensas: fecha pelo botão, uma por vez. */
const FECHAR_AVISOS = `(async () => { for (let i = 0; i < 8; i++) { const d = [...document.querySelectorAll('dialog[open]')].pop(); if (!d) return; (d.querySelector('button.x, [aria-label="Fechar"]') || [...d.querySelectorAll('button')].find((b) => /Pular|Fechar|Agora não|Entendi|Depois/.test(b.textContent || '')) || d.querySelector('button'))?.click(); await new Promise((r) => setTimeout(r, 600)); } })()`
const NO_MENU = (nome) =>
  `[...document.querySelectorAll('.q-trilho .q-item, nav button')].find((b) => /${nome}/.test(b.textContent))?.click()`
const TOCAR = (seletor) => `document.querySelector(${JSON.stringify(seletor)})?.click()`
const TOCAR_O_TEXTO = (onde, texto) =>
  `[...document.querySelectorAll(${JSON.stringify(onde)})].find((b) => /${texto}/.test(b.textContent || ''))?.click()`
/** Os avisos da conta local (consentimento, preparo do modelo) não são do protótipo: saem da medida. */
const SO_A_TELA =
  "document.querySelectorAll('.px-vivo > :not(.px-vivo-topo):not(.pl-linha):not(.cel-conversa):not(.q-faixa):not(dialog)').forEach((e) => e.remove())"
const FALAS =
  "new Promise((ok) => { const i = setInterval(() => { if (window.__simFalas) { clearInterval(i); ok(window.__simFalas(['So, are we still shipping the roadmap today?', 'We ship it today, but the dashboard needs one more review.'])); } }, 250); })"
/** O tema do protótipo troca no botão da barra (escondida pelo `?limpo`: o toque vai por código). */
const TEMA_DO_PROTOTIPO =
  "[...document.querySelectorAll('.px-barra button')].find((b) => /^Tema/.test(b.textContent.trim()))?.click()"

const TOPO = [
  '.px-vivo-topo',
  "[data-px-vivo='capturar:Detectar']",
  '.ex-estado',
  '.ex-estado > svg:first-child',
  '.ex-estado-txt',
  '.ex-estado-txt b',
  '.ex-estado > svg:last-child',
  ".px-vivo-topo [role='switch']",
  ".px-vivo-topo [aria-label='Ajustes da captura']",
]
const FAIXA = ['.q-faixa', '.q-faixa .q-tempo', '.q-faixa .q-ctl.pri']
const PRONTA = [
  ...TOPO,
  '.px-pronto-miolo',
  '.px-pronto-miolo h2',
  '.px-pronto-miolo > p',
  ...FAIXA,
  "[data-px='flutuante']",
]
const GRAVANDO = [
  ...TOPO,
  ...FAIXA,
  '.ex-pausar',
  '.ex-pausar svg',
  '.ex-pausar-t',
  ".q-faixa [aria-label='Aumentar a letra']",
]
const ESTADO = [
  'dialog.folha-de-baixo[open]',
  '.pl-como',
  '.pl-como h2',
  '.pl-como .folha-rotulo',
  '.pl-nivs',
  '.pl-nivs .pj-niv',
  '.ex-sem-nuvem',
  '.ex-neste',
  '.ex-lista-da-folha',
  '.ex-lista-da-folha .q-linha',
  '.ex-lista-da-folha .q-linha .q-ic',
  '.ex-lista-da-folha .q-linha .q-ic svg',
  '.ex-lista-da-folha .q-linha b',
  '.ex-lista-da-folha .q-linha small',
  '.ex-lista-da-folha .q-linha .q-fim svg',
]
const JOGAR = [
  '.q-palco.qj',
  '.q-cab',
  '.q-cab .q-sobre',
  '.q-cab h1',
  '.q-cab > .q-chip',
  '.q-cab > .q-chip svg',
  '.ex-fonte-txt',
  '.qj-sugestao',
  '.qj-sugestao-linha',
  '.qj-sugestao .q-ic',
  '.qj-sugestao-texto',
  '.qj-sugestao .q-rotulo',
  '.qj-sugestao-texto b',
  '.qj-sugestao-texto small',
  '.ex-ligs',
  '.ex-lig',
  '.ex-lig svg',
  "[data-ex='porque']",
  "[data-ex='outra']",
  "[data-ex='sortear']",
  '.qj-sugestao-linha > .q-ctl.pri',
  '.qj-sugestao-linha > .q-ctl.pri svg',
  '.qj-trilha',
  '.qj-ferramentas',
  '.qj-ferramentas .q-abas',
  '.qj-ferramentas .q-aba',
  ".qj-ferramentas .q-aba[aria-selected='true']",
  '.qj-ferramentas .q-aba svg',
  '.qj-ferramentas > .q-chip',
  '.ex-organizar',
  '.ex-organizar svg',
  '.ex-organizar > span',
  '#grade-de-jogos',
]
const PORQUE = [...JOGAR, '.qj-porque', '.qj-porque li', '.qj-porque li svg', '.qj-porque li span']
const PAINEL = [
  'dialog.ex-organizar-dlg[open]',
  '.ex-organizar-dlg .dlg-cab',
  '.ex-organizar-dlg .dlg-cab .q-ic',
  '.ex-organizar-dlg .dlg-cab h2',
  '.ex-organizar-dlg .dlg-cab .qj-nota',
  '.ex-organizar-dlg .dlg-cab .x',
  '.ex-org-abas',
  '.ex-org-abas .q-abas',
  '.ex-org-abas .q-aba',
  ".ex-org-abas .q-aba[aria-selected='true']",
  '.ex-org-abas .q-aba svg',
  '.ex-organizar-dlg .dlg-corpo',
  '.ex-organizar-dlg .dlg-pe',
  '.ex-organizar-dlg .dlg-pe .q-ctl.pri',
]
const BUSCA = [
  ...PAINEL,
  '.ex-organizar-dlg .q-campo',
  '.ex-organizar-dlg .q-campo input',
  '.ex-organizar-dlg .qj-opcoes',
  '.ex-organizar-dlg .qj-opcoes .q-aba',
]
const ORDEM = [
  ...PAINEL,
  '.ex-organizar-dlg .qj-ordem',
  '.ex-organizar-dlg .qj-ordem > li',
  '.ex-organizar-dlg .qj-ordem > li b',
  '.ex-organizar-dlg .qj-ordem .q-acoes',
  '.ex-organizar-dlg .qj-ordem .q-ctl',
  '.ex-organizar-dlg .qj-estrela',
]

/** A captura do app: abre a tela pronta e tira o que é da conta local. */
const capturaDoApp = (escuro, depois = []) => [
  { js: SERVIDOR },
  { js: tema(escuro) },
  { esperar: 800 },
  { js: FECHAR_AVISOS },
  { esperar: 500 },
  { js: NO_MENU('Captur') },
  { esperar: 6000 },
  { js: FECHAR_AVISOS },
  ...depois,
  { js: SO_A_TELA },
  { js: tema(escuro) },
  { esperar: 600 },
]
/** O Jogar do app: banco novo abre a sala de escolha; a fonte da prova é a Trilha (não há gravações). */
const jogarDoApp = (escuro, depois = []) => [
  { js: tema(escuro) },
  { esperar: 800 },
  { js: FECHAR_AVISOS },
  { esperar: 400 },
  { js: NO_MENU('Jogar') },
  { esperar: 3000 },
  { js: FECHAR_AVISOS },
  { js: TOCAR_O_TEXTO('.qj-sala button', 'Trilha') },
  { esperar: 1200 },
  { js: TOCAR_O_TEXTO('button', 'Usar estas palavras') },
  { esperar: 3000 },
  { js: FECHAR_AVISOS },
  { js: tema(escuro) },
  { esperar: 600 },
  ...depois,
]

/**
 * Um ponto: o `ir` do protótipo e o que se faz no app para chegar ao mesmo lugar.
 * `midiaFalsa`: a captura começa de verdade, com o microfone falso do Chromium.
 */
const PONTOS = [
  { id: 'capturar', ir: 'capturar', app: (e) => capturaDoApp(e), seletores: PRONTA },
  {
    id: 'gravando',
    ir: 'gravando',
    midiaFalsa: true,
    app: (e) =>
      capturaDoApp(e, [
        { js: TOCAR("[data-testid='iniciar-captura']") },
        { esperar: 2500 },
        { js: TOCAR_O_TEXTO('button', 'Baixar e iniciar') },
        { esperar: 3000 },
        { js: FALAS },
        { esperar: 2500 },
      ]),
    assentar: 7000,
    seletores: GRAVANDO,
  },
  {
    id: 'estado',
    ir: 'estado',
    app: (e) => [...capturaDoApp(e), { js: TOCAR('.ex-estado') }, { esperar: 1800 }],
    seletores: ESTADO,
  },
  { id: 'jogar', ir: 'jogar', fonte: 'trilha', app: (e) => jogarDoApp(e), seletores: JOGAR },
  {
    id: 'organizar',
    ir: 'organizar',
    fonte: 'trilha',
    app: (e) => jogarDoApp(e, [{ js: TOCAR('.ex-organizar') }, { esperar: 1800 }]),
    seletores: BUSCA,
  },
  {
    id: 'favoritos',
    ir: 'favoritos',
    fonte: 'trilha',
    app: (e) =>
      jogarDoApp(e, [
        { js: TOCAR('.ex-organizar') },
        { esperar: 1200 },
        { js: TOCAR("[data-ex-secao='1']") },
        { esperar: 1500 },
      ]),
    seletores: ORDEM,
  },
  {
    id: 'porque',
    ir: 'porque',
    fonte: 'trilha',
    app: (e) => jogarDoApp(e, [{ js: TOCAR("[data-ex='porque']") }, { esperar: 1500 }]),
    seletores: PORQUE,
  },
]

let feitos = 0
for (const ponto of PONTOS)
  for (const celular of [false, true])
    for (const escuro of [false, true]) {
      const nome = `enxuta-${ponto.id}${celular ? '-celular' : ''}${escuro ? '-escuro' : ''}`
      /* O aparelho da prova é o computador nas duas larguras: com `&aparelho=celular` o protótipo põe na
         tela pronta a nota do tradutor do celular, que o app não tem (`ficou-de-fora.md`). */
      const busca = `?telas=enxuta&ir=${ponto.ir}&limpo${ponto.fonte ? `&fonte=${ponto.fonte}` : ''}`
      const roteiro = {
        nome,
        prototipo: 'telas-enxutas',
        largura: celular ? 390 : 1280,
        altura: celular ? 844 : 960,
        ...(escuro ? { escuro: true } : {}),
        ...(ponto.midiaFalsa ? { midiaFalsa: true } : {}),
        app: {
          caminho: '/',
          guardar: {
            'babel.px.planoDeProva': 'free',
            'babel.px.planosAVendaDeProva': 'essencial,premium,aovivo',
            'babel.px.aparelhoDeProva': 'pc',
          },
          passos: ponto.app(escuro),
        },
        proto: {
          busca,
          assentar: ponto.assentar ?? 4500,
          passos: escuro ? [{ js: TEMA_DO_PROTOTIPO }, { esperar: 1500 }] : [],
        },
        seletores: ponto.seletores,
        props: PROPS,
      }
      writeFileSync(join(AQUI, `${nome}.json`), JSON.stringify(roteiro, null, 2) + '\n')
      feitos++
    }
console.log(feitos, 'roteiros')
