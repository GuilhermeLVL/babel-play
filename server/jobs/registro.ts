/**
 * O REGISTRO ÚNICO DOS JOBS (Fase 2, Task 9). Cada trabalho periódico do servidor mora aqui UMA vez, e
 * os dois lados o leem:
 *
 *  - Node (self-host, dev): `server/boot/jobs.ts` arma um `setTimeout` por job, com a primeira passada
 *    `node.atrasoInicialMs` depois do boot e as seguintes a cada `node.intervaloMs` — os mesmos atrasos e a
 *    mesma cadência dos agendadores que existiam em cada módulo;
 *  - Worker: o `scheduled(controller)` dos Cron Triggers chama `executarJobsDoCron(controller.cron)`, que
 *    roda os jobs cuja `cron` é aquela expressão (Task 12 liga; `triggers.crons` do `wrangler.jsonc` sai
 *    daqui).
 *
 * Os dois passam por `executarJob` (`./executar.ts`): condição, lease, logs. As expressões são UTC, com
 * minutos diferentes para os jobs não dispararem todos juntos; o minuto repete o atraso do Node (5, 7, 11,
 * 13, 17 min…), para a ordem ser a mesma nos dois. A tabela está em `docs/deploy.md` ("Jobs periódicos").
 *
 * TETO POR PASSADA. Todo job para depois de um número limitado de lotes (ou é uma instrução só); o que
 * sobrar fica para a passada seguinte. Os módulos são carregados por import dinâmico: o registro não
 * puxa banco, armazenamento nem Supabase para quem só quer ler a lista (o `wrangler.jsonc`, os testes).
 */
import { authRequired } from '../lib/auth'
import { diasAteApagarDeVez, diasDeRetencaoDeAudio, limpezaDiariaLigada } from '../lib/config'
import { log } from '../lib/logger'

/** O que cada passada recebe: o relógio e o ambiente (no Worker, o `env` do `scheduled`). */
export interface ContextoDoJob {
  agora: number
  env: NodeJS.ProcessEnv
}

/** O resumo da passada, para o log `job_fim`. Só números e booleanos chegam ao log. */
export type ResumoDoJob = Record<string, unknown>

export interface Job {
  nome: string
  /** Expressão de Cron Trigger, em UTC. */
  cron: string
  /** O agendamento no Node: primeira passada depois do boot e o intervalo entre passadas. */
  node: { atrasoInicialMs: number; intervaloMs: number }
  /** Falsa: o job não roda (nem é agendado no Node). Reproduz o que o boot decidia antes. */
  condicao?: (env: NodeJS.ProcessEnv) => boolean
  rodar: (ctx: ContextoDoJob) => Promise<ResumoDoJob>
}

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

