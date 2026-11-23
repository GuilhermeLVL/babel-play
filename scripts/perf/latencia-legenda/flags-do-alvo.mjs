/**
 * FLAGS POR ALVO (A/B de `parciais-incrementais`): cada braço do `--alvos` liga as SUAS flags no navegador da rodada.
 *
 *   --flag-do-alvo "depois=parciais_vivos,parciais_parakeet;antes="
 *
 * Pares `alvo=flags` separados por `;`; as flags de um alvo, por `,` ou `+` (várias por alvo). Alvo sem par (ou com a
 * lista vazia) cai no `--flag` global, que também aceita várias (`a,b`). Funções puras: o teste não abre navegador.
 */

const separar = (texto) =>
  String(texto ?? '')
    .split(/[,+]/)
    .map((f) => f.trim())
    .filter(Boolean)

/** `"depois=a,b;antes="` → `{ depois: ['a','b'], antes: [] }`. Recusa par sem `=` e flag com caractere estranho. */
export function lerFlagsDoAlvo(texto) {
  const mapa = {}
  for (const par of String(texto ?? '').split(';')) {
    if (!par.trim()) continue
    const i = par.indexOf('=')
    if (i < 1) throw new Error(`--flag-do-alvo: par "${par}" sem "nome=flags"`)
    const nome = par.slice(0, i).trim()
    const flags = separar(par.slice(i + 1))
    for (const f of flags) if (!/^[a-z0-9_]+$/.test(f)) throw new Error(`--flag-do-alvo: flag inválida "${f}"`)
    mapa[nome] = flags
  }
  return mapa
}

/** As flags do alvo: as dele, se o par existe (mesmo vazio = nenhuma); senão as do `--flag` global. */
export function flagsDoAlvo(nome, porAlvo, global = '') {
  if (Object.prototype.hasOwnProperty.call(porAlvo, nome)) return porAlvo[nome]
  return separar(global)
}

/** O valor que a bancada repassa ao `medir.mjs --flag` (lista separada por vírgula). */
export const flagsComoArgumento = (flags) => flags.join(',')

/** O objeto de `babel.flags` do navegador: todas ligadas. */
export function flagsDoNavegador(flags) {
  return Object.fromEntries(separar(Array.isArray(flags) ? flags.join(',') : flags).map((f) => [f, { ligada: true }]))
}
