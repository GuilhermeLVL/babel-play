/**
 * Recomendação NUMÉRICA do motor de voz (spec §6.4): portões eliminatórios, depois a maior nota humana.
 *
 * Uso (precisa de `tsx`, porque `metricas.mjs` importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/recomendar.mjs --candidatos <arquivo.json> --idioma pt|en|es [--t3]
 *
 * `--candidatos` é um JSON com uma lista de `Candidato`. Saída de processo: 0 = há motor escolhido;
 * 2 = nenhum passou ("opção 0 + T2"); 1 = erro de uso. Os números vêm de `limiares.json`
 * (via `LIMIARES` em `comum.mjs`); este arquivo não tem nenhum.
 *
 * O número só ELIMINA e ordena: a spec §7.3 manda o dono ouvir e aprovar o escolhido. Os limiares estão
 * `provisorio` até a F0 calibrar.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { IDIOMAS, LIMIARES, pegarOpcao } from './comum.mjs'
import { avaliarContraLimiares } from './metricas.mjs'

/** Folga de ponto flutuante nas comparações com o limite (0,1 + 0,4 não pode reprovar 0,5). */
const EPSILON = 1e-9

/** Chave reservada de `motivos` para o veredito geral ("opção 0 + T2"). Nenhum candidato pode ter este id. */
const CHAVE_GERAL = '__geral__'
const MOTIVO_SEM_ESCOLHA = 'opção 0 + T2: nenhum candidato passou em todos os portões'

/**
 * @typedef {object} Candidato
 * @property {string} id  único na lista; `<motor>/<voz>` quando vem do relatório
 * @property {boolean} licencaLimpa  LICENSE e model card lidos, nada NC (portão 1; informado pelo operador)
 * @property {boolean} temComponenteGpl  GPL/NC embutido no caminho distribuído (portão 1; informado pelo operador)
 * @property {import('./comum.mjs').Medidas} medidas  medidas automáticas por idioma (portão 2)
 * @property {number} rtf  RTF no hardware do lote (portão 3)
 * @property {number} [ttfaP95S]  1º áudio p95 em segundos; só se o motor for usado online (portão 3)
 * @property {number} [timbresDistinguiveis]  vozes distinguíveis no teste cego (portão 4, só com T3)
 * @property {number} [acertoTimbres]  fração de acerto no teste cego de timbres (portão 4, só com T3)
 * @property {number|null} naturalidade  média da escuta, 1 a 5; `null` = sem escuta (nunca vira 0)
 * @property {number|null} aguenta30  fração de "aguentaria 30 min"; `null` = sem escuta
 * @property {number} errosGravesRepetidos  erros graves apontados por >= 2 ouvintes
 * @property {number} melhorQueAparelho  pontos de naturalidade acima da voz do aparelho
 */

/**
 * @typedef {object} Recomendacao
 * @property {string|null} escolhido  id do vencedor, ou `null` ("opção 0 + T2")
 * @property {Record<string, string[]>} motivos  uma entrada por id de candidato (lista vazia = passou; senão
 *   os motivos, na ordem dos portões da spec §6.4). Sem vencedor, `"__geral__"` traz "opção 0 + T2: ...".
 */

const num = (x) => String(x).replace('.', ',')
const eNumero = (x) => typeof x === 'number' && Number.isFinite(x)

/**
 * Motivos de reprovação de UM candidato, na ordem dos portões da spec §6.4 (todos, não só o primeiro).
 * @param {Candidato} c
 * @param {import('./comum.mjs').LimiaresDaBancada} lim
 * @param {'pt'|'en'|'es'} idioma
 * @param {boolean} t3Mantido
 * @returns {string[]}
 */
function motivosDe(c, lim, idioma, t3Mantido) {
  const m = []

  // Portão 1: licença e GPL
  if (c.licencaLimpa !== true) m.push('licença não limpa')
  if (c.temComponenteGpl === true) m.push('GPL no caminho distribuído')
  else if (c.temComponenteGpl !== false) m.push('GPL não informado (informe temComponenteGpl)')

  // Portão 2: limiares automáticos do idioma (idioma sem medidas => "não medida", nunca passa)
  const doIdioma = c.medidas?.porIdioma?.[idioma]
  if (!doIdioma) m.push(`${idioma}: não medida (sem medidas automáticas neste idioma)`)
  else m.push(...avaliarContraLimiares({ porIdioma: { [idioma]: doIdioma } }, lim.porIdioma).falhas)

  // Portão 3: RTF e 1º áudio
  if (!eNumero(c.rtf)) m.push(`RTF não medido (máximo ${num(lim.rtfMax)})`)
  else if (c.rtf > lim.rtfMax + EPSILON) m.push(`RTF ${num(c.rtf)} acima do máximo de ${num(lim.rtfMax)}`)
  if (c.ttfaP95S !== undefined && c.ttfaP95S !== null) {
    if (!eNumero(c.ttfaP95S)) m.push('1º áudio p95 inválido')
    else if (c.ttfaP95S > lim.ttfaP95MaxS + EPSILON)
      m.push(`1º áudio p95 ${num(c.ttfaP95S)} s acima do máximo de ${num(lim.ttfaP95MaxS)} s`)
  }

  // Portão 4: timbres, só se o T3 for mantido
  if (t3Mantido) {
    if (!eNumero(c.timbresDistinguiveis) || !eNumero(c.acertoTimbres)) m.push('timbres não medidos (T3 mantido)')
    else {
      if (c.timbresDistinguiveis < lim.t3.timbresDistinguiveisMin - EPSILON)
        m.push(`timbres distinguíveis ${c.timbresDistinguiveis} abaixo do mínimo de ${lim.t3.timbresDistinguiveisMin}`)
      if (c.acertoTimbres < lim.t3.acertoTimbresMin - EPSILON)
        m.push(`acerto de timbres ${num(c.acertoTimbres)} abaixo do mínimo de ${num(lim.t3.acertoTimbresMin)}`)
    }
  }

  // Escuta (spec §7.3): o dado ausente é "sem escuta", nunca zero e nunca aprovação
  const e = lim.escuta
  if (!eNumero(c.naturalidade)) m.push('sem escuta (naturalidade)')
  else if (c.naturalidade < e.naturalidadeMin - EPSILON)
    m.push(`naturalidade ${num(c.naturalidade)} abaixo do mínimo de ${num(e.naturalidadeMin)}`)
  if (!eNumero(c.aguenta30)) m.push('sem escuta (aguentaria 30 min)')
  else if (c.aguenta30 < e.aguenta30Min - EPSILON)
    m.push(`aguenta30 ${num(c.aguenta30)} abaixo do mínimo de ${num(e.aguenta30Min)}`)
  if (!eNumero(c.errosGravesRepetidos)) m.push('sem escuta (erros graves)')
  else if (c.errosGravesRepetidos > e.errosGravesRepetidosMax)
    m.push(`erro grave repetido em ${c.errosGravesRepetidos} caso(s), máximo ${e.errosGravesRepetidosMax}`)
  if (!eNumero(c.melhorQueAparelho)) m.push('sem comparação com a voz do aparelho')
  else if (c.melhorQueAparelho < e.melhorQueAparelhoMin - EPSILON)
    m.push(
      `melhor que a voz do aparelho em ${num(c.melhorQueAparelho)} ponto(s), mínimo ${num(e.melhorQueAparelhoMin)}`,
    )

  return m
}

