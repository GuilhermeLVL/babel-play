/**
 * RETENÇÃO DO ÁUDIO DAS SESSÕES — a limpeza diária de `AUDIO_RETENCAO_DIAS` (padrão 90 dias).
 *
 * POR QUE EXISTE. O áudio gravado de uma captura é o dado mais pesado do servidor (a mídia é 33× o
 * banco, `armazenamento.ts`) e o mais pessoal: é a VOZ de quem falou — e às vezes de quem estava
 * por perto, que nunca aceitou termo nenhum. Até aqui ele ficava para sempre, e a política de
 * privacidade não dizia por quanto tempo (LGPD art. 15 e 16: o dado é eliminado quando a finalidade
 * se cumpre). A finalidade do áudio é reouvir a sessão enquanto ela é estudada; a transcrição, o
 * vocabulário e o progresso continuam depois dele.
 *
 * O QUE A LIMPEZA FAZ, por sessão com áudio criada há mais de N dias:
 *   1. apaga o ARQUIVO pelo seam de armazenamento (disco ou S3/R2 — o mesmo de `routes/sessions`);
 *   2. SÓ SE ELE SAIU, devolve os bytes à cota do usuário (`liberarArmazenamento`) — liberar cota de
 *      um arquivo que continua lá é o furo que F4-03 fechou na exclusão de sessão;
 *   3. tira `audioFile`/`audioType` do `meta`, para o player não oferecer um áudio que não existe.
 *
 * Uma falha num arquivo é LOGADA e a varredura segue: um objeto travado não pode segurar a retenção
 * de todos os outros. O arquivo que falhou continua referenciado e volta na próxima execução.
 *
 * `0` DESLIGA: é o "guardar para sempre" do self-host, onde o dono é o titular do dado.
 */
import path from 'node:path'

import { sessionsRepo } from '../db/repositories/sessions'
import type { Armazenamento } from './armazenamento'
import { armazenamentoDoAmbiente } from './armazenamento'
import { asUserId } from './authContext'
import { log } from './logger'
import { diretorioDeAudio, liberarArmazenamento } from './storageQuota'

const DIA_MS = 86_400_000
/** Sessões por consulta. A varredura repete o lote enquanto ele vier cheio e produtivo. */
const LOTE = 200

export interface ResultadoDaLimpeza {
  removidos: number
  bytes: number
  falhas: number
}

function nomeDoAudio(meta: string | null): string | null {
  if (!meta) return null
  try {
    const m = JSON.parse(meta) as Record<string, unknown>
    return typeof m.audioFile === 'string' && m.audioFile ? m.audioFile : null
  } catch {
    return null
  }
}

/**
 * Uma passada de limpeza. `agora` e `store` são injetáveis para o teste; em produção valem o
 * relógio e o armazenamento do ambiente.
 */
export async function limparAudiosVencidos(o: {
  dias: number
  agora?: number
  store?: Armazenamento
}): Promise<ResultadoDaLimpeza> {
  const r: ResultadoDaLimpeza = { removidos: 0, bytes: 0, falhas: 0 }
  if (!(o.dias > 0)) return r
  const store = o.store ?? armazenamentoDoAmbiente(path.resolve(diretorioDeAudio()))
  const limite = (o.agora ?? Date.now()) - o.dias * DIA_MS

  /* O laço termina de dois jeitos: lote incompleto (acabou) ou lote em que NADA saiu (só sobraram
     falhas, que voltariam no mesmo lugar da fila para sempre). */
  for (;;) {
    const lote = await sessionsRepo.comAudioCriadasAntesDe(limite, LOTE)
    let saiuAlgo = false
    for (const s of lote) {
      const nome = nomeDoAudio(s.meta)
      if (!nome || !s.userId) continue
      const userId = asUserId(s.userId)
      try {
        const bytes = (await store.tamanho(nome)) ?? 0
        await store.remover(nome)
        await liberarArmazenamento(userId, bytes)
        await sessionsRepo.patchMeta(userId, s.id, { audioFile: null, audioType: null })
        r.removidos++
        r.bytes += bytes
        saiuAlgo = true
      } catch (err) {
        r.falhas++
        log('warn', {
          event: 'retencao_audio_falhou',
          error: String((err as Error)?.message ?? err).slice(0, 160),
        })
      }
    }
    if (lote.length < LOTE || !saiuAlgo) break
  }

  if (r.removidos > 0 || r.falhas > 0) {
    log('info', { event: 'retencao_audio_ok', total: r.removidos, status: r.falhas > 0 ? 207 : 200 })
  }
  return r
}

/**
 * Liga a limpeza diária. Devolve como desligar (o teste usa; o servidor não precisa).
 *
 * Mesmo padrão do snapshot diário (`server/operacao/snapshot.ts`): dentro do processo que prepara
 * os dados (o primário, no cluster — N processos fariam N varreduras), temporizadores com `unref()`
 * para a limpeza nunca ser o motivo de o processo não sair num SIGTERM. A primeira passada roda
 * alguns minutos depois do boot, e não no boot: subir é o momento em que o banco mais trabalha.
 */
export function agendarLimpezaDeAudio(o: { dias: number; atrasoInicialMs?: number; intervaloMs?: number }): () => void {
  if (!(o.dias > 0)) return () => {}
  let relogio: NodeJS.Timeout | undefined
  const rodar = async () => {
    try {
      await limparAudiosVencidos({ dias: o.dias })
    } catch (err) {
      log('error', { event: 'retencao_audio_erro', error: String((err as Error)?.message ?? err).slice(0, 300) })
    }
  }
  const armar = (ms: number) => {
    relogio = setTimeout(() => {
      void rodar().finally(() => armar(o.intervaloMs ?? DIA_MS))
    }, ms)
    relogio.unref?.()
  }
  armar(o.atrasoInicialMs ?? 5 * 60_000)
  return () => {
    if (relogio) clearTimeout(relogio)
  }
}
