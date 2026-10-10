/**
 * TRAZ O CSS DO PROTÓTIPO DE POLIMENTO PARA O APP, SEM REESCREVER.
 *
 *     node scripts/polimento/trazer-css.mjs "<pasta polimento-movimento-src do protótipo>" ["<pasta anuncios-no-gratis-src>" ["<pasta telas-enxutas-src>" ["<pasta cartoes-src>"]]]
 *
 * A SEGUNDA PASTA (opcional) é a do protótipo dos QUATRO PLANOS (`anuncios-no-gratis-src`): dela vêm
 * só os arquivos da tabela `DA_SEGUNDA_PASTA`. Sem ela, esses arquivos ficam como
 * estão (os outros são iguais nas duas pastas, conferido em 09/10/2026).
 *
 * A TERCEIRA PASTA (opcional) é a do protótipo das TELAS ENXUTAS (`telas-enxutas-src`): dela vem só
 * `enxuto.css` (tabela `DA_TERCEIRA_PASTA`). Os outros arquivos dela são iguais aos das duas primeiras
 * (conferido em 10/10/2026).
 *
 * A QUARTA PASTA (opcional) é a do protótipo dos CARTÕES (`cartoes-src`): dela vem só `cartoes.css`
 * (tabela `DA_QUARTA_PASTA`).
 *
 * Por que copiar e não reescrever: o protótipo é um clone do DOM do desenho novo (`.q-*`, `.hud`,
 * `.cab`…) e a camada dele é ADITIVA, toda sob `html[data-px='on']`. O app passa a pôr a mesma marca
 * no `<html>` (`src/lib/polimento/base.ts`), então as regras valem como foram desenhadas, com os
 * mesmos valores. Reescrever foi como a primeira tentativa virou "aproximada".
 *
 * O que NÃO vem: a barra do protótipo, o painel de auditoria e as molduras de aparelho (não são app).
 * O que vem DEPOIS: trechos cujo comportamento em JS ainda não foi portado ficam de fora até lá
 * (senão a peça ficaria pela metade: por exemplo, o véu do painel nasce transparente e é o JS que o
 * acende). Cada trecho adiado está na tabela abaixo, com o item da lista `fidelidade/` que o destrava.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const origem = process.argv[2]
if (!origem) {
  console.error('Diga a pasta do protótipo (polimento-movimento-src).')
  process.exit(1)
}
const origemDosPlanos = process.argv[3]
const origemDasEnxutas = process.argv[4]
const origemDosCartoes = process.argv[5]
const destino = join(dirname(fileURLToPath(import.meta.url)), '../../src/styles/polimento')

/** Linhas a tirar de cada arquivo (1 = primeira, inclusivas). `adiado`: entra quando o item for portado. */
const ARQUIVOS = {
  'polimento.css': [
    { de: 7, ate: 24, motivo: 'estrutura da página do protótipo; a do app está em polimento-app.css' },
    { de: 26, ate: 33, motivo: 'tokens de movimento e câmera lenta: estão em polimento-app.css, com --px-k fixo em 1' },
    { de: 354, ate: Infinity, motivo: 'barra do protótipo e painel da auditoria' },
  ],
  'efeitos.css': [
    { de: 215, ate: 245, motivo: 'barra do protótipo: demonstração e legenda' },
    { de: 252, ate: 314, motivo: 'molduras de aparelho do protótipo' },
  ],
  /* Tudo o que é de tela, de celular e do tema Água vem inteiro desde o plano de 08/10/2026 (todas as
     telas idênticas ao protótipo): a marcação e o comportamento de cada tela são portados em seguida. */
  'celular.css': [],
  'telas.css': [],
  'telas2.css': [],
  'telas3.css': [],
  'paineis.css': [],
  /* Os jogos e as miniaturas vêm inteiros: as classes são só deles (`pj-`, `rl-`, `ml-`, `mm-`, `px-mini`). */
  'minis.css': [],
  'jogos.css': [],
  'jogos3.css': [],
  'jogos4.css': [],
  'agua.css': [],
}

/** Os arquivos que só existem no protótipo dos quatro planos (a segunda pasta). */
const DA_SEGUNDA_PASTA = {
  /* A TELA PLANOS (cartão do aparelho, ciclo, quatro cartões, comparação, consumo) e, desde 10/10/2026,
     a CAPTURA (seletor de nível, marca de onde a fala é processada, medidor, notas e as folhas "Como isto
     funciona" e do cadeado: `views/captura/niveis/`). O resto mexe em telas que ainda não foram portadas
     (`.px-int .int-centro`, Ajustes › Processamento) e mudaria o app. */
  'planos4.css': [
    { de: 81, ate: 90, adiado: 'a marca na faixa do meio do Intérprete' },
    { de: 189, ate: 196, adiado: 'Ajustes › Processamento com os três níveis' },
    { de: 266, ate: 267, adiado: 'Ajustes › Processamento com os três níveis (celular)' },
    { de: 270, ate: 292, motivo: 'barra do protótipo e Mapa dos planos' },
  ],
  /* Da camada de anúncios a tela Planos só usa a etiqueta pequena do seletor de ciclo e o pulso que
     aponta o cartão pedido; as folhas do nível (captura) usam o link discreto (`.ad-sem`), a segunda
     linha (`.ad-sub`) e a folha de confirmação (`.ad-confirma`, `.ad-lista`). O resto entra com os
     anúncios (flag `anuncios`). */
  'anuncios.css': [
    { de: 1, ate: 17, adiado: 'anúncios no Grátis (flag anuncios)' },
    { de: 32, ate: 50, adiado: 'anúncios no Grátis (flag anuncios)' },
    { de: 64, ate: 158, adiado: 'anúncios no Grátis (flag anuncios)' },
    { de: 160, ate: 248, adiado: 'anúncios no Grátis (flag anuncios)' },
    { de: 266, ate: 443, adiado: 'anúncios no Grátis (flag anuncios)' },
    { de: 446, ate: Infinity, adiado: 'anúncios no Grátis (flag anuncios)' },
  ],
}

