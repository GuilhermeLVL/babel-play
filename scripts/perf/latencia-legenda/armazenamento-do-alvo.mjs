/**
 * CHAVES DE LABORATÓRIO POR ALVO (A/B de `parciais-incrementais`, variante V1b): cada braço do `--alvos` grava as SUAS chaves no
 * localStorage do navegador da rodada (ex.: `babel.lab.parciaisModo`), além das flags de `--flag-do-alvo`.
 *
 *   --armazenamento-do-alvo "v1b-sem-cauda=babel.lab.parciaisModo:sem-cauda;v1b-cauda-decode=babel.lab.parciaisModo:cauda-decode"
 *
 * Pares `alvo=chave:valor` separados por `;`; várias chaves de um alvo por `,` (ou repetindo o alvo). Funções puras: o teste não abre
 * navegador. Só aceita [A-Za-z0-9._-] em chave e valor (nada de `;`, `,`, `:` ou aspas escapando para o argumento do `medir.mjs`).
 */

const SEGURO = /^[A-Za-z0-9._-]+$/

/** `"a=k:v,k2:v2;b=k:w"` → `{ a: { k: 'v', k2: 'v2' }, b: { k: 'w' } }`. */
export function lerArmazenamentoDoAlvo(texto) {
  const mapa = {}
  for (const par of String(texto ?? '').split(';')) {
    if (!par.trim()) continue
    const i = par.indexOf('=')
    if (i < 1) throw new Error(`--armazenamento-do-alvo: par "${par}" sem "alvo=chave:valor"`)
    const nome = par.slice(0, i).trim()
    for (const kv of par.slice(i + 1).split(',')) {
      if (!kv.trim()) continue
      const j = kv.indexOf(':')
      if (j < 1) throw new Error(`--armazenamento-do-alvo: "${kv}" sem "chave:valor"`)
      const chave = kv.slice(0, j).trim()
      const valor = kv.slice(j + 1).trim()
      if (!SEGURO.test(chave)) throw new Error(`--armazenamento-do-alvo: chave inválida "${chave}"`)
      if (!SEGURO.test(valor)) throw new Error(`--armazenamento-do-alvo: valor inválido "${valor}" (chave ${chave})`)
      mapa[nome] = { ...mapa[nome], [chave]: valor }
    }
  }
  return mapa
}

/** As chaves do alvo (`{}` se não há par). */
export const armazenamentoDoAlvo = (nome, porAlvo) =>
  Object.prototype.hasOwnProperty.call(porAlvo, nome) ? porAlvo[nome] : {}

/** O valor que a bancada repassa ao `medir.mjs --armazenamento` (`chave:valor,chave:valor`). */
export const armazenamentoComoArgumento = (chaves) =>
  Object.entries(chaves)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')

/** O inverso, no `medir.mjs`: `"k:v,k2:v2"` → `[['k','v'],['k2','v2']]` (já validado pela bancada; ignora o que não tem `:`). */
export function paresDoArgumento(texto) {
  return String(texto ?? '')
    .split(',')
    .map((kv) => kv.trim())
    .filter((kv) => kv.indexOf(':') > 0)
    .map((kv) => [kv.slice(0, kv.indexOf(':')), kv.slice(kv.indexOf(':') + 1)])
}
