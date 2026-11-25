/**
 * Prende a cobertura do filtro de saída para perfil protegido (change `filtro-tutor-menores`, tarefa 4.5).
 *
 * Todo arquivo de `server/ai/nucleo/` precisa CHAMAR `recusaSeSaidaBarrada(` ou `moderarSaidaDoTutor(` ou estar
 * na lista de exceções abaixo, cada uma com o motivo. Arquivo novo que devolve texto de LLM sem filtro falha aqui:
 * ou ganha a chamada, ou entra na lista com justificativa revisada.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const PASTA = join(process.cwd(), 'server', 'ai', 'nucleo')

const EXCECOES: Record<string, string> = {
  'traduzirNoNivel.ts': 'tradução de legenda/texto de terceiros, não é texto próprio do modelo para a pessoa (4.1)',
  'transcrever.ts': 'devolve a transcrição da fala da própria pessoa, não texto gerado por LLM',
  'sintetizarVoz.ts': 'devolve áudio sintetizado de um texto que já passou pelo filtro de quem o pediu',
  'saidaFiltrada.ts': 'é o próprio filtro (define recusaSeSaidaBarrada)',
  'recusa.ts': 'tipos e fábrica de recusa, não devolve texto de LLM',
  'contexto.ts': 'tipos do contexto das funções, não devolve texto de LLM',
  'ganchos.ts': 'ganchos de telemetria e cota, não devolve texto de LLM',
}

const CHAMADA = /\b(recusaSeSaidaBarrada|moderarSaidaDoTutor)\s*\(/

const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.ts'))
const filtra = (f: string) => CHAMADA.test(readFileSync(join(PASTA, f), 'utf8'))

describe('cobertura do filtro de saída no núcleo de IA', () => {
  it('toda função do núcleo filtra a saída ou está na lista de exceções', () => {
    const descobertos = arquivos.filter((f) => !(f in EXCECOES) && !filtra(f))
    expect(
      descobertos,
      `sem recusaSeSaidaBarrada/moderarSaidaDoTutor e fora das exceções: ${descobertos.join(', ')}`,
    ).toEqual([])
  })

  it('a lista de exceções não tem arquivo que sumiu nem arquivo que já filtra', () => {
    expect(Object.keys(EXCECOES).filter((f) => !arquivos.includes(f))).toEqual([])
    const redundantes = Object.keys(EXCECOES).filter((f) => f !== 'saidaFiltrada.ts' && filtra(f))
    expect(redundantes).toEqual([])
  })

  it('os pontos de saída conhecidos continuam filtrando', () => {
    for (const f of [
      'conversarComTutor.ts',
      'explicarFrase.ts',
      'parceiroDeLeitura.ts',
      'sugerirAlternativas.ts',
      'resumirSessao.ts',
      'polirLote.ts',
      'escrita.ts',
      'assistenteAoVivo.ts',
    ]) {
      expect(filtra(f), f).toBe(true)
    }
  })
})