/** O arquivo que só existe no protótipo das telas enxutas (a terceira pasta). */
const DA_TERCEIRA_PASTA = {
  /* CAPTURAR E JOGAR COM MENOS COISAS À VISTA (`enxuto.js`): o chip de estado, a folha com o modelo e a
     ajuda, o link discreto (`.ex-lig`), "Buscar e organizar" e a arrumação do celular. Vale sob
     `html[data-px='on'][data-telas='enxuta']`, a marca que `src/lib/polimento/base.ts` põe fora do headset. */
  'enxuto.css': [{ de: 128, ate: 154, motivo: 'barra do protótipo e painel "O que mudou"' }],
}

/** O arquivo que só existe no protótipo dos cartões (a quarta pasta). */
const DA_QUARTA_PASTA = {
  /* A TELA CARTÕES (`cartoes.js`: Hoje, Baralhos, Palavras, Trazer e levar, Memória) e a navegação
     (`cartoes3.js`: Biblioteca e Cartões no trilho, "Praticar" na barra de cinco do celular). A revisão
     melhorada (`cartoes2.js`) é fatia seguinte: as regras dela ficam de fora até a marcação existir. */
  'cartoes.css': [
    { de: 245, ate: 299, adiado: 'a revisão melhorada (openspec/changes/cartoes, fatia 3)' },
    { de: 381, ate: 404, adiado: 'a revisão melhorada no celular (openspec/changes/cartoes, fatia 3)' },
    { de: 413, ate: 416, adiado: 'a revisão melhorada no tablet (openspec/changes/cartoes, fatia 3)' },
    { de: 431, ate: Infinity, motivo: 'barra do protótipo e Mapa das portas' },
  ],
}

const NOME_DO_PROTOTIPO = new Map([
  [origem, 'de polimento'],
  [origemDosPlanos, 'dos quatro planos'],
  [origemDasEnxutas, 'das telas enxutas'],
  [origemDosCartoes, 'dos cartões'],
])

mkdirSync(destino, { recursive: true })
const TODOS = [
  ...Object.entries(ARQUIVOS).map(([nome, cortes]) => [nome, cortes, origem]),
  ...(origemDosPlanos ? Object.entries(DA_SEGUNDA_PASTA).map(([nome, cortes]) => [nome, cortes, origemDosPlanos]) : []),
  ...(origemDasEnxutas ? Object.entries(DA_TERCEIRA_PASTA).map(([nome, cortes]) => [nome, cortes, origemDasEnxutas]) : []),
  ...(origemDosCartoes ? Object.entries(DA_QUARTA_PASTA).map(([nome, cortes]) => [nome, cortes, origemDosCartoes]) : []),
]
for (const [nome, cortes, pasta] of TODOS) {
  const linhas = readFileSync(join(pasta, nome), 'utf8').replace(/\r\n/g, '\n').split('\n')
  const fora = (n) => cortes.find((c) => n >= c.de && n <= c.ate)
  const corpo = []
  let ultimo = null
  linhas.forEach((linha, i) => {
    const corte = fora(i + 1)
    if (!corte) {
      corpo.push(linha)
      ultimo = null
    } else if (corte !== ultimo) {
      const ate = corte.ate === Infinity ? linhas.length : corte.ate
      corpo.push(
        `/* [${nome}:${corte.de}-${ate}] ${corte.adiado ? 'ADIADO até portar: ' + corte.adiado : 'não vem: ' + corte.motivo} */`,
      )
      ultimo = corte
    }
  })
  const cabecalho =
    `/* GERADO por scripts/polimento/trazer-css.mjs a partir de ${nome} do protótipo ${NOME_DO_PROTOTIPO.get(pasta)}.\n` +
    `   NÃO EDITAR À MÃO: mude a tabela do script e gere de novo. As regras são as do protótipo, sem\n` +
    `   reescrita; valem sob html[data-px='on'], a marca que src/lib/polimento/base.ts põe. */\n`
  writeFileSync(join(destino, nome), cabecalho + corpo.join('\n').trimEnd() + '\n')
  console.log(nome, linhas.length, '→', corpo.length, 'linhas')
}
