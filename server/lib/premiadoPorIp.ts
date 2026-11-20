/**
 * OS TETOS POR IP E POR REDE DO ANÚNCIO PREMIADO (revisão de segurança de 15/11/2026).
 *
 * Sem a verificação servidor a servidor (SSV) da rede de anúncios, a recompensa é um aperto de mão que um script
 * imita (`iniciar`, esperar 15 s, `concluir`). Os tetos por CONTA não seguram uma fazenda de contas; estes a prendem
 * ao endereço de onde ela conclui: `LIMITE_DE_PREMIADOS_POR_IP_POR_DIA` por IP e
 * `LIMITE_DE_PREMIADOS_POR_REDE_POR_DIA` por rede (/24 no IPv4, /48 no IPv6), no dia UTC.
 *
 * Só ENCARECEM a fraude (trocar de rede custa mais que trocar de conta). A proteção de verdade é o SSV da rede de
 * anúncios: quando houver, o `concluir` passa a exigir o callback assinado da rede e estes tetos viram a segunda linha.
 *
 * O IP é PSEUDONIMIZADO como o do convidado e o do teste (`convidado.ts`, `testePremium.ts`): HMAC com a chave do
 * servidor e o DIA. Não volta ao IP (LGPD art. 12) e muda todo dia. A RESERVA é a atômica de `usage_counters`
 * (`reserve`: decide e grava numa instrução), então uma rajada simultânea não passa do teto; quem reserva e não
 * credita (exibição cedo demais, expirada, já concluída, teto da conta) chama `estornar`.
 */
import { createHmac } from 'node:crypto'
import { isIPv4 } from 'node:net'

import { ipKeyGenerator } from 'express-rate-limit'

import { LIMITE_DE_PREMIADOS_POR_IP_POR_DIA, LIMITE_DE_PREMIADOS_POR_REDE_POR_DIA } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { asUserId, type UserId } from './authContext'

/** O balde em `usage_counters` (a janela é o dia UTC, `AAAA-MM-DD`); IP e rede na mesma métrica, chaves distintas. */
export const METRIC_PREMIADOS_POR_IP = 'premiado:ip'

/** A poda dos dias passados roda em 1 de cada tantas reservas. */
const AMOSTRA_DA_PODA = 50

const diaUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 10)

let chaveDeHash: string | null = null
async function chave(): Promise<string> {
  // Import tardio, como em `convidado.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDeHash ??= (await import('../crypto')).obterChaveDeHash()
  return chaveDeHash
}

/**
 * A REDE do IP: IPv4 (inclusive mapeado em IPv6) por /24, IPv6 por /48 — o bloco que um provedor costuma dar a um
 * cliente. `ipKeyGenerator` já desfaz o IPv4 mapeado e corta o IPv6 no prefixo.
 */
export function redeDoIp(ip: string): string {
  const base = ipKeyGenerator(ip, 48)
  if (isIPv4(base)) return `${base.split('.').slice(0, 3).join('.')}.0/24`
  return base
}

/** As chaves pseudonimizadas do IP (agrupado como o do convidado, IPv6 por /56) e da rede, e a janela do dia. */
export async function chavesDoPremiado(ip: string, agora: number): Promise<{ ip: UserId; rede: UserId; dia: string }> {
  const dia = diaUtc(agora)
  const k = await chave()
  const h = (tipo: string, valor: string) =>
    createHmac('sha256', k).update(`babel-play:premiado-${tipo}:v1:${dia}:${valor}`).digest('hex').slice(0, 32)
  return {
    ip: asUserId(`premiado-ip:${h('ip', ipKeyGenerator(ip))}`),
    rede: asUserId(`premiado-rede:${h('rede', redeDoIp(ip))}`),
    dia,
  }
}

export interface VagaDoPremiadoNoIp {
  /** Devolve a vaga do IP e da rede: a conclusão não creditou. Idempotente por contador (ver o corpo). */
  estornar: () => Promise<void>
}

/**
 * RESERVA uma conclusão para o IP e para a rede dele no dia. `null` = um dos dois já está no teto (nada fica
 * reservado). A poda dos dias passados é best-effort, fora da decisão.
 */
export async function reservarConclusaoNoIp(ip: string, agora = Date.now()): Promise<VagaDoPremiadoNoIp | null> {
  const c = await chavesDoPremiado(ip, agora)
  if (!(await usageCountersRepo.reserve(c.ip, METRIC_PREMIADOS_POR_IP, c.dia, LIMITE_DE_PREMIADOS_POR_IP_POR_DIA)))
    return null
  if (
    !(await usageCountersRepo.reserve(c.rede, METRIC_PREMIADOS_POR_IP, c.dia, LIMITE_DE_PREMIADOS_POR_REDE_POR_DIA))
  ) {
    await usageCountersRepo.refund(c.ip, METRIC_PREMIADOS_POR_IP, c.dia)
    return null
  }
  /* Poda dos dias passados por AMOSTRA (1 em `AMOSTRA_DA_PODA`): best-effort, sem um DELETE a cada conclusão. */
  if (Math.random() < 1 / AMOSTRA_DA_PODA) await usageCountersRepo.prune(METRIC_PREMIADOS_POR_IP, c.dia).catch(() => {})
  /* Cada contador estorna UMA vez e por conta própria: se o do IP volta e o da rede falha, chamar de novo
     estorna só o da rede (nada vaza, nada estorna duas vezes). Tenta os dois e relança a primeira falha. */
  const pendentes = new Set<UserId>([c.ip, c.rede])
  return {
    estornar: async () => {
      let falha: unknown = null
      for (const chaveDoContador of [...pendentes]) {
        try {
          await usageCountersRepo.refund(chaveDoContador, METRIC_PREMIADOS_POR_IP, c.dia)
          pendentes.delete(chaveDoContador)
        } catch (err) {
          falha ??= err
        }
      }
      if (falha) throw falha
    },
  }
}
