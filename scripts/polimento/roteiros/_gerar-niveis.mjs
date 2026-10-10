/**
 * GERA OS ROTEIROS DO NÍVEL DE SERVIÇO NA CAPTURA (`niveis-*.json`), para o comparador.
 *
 *     node scripts/polimento/roteiros/_gerar-niveis.mjs
 *     PROTOTIPOS_DIR="<pasta com anuncios-no-gratis.html>" APP_URL=http://localhost:3194 \
 *       node scripts/polimento/comparar.mjs scripts/polimento/roteiros/niveis-gratis.json
 *
 * O protótipo é o `anuncios-no-gratis.html`, aberto no endereço pronto de cada estado (`?ver=…&quieto`,
 * `planos4.js:929-945`). O app é levado ao MESMO estado pelo modo de prova, que só existe em
 * desenvolvimento: o plano, os planos à venda e o aparelho (`src/lib/polimento/planos.ts`), o selo da
 * nuvem (`babel.px.seloDeProva`, em `views/captura/niveis/useNiveisDaCaptura.tsx`) e a resposta de
 * `/api/me/uso` trocada na página (o servidor local é self-host e não tem nuvem).
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
  'textTransform',
  'whiteSpace',
  'textAlign',
  'gridTemplateColumns',
  'borderTopStyle',
]

const contador = (usado, teto) => ({ usado, teto, restante: Math.max(0, teto - usado) })
const usoDe = (plano, trechos, aovivo) => ({
  plano,
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado: trechos[0], teto: trechos[1] },
  porNivel: { trechos: contador(...trechos), aovivo: contador(...aovivo) },
  tokensDeLlm: { usado: 0, teto: 0 },
  iaDeNuvem: { disponivel: true, motivo: null, mensagem: null },
  alivio: null,
  hoje: null,
})
/** Os minutos de `MINUTOS` (`planos4.js:134-138`), em segundos. */
const USO = {
  gratis: usoDe('free', [0, 0], [0, 0]),
  essencial: usoDe('essencial', [6000, 18000], [0, 0]),
  'essencial-acabou': usoDe('essencial', [18000, 18000], [0, 0]),
  premium: usoDe('premium', [23400, 72000], [0, 0]),
  'premium-acabou': usoDe('premium', [72000, 72000], [0, 0]),
  aovivo: usoDe('aovivo', [23400, 72000], [8100, 36000]),
}

/** A resposta de `/api/me/uso`, trocada na página antes de a captura abrir. */
const servidor = (uso) =>
  `(() => { const f = window.fetch; window.fetch = (u, o) => { const s = String(u && u.url ? u.url : u); if (s.includes('/api/me/uso')) return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(uso)}), { status: 200, headers: { 'Content-Type': 'application/json' } })); return f(u, o); }; })()`

const CLARO =
  "Promise.all([import('/src/lib/theme.ts').then((m) => m.applyDarkMode(false)), import('/src/lib/i18n.ts').then((m) => m.usarIdioma('pt-BR'))])"
const ABRIR_CAPTURA =
  "[...document.querySelectorAll('.q-trilho .q-item')].find((b) => /Captur/.test(b.textContent)).click()"
/** Os avisos da conta local (consentimento, preparo do modelo) não são do protótipo: saem da medida. */
const SO_A_TELA =
  "document.querySelectorAll('.px-vivo > :not(.px-vivo-topo):not(.pl-linha):not(.cel-conversa):not(.q-faixa):not(dialog)').forEach((e) => e.remove())"
const SEM_REDE =
  "(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); })()"
const FALAS =
  "new Promise((ok) => { const i = setInterval(() => { if (window.__simFalas) { clearInterval(i); ok(window.__simFalas(['So, are we still shipping the roadmap today?', 'We ship it today, but the dashboard needs one more review.'])); } }, 250); })"

