/**
 * OS SETE AGENDAMENTOS DIÁRIOS DO NODE — saíram do `server.ts` sem mudar de comportamento.
 *
 * Cada um é um `setTimeout` encadeado no processo. Só o processo que prepara os dados os agenda (o
 * primário, no cluster): uma varredura por deploy, não uma por worker. Num Worker não há processo
 * vivo entre requisições; lá estes trabalhos viram Cron Trigger (Fase 2, mais adiante).
 */
import { authRequired } from '../lib/auth'
import { configDoBackupDiario, diasAteApagarDeVez, diasDeRetencaoDeAudio, limpezaDiariaLigada } from '../lib/config'

export async function agendarJobsNoNode(): Promise<void> {
  /* SNAPSHOT DIÁRIO (Fase 5) — só no processo que prepara os dados (o primário, no cluster). Aposentado
     na migração para o Postgres: ver `server/operacao/snapshot.ts`. */
  const backup = configDoBackupDiario()
  if (backup) {
    /* No Postgres o job só registra que o snapshot está indisponível (o backup é `pg_dump` no CI);
       ele continua agendado para o `BACKUP_DIARIO=1` de quem já o tinha ligado deixar rastro no log. */
    const { agendarSnapshotDiario, fazerSnapshot, SNAPSHOT_INDISPONIVEL } = await import('../operacao/snapshot')
    const { observarBackup } = await import('../http/metricas')
    agendarSnapshotDiario({
      horaUtc: backup.horaUtc,
      heartbeatUrl: backup.heartbeatUrl,
      executar: fazerSnapshot,
      observar: observarBackup,
    })
    console.warn(`[backup] BACKUP_DIARIO=1: snapshot ${SNAPSHOT_INDISPONIVEL}`)
  }

  /* RETENÇÃO DO ÁUDIO DE SESSÃO (`AUDIO_RETENCAO_DIAS`, padrão 90 dias; 0 = para sempre) — no mesmo
     processo e pelo mesmo motivo do snapshot acima: uma varredura por deploy, não uma por worker.
     O porquê da política e o que a limpeza apaga estão em `server/lib/retencaoDeAudio.ts`. */
  const diasDeRetencao = diasDeRetencaoDeAudio()
  if (diasDeRetencao > 0) {
    const { agendarLimpezaDeAudio } = await import('../lib/retencaoDeAudio')
    agendarLimpezaDeAudio({ dias: diasDeRetencao })
    console.log(`[retenção] áudio de sessão apagado após ${diasDeRetencao} dias (limpeza diária)`)
  }

  /* EXPIRAÇÃO DOS CONVIDADOS (Fase 7): convidado sem nuvem há 30 dias perde contadores e o usuário
     anônimo no Supabase. Mesmo processo e mesmo motivo da retenção acima. Só no modo público — no
     self-host não há convidado. Ver `server/lib/limpezaDeConvidados.ts`. */
  if (authRequired()) {
    const { agendarLimpezaDeConvidados } = await import('../lib/limpezaDeConvidados')
    agendarLimpezaDeConvidados()
    console.log('[convidados] inativos há 30 dias removidos (limpeza diária)')
  }

  /* A PODA DAS JANELAS DIÁRIAS do uso justo (C9, item 9.3): os contadores `AAAA-MM-DD` com mais de
     três dias saem. Mesmo processo e mesmo motivo das limpezas acima; só no modo público, o único com
     teto no dia. Ver `podarJanelasDiarias` em `server/lib/usageQuota.ts`. */
  if (authRequired()) {
    const { agendarPodaDasJanelasDiarias } = await import('../lib/usageQuota')
    agendarPodaDasJanelasDiarias()
    console.log('[uso justo] janelas diárias com mais de 3 dias removidas (poda diária)')
  }

  /* RETENÇÃO DA MARCA DO TESTE DO PREMIUM (C6): o HMAC do e-mail sai 730 dias depois do teste (LGPD
     art. 15 — sem finalidade depois disso). Mesmo processo e mesmo motivo das limpezas acima; só no
     modo público, o único em que há teste. Ver `server/lib/testePremium.ts`. */
  if (authRequired()) {
    const { agendarPodaDasMarcasDeTeste } = await import('../lib/testePremium')
    agendarPodaDasMarcasDeTeste()
  }

  /* PODA DO CACHE DE TRADUÇÃO PERSISTENTE (L2, migração 0038): vencidas em 30 dias e, acima do teto,
     as menos usadas. Mesmo processo e mesmo motivo das limpezas acima; vale no self-host também,
     porque o cache existe onde houver chave de LLM. Ver `server/ai/cacheDeTraducao.ts`. */
  const { agendarPodaDoCacheDeTraducao } = await import('../ai/cacheDeTraducao')
  agendarPodaDoCacheDeTraducao()

  /* LIMPEZA DIÁRIA DO BANCO: apaga de vez o que foi apagado há mais de `LIMPEZA_RETENCAO_DIAS`
     (padrão 30) e confere os agregados diários. Mesmo processo e mesmo motivo das limpezas acima.
     `LIMPEZA_DIARIA=0` desliga; em teste não agenda. Ver `server/lib/limpezaDiaria.ts`. */
  if (limpezaDiariaLigada()) {
    const { agendarLimpezaDiaria } = await import('../lib/limpezaDiaria')
    agendarLimpezaDiaria()
    console.log(`[limpeza] linhas apagadas há mais de ${diasAteApagarDeVez()} dias saem de vez (limpeza diária)`)
  }
}
