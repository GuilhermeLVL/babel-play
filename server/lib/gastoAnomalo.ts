/**
 * GASTO ANÔMALO POR USUÁRIO (Fase 5 de prontidão, 25/09/2026).
 *
 * As cotas do plano (`usageQuota.ts`) limitam o MÊS de um assinante, e o orçamento global
 * (`orcamentoDeIa.ts`) limita a SOMA do serviço. Nenhum dos dois responde "quem, hoje, está gastando
 * muito mais que todo mundo?" — o sinal de um cliente em laço, de uma conta compartilhada numa sala
 * inteira ou de uso automatizado. Quando a cota dele acabar já terá sido tarde para o orçamento do dia.
 *
 * Duas regras, qualquer uma basta:
 *   - TETO ABSOLUTO: o gasto do usuário no dia (UTC) passou de `AI_USUARIO_ALERTA_USD_DIA`;
 *   - MEDIANA: passou de `AI_USUARIO_ALERTA_FATOR` × a mediana de quem gastou hoje — só com pelo
 *     menos `minimoDeUsuarios` no dia, senão o primeiro cliente da manhã vira "anômalo" contra ninguém.
 *
 * O vigia NÃO BLOQUEIA: quem bloqueia é a cota. Ele avisa UMA vez por usuário, por dia e por motivo.
 *
 * EM MEMÓRIA E POR PROCESSO, de propósito. É uma observação, não uma trava: perder o dia num deploy
 * só atrasa o alerta até o usuário gastar de novo o limiar. Com uma máquina (ADR 0006) o processo vê
 * todo o tráfego; com réplicas, cada uma vigia a sua fatia — e o limiar absoluto continua valendo.
 * O mapa zera quando o dia vira, então a memória é limitada ao número de usuários ativos no dia.
 */
import type { LimiaresDeGastoPorUsuario } from './config'

export type MotivoDoGastoAnomalo = 'teto' | 'mediana'

export interface GastoAnomalo {
  motivo: MotivoDoGastoAnomalo
  gastoUsd: number
  /** `null` quando a regra da mediana não se aplica (poucos usuários no dia). */
  medianaUsd: number | null
  tetoUsd: number
}

export interface VigiaDeGasto {
  /** Soma o custo ao dia do usuário; devolve o alerta a emitir, ou `null`. */
  registrar(userId: string, custoUsd: number): GastoAnomalo | null
  usuariosHoje(): number
}

/** Recalcular a mediana a cada chamada custaria O(n log n) por chamada de IA; um minuto de atraso não muda o alerta. */
const VALIDADE_DA_MEDIANA_MS = 60_000
/** Com poucos usuários a ordenação é de graça, e a mediana precisa refletir cada novo usuário. */
const POUCOS_USUARIOS = 50

const diaUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

function mediana(valores: number[]): number {
  const ord = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ord.length / 2)
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2
}

export function criarVigiaDeGasto(o: {
  limiares: () => LimiaresDeGastoPorUsuario
  agora?: () => number
}): VigiaDeGasto {
  const agora = o.agora ?? Date.now
  let dia = ''
  const gastos = new Map<string, number>()
  const avisados = new Set<string>()
  let medianaEmCache: { valor: number; em: number } | null = null

  const virarODiaSeFor = () => {
    const hoje = diaUtc(agora())
    if (hoje === dia) return
    dia = hoje
    gastos.clear()
    avisados.clear()
    medianaEmCache = null
  }

  const medianaDoDia = (): number => {
    const t = agora()
    if (gastos.size < POUCOS_USUARIOS || !medianaEmCache || t - medianaEmCache.em > VALIDADE_DA_MEDIANA_MS) {
      medianaEmCache = { valor: mediana([...gastos.values()]), em: t }
    }
    return medianaEmCache.valor
  }

  return {
    registrar(userId, custoUsd) {
      if (!Number.isFinite(custoUsd) || custoUsd <= 0) return null
      virarODiaSeFor()
      const total = (gastos.get(userId) ?? 0) + custoUsd
      gastos.set(userId, total)
      const l = o.limiares()

      if (total > l.tetoUsdDia && !avisados.has(`${userId}\u0000teto`)) {
        avisados.add(`${userId}\u0000teto`)
        const med = gastos.size >= l.minimoDeUsuarios ? medianaDoDia() : null
        return { motivo: 'teto', gastoUsd: total, medianaUsd: med, tetoUsd: l.tetoUsdDia }
      }
      if (gastos.size >= l.minimoDeUsuarios && !avisados.has(`${userId}\u0000mediana`)) {
        const med = medianaDoDia()
        if (med > 0 && total > l.fatorDaMediana * med) {
          avisados.add(`${userId}\u0000mediana`)
          return { motivo: 'mediana', gastoUsd: total, medianaUsd: med, tetoUsd: l.tetoUsdDia }
        }
      }
      return null
    },
    usuariosHoje() {
      virarODiaSeFor()
      return gastos.size
    },
  }
}
