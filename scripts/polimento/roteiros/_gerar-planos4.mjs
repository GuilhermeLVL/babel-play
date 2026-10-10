/**
 * GERA OS ROTEIROS DA TELA PLANOS DOS QUATRO PLANOS (`planos4-*.json`), para o comparador.
 *
 *     node scripts/polimento/roteiros/_gerar-planos4.mjs
 *     PROTOTIPOS_DIR="<pasta com anuncios-no-gratis.html>" APP_URL=http://localhost:3193 \
 *       node scripts/polimento/comparar.mjs scripts/polimento/roteiros/planos4.json
 *
 * O protótipo é o `anuncios-no-gratis.html` (campo `prototipo` do roteiro), aberto no endereço pronto
 * de cada estado (`?ver=…&quieto`, `planos4.js:917-927`). O app é levado ao MESMO estado pelo modo de
 * prova (`src/lib/polimento/planos.ts`): plano, planos à venda, aparelho e as linhas de anúncio. As
 * respostas do servidor (teste disponível, consumo do mês) são trocadas na página, como nos roteiros
 * `planos*.json` da tela anterior.
 *
 * O arquivo começa com `_` e não é um roteiro: gera os que são.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))

const PROPS = [
  'borderTopStyle',
  'alignItems',
  'gridTemplateColumns',
  'maxWidth',
  'marginTop',
  'marginBottom',
  'order',
  'textAlign',
  'justifyContent',
  'flexDirection',
  'overflowX',
  'whiteSpace',
  'flexWrap',
  'verticalAlign',
  'textTransform',
  'minHeight',
  'scrollSnapType',
]

/** As respostas do servidor que a tela lê, trocadas na página (o servidor local é self-host). */
const servidor = (uso, assinatura = null) =>
  `(() => { const f = window.fetch; window.fetch = (u, o) => { const s = String(u && u.url ? u.url : u); const j = (c) => Promise.resolve(new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } })); if (s.includes('/api/abertura')) return j({ cadastro: true, checkout: true, anual: true }); if (s.includes('/api/billing/status')) return j(${JSON.stringify(assinatura ? { configurado: true, assinatura, proximaCobranca: '2026-11-09', teste: { estado: 'indisponivel', dias: 14, motivo: 'ja_assinante' } } : { configurado: true, assinatura: null, teste: { estado: 'disponivel', dias: 14 } })}); if (s.includes('/api/billing/faturas')) return j({ faturas: [] }); if (s.includes('/api/me/uso')) return j(${JSON.stringify(uso)}); return f(u, o); }; })()`

const contador = (usado, teto) => ({ usado, teto, restante: teto === null ? null : Math.max(0, teto - usado) })
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
const USO_DO_GRATIS = usoDe('free', [0, 0], [0, 0])

const PLANO_DO_APP = { gratis: 'free', essencial: 'essencial', premium: 'premium', aovivo: 'aovivo' }

/** Os quatro planos à venda e as linhas de anúncio ligadas: o estado em que o protótipo foi desenhado. */
const guardar = (plano, aparelho) => ({
  'babel.px.planoDeProva': PLANO_DO_APP[plano],
  'babel.px.planosAVendaDeProva': 'essencial,premium,aovivo',
  'babel.px.aparelhoDeProva': aparelho,
  'babel.px.anunciosDeProva': '1',
})

const CARTAO = (id) => {
  const c = `.pl-plano[data-pl-plano='${id}']`
  return [
    c,
    `${c} .q-rotulo`,
    `${c} h3`,
    `${c} .px-preco`,
    `${c} .px-preco b`,
    `${c} .px-preco span`,
    `${c} .pl-preco-nota`,
    `${c} .pl-quem`,
    ...(id === 'gratis' ? [] : [`${c} .px-tudo`]),
    `${c} ul`,
    `${c} li`,
    `${c} li svg`,
    `${c} .pl-plano-pe`,
    `${c} .pl-plano-pe .q-ctl`,
  ]
}

