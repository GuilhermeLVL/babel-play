/**
 * CENÁRIO DA BANCADA POR OPÇÃO (A/B do Parakeet parcial, V2): o padrão é o de sempre (mídia em inglês, legenda em português,
 * `fleurs-en-8`); `--fixture fleurs-pt-12.json --eles pt-BR --eu pt-BR --qualidade accurate` põe áudio pt e a rota do Parakeet
 * (`parakeetServeNaRota`: todas as fontes pt/es). Funções puras: o teste não abre navegador.
 */
import path from 'node:path'

const SEGURO = /^[A-Za-z0-9._-]+$/

/** `opt(nome, padrão)` → `{ fixture, idioma, n, nome, eles, eu, qualidade }`; recusa valor com caractere fora de [A-Za-z0-9._-] (menos o caminho do fixture). */
export function cenarioDaBancada(opt, raiz) {
  const fixture = path.resolve(
    raiz,
    opt('fixture', path.join('tests', 'fixtures', 'bancada-captura', 'fleurs-en-8.json')),
  )
  const m = /fleurs-([a-z]{2})-(\d+)\.json$/.exec(fixture)
  if (!m) throw new Error(`--fixture: esperava fleurs-<idioma>-<n>.json, veio ${fixture}`)
  const [, idioma, n] = m
  const eles = opt('eles', 'en-US')
  const eu = opt('eu', 'pt-BR')
  const qualidade = opt('qualidade', '')
  for (const [nome, v] of [
    ['eles', eles],
    ['eu', eu],
    ['qualidade', qualidade],
  ])
    if (v && !SEGURO.test(v)) throw new Error(`--${nome}: valor inválido "${v}"`)
  if (qualidade && !['auto', 'fast', 'accurate'].includes(qualidade))
    throw new Error(`--qualidade: "${qualidade}" desconhecida`)
  return { fixture, idioma, n, nome: `bancada_${idioma}`, eles, eu, qualidade }
}
