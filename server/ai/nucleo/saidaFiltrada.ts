/**
 * O FILTRO DE SAÍDA PARA PERFIL PROTEGIDO NAS FUNÇÕES QUE NÃO SÃO O TUTOR (change `filtro-tutor-menores`, tarefa 4.1).
 *
 * Explicação, resumo, escrita, alternativas, polimento, parceiro de leitura e assistente ao vivo devolvem JSON já LIDO
 * (campos de texto que a tela mostra). Para perfil protegido (`menor`: menor de 18 ou idade não declarada), cada
 * string desse resultado passa pelo MESMO moderador do tutor (`moderarSaidaDoTutor`) ANTES de sair, de ir ao cache ou
 * de ser gravada. Barrou: nada do texto sai — a resposta é 502 `saida_filtrada` (não há "frase fixa" aqui: a tela não
 * é um chat), a cota foi consumida (o provedor cobrou) e o log/métrica levam só categoria, função e `requestId`.
 *
 * Confere o valor LIDO, não o texto bruto: um `http` no JSON só vira `http` depois do parse.
 */
import { contarSaidaFiltrada } from '../../http/metricas'
import { log } from '../../lib/logger'
import type { FuncaoDeIa } from '../funcoesDeIa'
import { moderarSaidaDoTutor } from '../moderacao/moderarSaidaDoTutor'
import type { RastroDeIa } from '../telemetriaDeIa'
import { recusaDeErro, type RecusaDeIa } from './recusa'

const PROFUNDIDADE_MAXIMA = 12

/** Toda string do valor (objetos e listas, também as chaves), uma a uma. */
export function textosDoValor(valor: unknown, saida: string[] = [], nivel = 0): string[] {
  if (typeof valor === 'string') saida.push(valor)
  else if (nivel >= PROFUNDIDADE_MAXIMA) saida.push(JSON.stringify(valor) ?? '')
  else if (Array.isArray(valor)) for (const v of valor) textosDoValor(v, saida, nivel + 1)
  else if (valor && typeof valor === 'object')
    for (const [k, v] of Object.entries(valor)) {
      saida.push(k)
      textosDoValor(v, saida, nivel + 1)
    }
  return saida
}

export function recusaSaidaFiltrada(): RecusaDeIa {
  return recusaDeErro(
    502,
    'a resposta foi barrada pelo filtro de segurança; tente de novo ou peça de outro jeito',
    'saida_filtrada',
  )
}

/**
 * Confere o valor para perfil protegido. Devolve a recusa (e já registrou log, métrica e rastro) ou `null` se pode
 * sair. Adulto não é conferido (`menor` falso devolve `null` sem custo).
 */
export async function recusaSeSaidaBarrada(
  ctx: { requestId?: string; rastro: RastroDeIa },
  funcao: FuncaoDeIa,
  menor: boolean,
  valor: unknown,
): Promise<RecusaDeIa | null> {
  if (!menor) return null
  for (const texto of textosDoValor(valor)) {
    const veredicto = await moderarSaidaDoTutor(texto, { protegido: true })
    if (veredicto.ok !== false) continue
    log('warn', { event: 'ia_saida_filtrada', categoria: veredicto.motivo, funcao, requestId: ctx.requestId })
    contarSaidaFiltrada(funcao, veredicto.motivo)
    ctx.rastro.anotar({ saidaFiltrada: veredicto.motivo })
    return recusaSaidaFiltrada()
  }
  return null
}