const CABECALHO = [
  '.pl-planos-tela',
  '.pl-planos-tela .q-cab',
  '.pl-planos-tela .q-cab h1',
  '.pl-planos-tela .q-cab .q-sobre',
  '.px-meu-plano',
  '.px-meu-plano svg',
  '.px-abas-planos',
  '.px-abas-planos .q-aba',
  '.px-abas-planos .px-pilula',
]
const APARELHO = [
  '.pl-aparelho',
  '.pl-aparelho-topo',
  '.pl-aparelho-topo .q-ic',
  '.pl-aparelho-topo .q-ic svg',
  '.pl-aparelho .q-rotulo',
  '.pl-aparelho-frase',
  '.pl-aparelho-det',
  '.pl-aparelho-det summary',
  '.pl-aparelho-det summary svg',
]
const DETALHE_DO_APARELHO = [
  '.pl-aparelho-det ul',
  '.pl-aparelho-det li',
  '.pl-aparelho-det li b',
  '.pl-sinal',
  '.pl-sinal svg',
  '.pl-sinal.ok',
  '.pl-sinal.meio',
]
const CICLO = [
  '.pl-ciclo-linha',
  '.pl-ciclo',
  '.pl-ciclo .q-aba',
  ".pl-ciclo .q-aba[aria-checked='true']",
  '.pl-ciclo .px-pilula',
  '.pl-ciclo .ad-mini-tag',
  '.pl-dica-arraste',
]
const GRADE = [
  '.pl-planos-grade',
  '.pl-plano',
  '.pl-plano.px-premium',
  '.pl-plano.pl-meu',
  '.px-garantia',
  '.px-garantia svg',
]
const COMPARAR = [
  '.pl-comparar',
  '.pl-comparar > header',
  '.pl-comparar > header h2',
  '.pl-compara-escolha',
  '.pl-compara-escolha .q-aba',
  '.q-tabela-caixa',
  '.pl-compara',
  '.pl-compara thead th',
  ".pl-compara th[scope='col'][data-c='gratis']",
  ".pl-compara th[scope='col'][data-c='essencial']",
  ".pl-compara th[scope='col'] small",
  '.pl-compara tbody tr',
  ".pl-compara th[scope='row']",
  ".pl-compara td[data-c='gratis']",
  ".pl-compara td[data-c='essencial']",
  ".pl-compara td[data-c='premium']",
  ".pl-compara td[data-c='aovivo']",
  '.pl-compara .px-sim',
  '.pl-compara .px-sim svg',
  '.pl-compara .px-nao',
  '.pl-compara-preco',
  '.pl-compara-preco td b',
  '.pl-comparar > .px-nota',
]
const PERGUNTAS = [
  '.pl-faq',
  '.pl-faq > header h2',
  '.px-faq',
  '.px-faq details',
  '.px-faq summary',
  '.px-faq summary svg',
]
const ASSINATURA = [
  '.px-assinatura',
  '.px-assinatura > .q-ic',
  '.px-assinatura > .q-ic svg',
  '.px-assinatura .q-rotulo',
  '.px-assinatura h2',
  '.px-assinatura .q-d',
  '.px-assinatura .q-acoes',
  '.px-assinatura .q-acoes .q-ctl',
  '.px-assinatura .q-acoes .q-ctl.pri',
]
const CONSUMO = [
  '.pl-consumo',
  '.px-consumo',
  '.px-consumo .q-rotulo',
  '.px-consumo > b',
  '.px-consumo .q-barra',
  '.px-consumo .q-barra > span',
  ".px-consumo[data-tom='pouco'] .q-barra > span",
  '.px-consumo > span:last-child',
  '.pl-renova',
  '.pl-renova svg',
]

const ABRIR = [{ clicar: "[data-testid='plano-no-inicio']" }, { esperar: 2500 }]

/**
 * Um roteiro em duas larguras. `ver` é o endereço do protótipo; `plano` e `aparelho` os dele (`est` de
 * `planos4.js:917-927`) e os do modo de prova do app.
 */
function roteiro(
  nome,
  { ver, plano = 'gratis', aparelho = 'pc', extra = '', uso = USO_DO_GRATIS, assinatura = null },
  passos,
  seletores,
  gravar,
) {
  for (const [sufixo, largura, altura] of [
    ['', 1280, 960],
    ['-celular', 390, 844],
  ]) {
    const corpo = {
      nome: `${nome}${sufixo}`,
      prototipo: 'anuncios-no-gratis',
      largura,
      altura,
      app: {
        caminho: '/',
        guardar: guardar(plano, aparelho),
        passos: [{ js: servidor(uso, assinatura) }, ...ABRIR, ...(passos.app || [])],
      },
      proto: {
        busca: `?ver=${ver}&quieto&plano=${plano}&aparelho=${aparelho}${extra}`,
        assentar: 4000,
        passos: passos.proto || [],
      },
      seletores,
      props: PROPS,
      ...(gravar && (!gravar.soNoCelular || sufixo)
        ? { gravar: { app: gravar.app, proto: gravar.proto, espera: gravar.espera } }
        : {}),
    }
    writeFileSync(join(AQUI, `${corpo.nome}.json`), JSON.stringify(corpo, null, 2) + '\n')
    console.log(corpo.nome)
  }
}

/* A espera depois de rolar deixa passar a entrada do que acabou de aparecer (`entrar`, `telas.ts`). */
const rolar = (sel) => ({ app: [{ rolar: sel }, { esperar: 1800 }], proto: [{ rolar: sel }, { esperar: 1800 }] })
const clicar = (sel) => [{ clicar: sel }]

