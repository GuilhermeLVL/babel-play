/**
 * TRAZ O CSS DO PROTÓTIPO DE POLIMENTO PARA O APP, SEM REESCREVER.
 *
 *     node scripts/polimento/trazer-css.mjs "<pasta polimento-movimento-src do protótipo>"
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

mkdirSync(destino, { recursive: true })
for (const [nome, cortes] of Object.entries(ARQUIVOS)) {
  const linhas = readFileSync(join(origem, nome), 'utf8').replace(/\r\n/g, '\n').split('\n')
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
    `/* GERADO por scripts/polimento/trazer-css.mjs a partir de ${nome} do protótipo de polimento.\n` +
    `   NÃO EDITAR À MÃO: mude a tabela do script e gere de novo. As regras são as do protótipo, sem\n` +
    `   reescrita; valem sob html[data-px='on'], a marca que src/lib/polimento/base.ts põe. */\n`
  writeFileSync(join(destino, nome), cabecalho + corpo.join('\n').trimEnd() + '\n')
  console.log(nome, linhas.length, '→', corpo.length, 'linhas')
}