export const JOBS: Job[] = [
  {
    /* Retenção do áudio de sessão (`AUDIO_RETENCAO_DIAS`, padrão 90; 0 = para sempre). Lotes de 200
       sessões, até 50 lotes por passada. Ver `server/lib/retencaoDeAudio.ts`. */
    nome: 'retencaoDeAudio',
    cron: '5 3 * * *',
    node: { atrasoInicialMs: 5 * MIN, intervaloMs: DIA },
    condicao: (env) => diasDeRetencaoDeAudio(env) > 0,
    async rodar({ agora, env }) {
      const { limparAudiosVencidos } = await import('../lib/retencaoDeAudio')
      return { ...(await limparAudiosVencidos({ dias: diasDeRetencaoDeAudio(env), agora })) }
    },
  },
  {
    /* Convidados sem nuvem há 30 dias (Fase 7): só no modo público. Lotes de 100, até 20 por passada.
       Ver `server/lib/limpezaDeConvidados.ts`. */
    nome: 'limpezaDeConvidados',
    cron: '7 3 * * *',
    node: { atrasoInicialMs: 7 * MIN, intervaloMs: DIA },
    condicao: (env) => authRequired(env),
    async rodar({ agora }) {
      const { limparConvidadosInativos } = await import('../lib/limpezaDeConvidados')
      return { ...(await limparConvidadosInativos({ agora })) }
    },
  },
  {
    /* Cache de tradução persistente (L2): vencidas e excedentes, duas instruções. Vale no self-host
       também. Ver `server/ai/cacheDeTraducao.ts`. */
    nome: 'podaDoCacheDeTraducao',
    cron: '11 3 * * *',
    node: { atrasoInicialMs: 11 * MIN, intervaloMs: DIA },
    async rodar({ agora }) {
      const { podarCacheDeTraducao } = await import('../ai/cacheDeTraducao')
      return { ...(await podarCacheDeTraducao({ agora })) }
    },
  },
  {
    /* Cache compartilhado do parceiro de leitura (livros PD): vencidas (90 dias) e excedentes. Mesmo horário do cache
       de tradução (o Worker roda os dois no mesmo Cron Trigger). Ver `server/ai/leitura/cacheDoParceiro.ts`. */
    nome: 'podaDoCacheDoParceiro',
    cron: '11 3 * * *',
    node: { atrasoInicialMs: 12 * MIN, intervaloMs: DIA },
    async rodar({ agora }) {
      const { podarCacheDoParceiro } = await import('../ai/leitura/cacheDoParceiro')
      return { ...(await podarCacheDoParceiro({ agora })) }
    },
  },
  {
    /* Marca do teste do Premium (C6): 730 dias, uma instrução. Só no modo público. Ver
       `server/lib/testePremium.ts`. */
    nome: 'podaDasMarcasDeTeste',
    cron: '13 3 * * *',
    node: { atrasoInicialMs: 13 * MIN, intervaloMs: DIA },
    condicao: (env) => authRequired(env),
    async rodar({ agora }) {
      const { podarMarcasDeTeste } = await import('../lib/testePremium')
      const marcas = await podarMarcasDeTeste(agora)
      if (marcas > 0) log('info', { event: 'teste_premium_marcas_podadas', total: marcas })
      return { marcas }
    },
  },
  {
    /* Janelas diárias do uso justo (C9): uma instrução por métrica. Só no modo público. Ver
       `podarJanelasDiarias` em `server/lib/usageQuota.ts`. */
    nome: 'podaDasJanelasDiarias',
    cron: '17 3 * * *',
    node: { atrasoInicialMs: 17 * MIN, intervaloMs: DIA },
    condicao: (env) => authRequired(env),
    async rodar({ agora }) {
      const { podarJanelasDiarias } = await import('../lib/usageQuota')
      await podarJanelasDiarias(agora)
      return {}
    },
  },
  {
    /* Limpeza diária do banco (`LIMPEZA_DIARIA=1`): lotes de 500 linhas por usuário, cada um numa
       transação curta, até 200 lotes por passada. No Node, a primeira passada segue 17 min depois do
       boot (como antes); no cron, 23 min depois da hora, para não coincidir com a poda das janelas.
       Ver `server/lib/limpezaDiaria.ts`. */
    nome: 'limpezaDiaria',
    cron: '23 3 * * *',
    node: { atrasoInicialMs: 17 * MIN, intervaloMs: DIA },
    condicao: (env) => limpezaDiariaLigada(env),
    async rodar({ agora, env }) {
      const { limparBanco } = await import('../lib/limpezaDiaria')
      return { ...(await limparBanco({ agora, dias: diasAteApagarDeVez(env) })) }
    },
  },
  {
    /* Reconciliação do armazenamento (`STORAGE_RECONCILE_MODE=job`): de hora em hora, os 200 usuários com
       o contador mais velho que `STORAGE_RECONCILE_HOURS` (padrão 24). Era o cron externo batendo em
       `POST /api/admin/armazenamento/reconciliar`, que continua existindo. Ver `server/lib/storageQuota.ts`. */
    nome: 'reconciliarArmazenamento',
    cron: '19 * * * *',
    node: { atrasoInicialMs: 19 * MIN, intervaloMs: HORA },
    condicao: (env) => env.STORAGE_RECONCILE_MODE === 'job',
    async rodar() {
      const { reconciliarVencidos } = await import('../lib/storageQuota')
      const { candidatos, reconciliados, falhas } = await reconciliarVencidos({ limite: 200 })
      return { candidatos, reconciliados, falhas }
    },
  },
]