/* O alto da tela e os quatro cartões, para quem está no Grátis num computador com placa de vídeo. */
roteiro('planos4', { ver: 'planos-pc' }, {}, [
  ...CABECALHO,
  ...APARELHO,
  ...CICLO,
  ...GRADE,
  ...['gratis', 'essencial', 'premium', 'aovivo'].flatMap(CARTAO),
  "[data-pl-plano='gratis'] li small",
  "[data-pl-plano='premium'] .pl-plano-pe .px-nota",
])
/* O cartão "Você está num…" em cada aparelho, com o que o Grátis consegue aberto. */
for (const aparelho of ['fraco', 'celular', 'quest']) {
  const abrir = [{ clicar: '.pl-aparelho-det summary' }, { esperar: 500 }]
  roteiro(`planos4-aparelho-${aparelho}`, { ver: `planos-${aparelho}`, aparelho }, { app: abrir, proto: abrir }, [
    ...APARELHO,
    ...DETALHE_DO_APARELHO,
    '.pl-plano.px-premium',
    '.pl-plano.px-premium h3',
  ])
}
/* O ciclo anual: os preços do ano e a troca pelo seletor. */
roteiro(
  'planos4-anual',
  { ver: 'planos-anual' },
  /* O clique deixa o ponteiro em cima do botão (ele cresce no `:hover`): o segundo clique o tira dali. */
  { app: [...clicar('.pl-ciclo .q-aba >> nth=1'), ...clicar('.pl-planos-tela .q-cab .q-sobre')], proto: [] },
  [...CICLO, ...['essencial', 'premium', 'aovivo'].flatMap(CARTAO)],
  {
    app: clicar('.pl-ciclo .q-aba >> nth=0'),
    proto: clicar('.pl-ciclo .q-aba >> nth=0'),
    espera: 1200,
  },
)
/* A comparação linha a linha, com a coluna do plano da pessoa (Essencial) em destaque. */
roteiro('planos4-comparar', { ver: 'planos-comparar', plano: 'essencial' }, rolar('.pl-compara'), COMPARAR, {
  app: clicar(".pl-compara-escolha .q-aba >> text='Ao Vivo'"),
  proto: clicar(".pl-compara-escolha .q-aba >> text='Ao Vivo'"),
  espera: 900,
  soNoCelular: true /* o seletor "um contra um" só existe no tamanho de celular */,
})
/* As perguntas, com uma aberta. */
/* O endereço do protótipo abre as duas primeiras (`planos4.js:925`); o app as abre do mesmo jeito, sem
   animação, e a prova é abrir a terceira nos dois. */
const ABRIR_DUAS = { js: "document.querySelectorAll('.pl-faq details').forEach((x, i) => (x.open = i < 2))" }
roteiro(
  'planos4-perguntas',
  { ver: 'planos-faq' },
  {
    app: [...rolar('.pl-faq').app, ABRIR_DUAS, { esperar: 400 }],
    proto: [...rolar('.pl-faq').proto, ABRIR_DUAS, { esperar: 400 }],
  },
  [...PERGUNTAS, '.px-faq details[open]', '.px-faq details[open] p'],
  {
    app: clicar('.px-faq details:nth-child(3) summary'),
    proto: clicar('.px-faq details:nth-child(3) summary'),
    espera: 900,
  },
)
/* Sua assinatura, num plano pago. */
roteiro(
  'planos4-assinatura',
  {
    ver: 'assinatura',
    plano: 'premium',
    aparelho: 'celular',
    uso: usoDe('premium', [23400, 72000], [0, 0]),
    /* Uma assinatura mensal ativa, cobrada no dia 9 (o dia que o protótipo escreve). */
    assinatura: {
      plano: 'premium',
      status: 'active',
      valeAte: 1794300000000,
      ciclo: 'mensal',
      meio: 'assinatura',
      renovacaoAutomatica: true,
    },
  },
  {
    app: clicar(".px-abas-planos .q-aba >> text='Sua assinatura'").concat(
      { clicar: '.pl-planos-tela .q-cab .q-sobre' },
      { esperar: 1500 },
    ),
    proto: [],
  },
  [...CABECALHO, ...ASSINATURA],
  {
    app: clicar(".px-abas-planos .q-aba >> text='Consumo do mês'"),
    proto: clicar(".px-abas-planos .q-aba >> text='Consumo do mês'"),
    espera: 1200,
  },
)
/* Consumo do mês, com os dois medidores (o Ao vivo no fim das horas). */
roteiro(
  'planos4-consumo',
  {
    ver: 'consumo',
    plano: 'aovivo',
    aparelho: 'celular',
    extra: '&nuvem=pouco',
    uso: usoDe('aovivo', [49200, 72000], [33600, 36000]),
  },
  {
    app: clicar(".px-abas-planos .q-aba >> text='Consumo do mês'").concat(
      { clicar: '.pl-planos-tela .q-cab .q-sobre' },
      { esperar: 1500 },
    ),
    proto: [],
  },
  [...CABECALHO, ...CONSUMO],
)