/**
 * Escolhe o motor de um idioma. Pura e determinística (a ordem da lista não importa): os aprovados em todos os
 * portões competem pela maior `naturalidade`; empate desfeito pelo menor `rtf` e, por fim, pelo `id`.
 * @param {Candidato[]} candidatos
 * @param {import('./comum.mjs').LimiaresDaBancada} limiares
 * @param {'pt'|'en'|'es'} idioma
 * @param {{ t3Mantido?: boolean }} [opcoes]
 * @returns {Recomendacao}
 */
export function recomendar(candidatos, limiares, idioma, { t3Mantido = false } = {}) {
  if (!IDIOMAS.includes(idioma)) throw new Error(`idioma "${idioma}" inválido (use ${IDIOMAS.join('|')})`)
  const vistos = new Set()
  for (const c of candidatos) {
    if (typeof c?.id !== 'string' || !c.id) throw new Error('candidato sem id')
    if (c.id === CHAVE_GERAL) throw new Error(`id "${CHAVE_GERAL}" é reservado`)
    if (vistos.has(c.id)) throw new Error(`id "${c.id}" repetido na lista de candidatos`)
    vistos.add(c.id)
  }
  const motivos = {}
  const aprovados = []
  for (const c of candidatos) {
    motivos[c.id] = motivosDe(c, limiares, idioma, t3Mantido)
    if (motivos[c.id].length === 0) aprovados.push(c)
  }
  aprovados.sort((a, b) => b.naturalidade - a.naturalidade || a.rtf - b.rtf || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (aprovados.length === 0) motivos[CHAVE_GERAL] = [MOTIVO_SEM_ESCOLHA]
  return { escolhido: aprovados[0]?.id ?? null, motivos }
}

const IO_PADRAO = { out: (s) => console.log(s), err: (s) => console.error(s) }

/**
 * CLI. Devolve o código de saída (0 escolhido, 2 sem escolha, 1 uso errado).
 * @param {string[]} argv
 * @param {{ out: (s: string) => void, err: (s: string) => void }} [io]
 * @returns {Promise<number>}
 */
export async function principal(argv, io = IO_PADRAO) {
  try {
    const arquivo = pegarOpcao(argv, 'candidatos')
    const idioma = pegarOpcao(argv, 'idioma')
    if (!arquivo) throw new Error('--candidatos <arquivo.json> é obrigatório')
    if (!idioma || !IDIOMAS.includes(idioma)) throw new Error(`--idioma <${IDIOMAS.join('|')}> é obrigatório`)
    let candidatos
    try {
      candidatos = JSON.parse(readFileSync(path.resolve(arquivo), 'utf8'))
    } catch (e) {
      throw new Error(`não foi possível ler ${arquivo}: ${e.message}`)
    }
    if (!Array.isArray(candidatos)) throw new Error(`${arquivo}: esperava uma lista de candidatos`)
    const r = recomendar(candidatos, LIMIARES, idioma, { t3Mantido: argv.includes('--t3') })
    if (LIMIARES.provisorio) io.out('AVISO: limiares provisórios (a F0 ainda não os calibrou).')
    for (const [id, ms] of Object.entries(r.motivos)) {
      if (id === CHAVE_GERAL) continue
      io.out(`${ms.length === 0 ? 'passou ' : 'reprovou'} ${id}${ms.length ? `: ${ms.join('; ')}` : ''}`)
    }
    if (r.escolhido === null) {
      io.out(r.motivos[CHAVE_GERAL].join('; '))
      return 2
    }
    io.out(`escolhido: ${r.escolhido} (${idioma}); falta o dono ouvir e aprovar (spec §7.3)`)
    return 0
  } catch (e) {
    io.err(`erro: ${e.message}`)
    return 1
  }
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).then((codigo) => process.exit(codigo))
}