const FILEIRA = [
  '.px-vivo-topo',
  '.px-vivo-topo > *',
  '.px-vivo-topo .q-chip.px-so-largo',
  '.pl-linha',
  '.pl-niveis',
  '.pl-niveis .q-aba',
  ".pl-niveis .q-aba[aria-checked='true']",
  '.pl-niveis .q-aba > svg',
  '.pl-niveis .px-pilula',
  '.pl-linha .q-espaco',
  '.pl-vaga',
]
const CADEADO = ['.pl-niveis .q-aba[data-pl-tranca]', '.pl-cad', '.pl-cad svg']
const MARCA = [
  '.pl-onde.pl-so-largo',
  '.pl-so-largo .pl-onde-ic',
  '.pl-so-largo .pl-onde-ic svg',
  '.pl-so-largo .pl-onde-txt',
  '.pl-so-largo .pl-onde-txt b',
  '.pl-so-largo > svg:last-child',
  '.pl-onde.pl-so-estreito',
  '.pl-so-estreito .pl-onde-ic',
  '.pl-so-estreito .pl-onde-txt',
]
const MEDIDOR = ['.pl-medidor', '.pl-medidor > svg', '.pl-medidor-txt', '.pl-mini-barra', '.pl-mini-barra i']
const NOTA = [
  '.px-pronto-miolo',
  '.px-pronto-miolo > .q-ic',
  '.px-pronto-miolo h2',
  '.px-pronto-miolo > p',
  '.pl-nota',
  '.pl-nota > span:first-child',
  '.pl-nota > span:first-child > svg',
  '.pl-nota b',
]
const FOLHA = ['dialog.folha-de-baixo[open]', 'dialog[open] .folha-pega', 'dialog[open] .folha-corpo']
const COMO = [
  ...FOLHA,
  '.pl-como',
  '.pl-como .label-mono',
  '.pl-como h2',
  '.pl-agora',
  '.pl-agora .q-ic',
  '.pl-agora .q-ic svg',
  '.pl-agora b',
  '.pl-agora .ad-sub',
  '.pl-como .folha-rotulo',
  '.pl-nivs',
  '.pl-nivs .pj-niv',
  ".pl-nivs .pj-niv[aria-checked='true']",
  '.pl-nivs .pj-niv b',
  '.pl-nivs .pj-niv b svg',
  '.pl-nivs .pj-niv > span',
  '.pl-selo',
  '.pl-passos',
  '.pl-passos li',
  '.pl-passos li svg',
  '.pl-passos li b',
  '.pl-como ul.ad-lista',
  '.pl-como ul.ad-lista li',
  '.pl-como .ad-confirma-pe',
  '.pl-como .ad-confirma-pe .btn-outline',
  '.pl-como .ad-confirma-pe .btn-solid',
]
const COMO_COM_NUVEM = [
  '.pl-med',
  '.pl-med-linha',
  '.pl-med-topo',
  '.pl-med-topo b',
  '.pl-med .q-barra',
  '.pl-med .q-barra > span',
  '.pl-med .pj-como-ajudas',
]
const TRANCA = [
  ...FOLHA,
  '.pl-tranca',
  '.pl-tranca .label-mono',
  '.pl-tranca h2',
  '.pl-tranca .ad-lista',
  '.pl-tranca .ad-lista li',
  '.pl-tranca .ad-lista li svg',
  '.pl-tranca .ad-lista li b',
  '.pl-tranca .ad-confirma-pe',
  '.pl-tranca .ad-confirma-pe .btn-outline',
  '.pl-tranca .ad-confirma-pe .btn-solid',
  '.pl-tranca .ad-confirma-nota',
  '.pl-tranca .ad-confirma-nota .ad-sem',
]

/** A entrada da tela pronta (`planos4.js:297`): sai da captura e volta, gravando as animações dos dois lados. */
const IR = (nome) =>
  `[...document.querySelectorAll('.q-trilho .q-item')].find((b) => /${nome}/.test(b.textContent)).click()`
const ENTRADA = (lado) => [
  { js: IR(lado === 'app' ? 'Início|Home' : 'Início') },
  { esperar: 1500 },
  { js: 'window.__anim.length = 0' },
  { js: IR(lado === 'app' ? 'Captur' : 'Capturar') },
]

const PLANO_DO_APP = { gratis: 'free', essencial: 'essencial', premium: 'premium', aovivo: 'aovivo' }

/**
 * Um estado: o endereço do protótipo (`ver`), o plano e o aparelho de prova, o uso do mês, e o que se
 * faz no app depois de a captura abrir (`depois`: o toque que abre a folha, a fala simulada).
 */
const ESTADOS = [
  {
    id: 'gratis',
    ver: 'capturar-gratis',
    plano: 'gratis',
    disp: 'pc',
    movimento: true,
    seletores: [...FILEIRA, ...CADEADO, ...MARCA],
  },
  {
    id: 'essencial',
    ver: 'capturar-essencial',
    plano: 'essencial',
    disp: 'pc',
    uso: 'essencial',
    seletores: [...FILEIRA, ...CADEADO, ...MARCA, ...MEDIDOR],
  },
  {
    id: 'premium',
    ver: 'capturar-premium',
    plano: 'premium',
    disp: 'celular',
    uso: 'premium',
    nuvem: true,
    seletores: [...FILEIRA, ...CADEADO, ...MARCA, ...MEDIDOR],
  },
  {
    id: 'aovivo',
    ver: 'capturar-aovivo',
    plano: 'aovivo',
    disp: 'celular',
    uso: 'aovivo',
    nuvem: true,
    seletores: [...FILEIRA, ...MARCA, ...MEDIDOR],
  },
  {
    id: 'acabou',
    ver: 'capturar-acabou',
    plano: 'essencial',
    disp: 'fraco',
    uso: 'essencial-acabou',
    movimento: true,
    seletores: [...FILEIRA, ...MARCA, ...MEDIDOR, ...NOTA, '.pl-nota .q-ctl'],
  },
  {
    id: 'acabou-premium',
    ver: 'capturar-acabou-premium',
    plano: 'premium',
    disp: 'celular',
    uso: 'premium-acabou',
    seletores: [...FILEIRA, ...MARCA, ...MEDIDOR, ...NOTA],
  },
  {
    id: 'offline',
    ver: 'capturar-offline',
    plano: 'premium',
    disp: 'celular',
    uso: 'premium',
    antes: [{ js: SEM_REDE }],
    seletores: [...FILEIRA, ...MARCA, ...MEDIDOR, ...NOTA],
  },
  {
    id: 'gravando',
    ver: 'capturar-gravando',
    plano: 'premium',
    disp: 'fraco',
    uso: 'premium',
    nuvem: true,
    depois: [
      { js: FALAS },
      { esperar: 2500 },
      { js: SO_A_TELA },
      { js: "document.querySelector('.px-vivo').classList.remove('px-parada')" },
      { esperar: 400 },
    ],
    seletores: ['.px-vivo-topo', '.px-vivo-topo > *', '.pl-linha', '.pl-niveis', '.pl-vaga', ...MARCA],
  },
  {
    id: 'tranca',
    ver: 'capturar-tranca',
    plano: 'gratis',
    disp: 'fraco',
    depois: [{ clicar: ".pl-niveis [data-pl-nivel='precisao']" }, { esperar: 1200 }],
    seletores: TRANCA,
  },
  {
    id: 'tranca-aovivo',
    ver: 'capturar-tranca-aovivo',
    plano: 'premium',
    disp: 'celular',
    uso: 'premium',
    nuvem: true,
    depois: [{ clicar: ".pl-niveis [data-pl-nivel='aovivo']" }, { esperar: 1200 }],
    seletores: TRANCA,
  },
  {
    id: 'como',
    ver: 'como',
    plano: 'premium',
    disp: 'fraco',
    uso: 'premium',
    nuvem: true,
    depois: [{ clicar: '.pl-onde.pl-so-largo', estreito: '.pl-onde.pl-so-estreito' }, { esperar: 1200 }],
    seletores: [...COMO, ...COMO_COM_NUVEM],
  },
  {
    id: 'como-gratis',
    ver: 'como-gratis',
    plano: 'gratis',
    disp: 'pc',
    depois: [{ clicar: '.pl-onde.pl-so-largo', estreito: '.pl-onde.pl-so-estreito' }, { esperar: 1200 }],
    seletores: [...COMO, '.pl-selo.off', '.pl-como .ad-confirma-nota', '.pl-como .ad-confirma-nota .ad-sem'],
  },
]

const MEDIDAS = [
  { sufixo: '', largura: 1280, altura: 960 },
  { sufixo: '-celular', largura: 390, altura: 844 },
]

for (const e of ESTADOS)
  for (const m of MEDIDAS) {
    const estreito = m.largura <= 720
    const depois = (e.depois || []).map((p) =>
      p.clicar ? { clicar: estreito && p.estreito ? p.estreito : p.clicar } : p,
    )
    const roteiro = {
      nome: `niveis-${e.id}${m.sufixo}`,
      prototipo: 'anuncios-no-gratis',
      largura: m.largura,
      altura: m.altura,
      app: {
        caminho: '/',
        guardar: {
          'babel.px.planoDeProva': PLANO_DO_APP[e.plano],
          'babel.px.planosAVendaDeProva': 'essencial,premium,aovivo',
          'babel.px.aparelhoDeProva': e.disp,
          ...(e.nuvem ? { 'babel.px.seloDeProva': 'nuvem' } : {}),
        },
        passos: [
          { js: servidor(USO[e.uso || 'gratis']) },
          ...(e.antes || []),
          { js: CLARO },
          { esperar: 800 },
          { tecla: 'Escape' },
          { esperar: 500 },
          { js: ABRIR_CAPTURA },
          { esperar: 6000 },
          { js: SO_A_TELA },
          { js: CLARO },
          { esperar: 600 },
          ...depois,
        ],
      },
      proto: { busca: `?ver=${e.ver}&quieto`, assentar: 4000, passos: [] },
      seletores: e.seletores,
      props: PROPS,
      ...(e.movimento ? { gravar: { app: ENTRADA('app'), proto: ENTRADA('proto'), espera: 3500 } } : {}),
    }
    writeFileSync(join(AQUI, `${roteiro.nome}.json`), JSON.stringify(roteiro, null, 2) + '\n')
    console.log(roteiro.nome)
  }
