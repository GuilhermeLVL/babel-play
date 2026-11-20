/**
 * PREPARAR O PROCESSO E OS DADOS — só no Node (servidor de sempre e CI), nunca num Worker.
 *
 * Saiu do `server.ts` sem mudar de comportamento: o diário de erros em disco e o Sentry, e depois as
 * migrations, o seed de demonstração e os backfills idempotentes. No cluster, só o primário prepara
 * os dados (`prepararDados`); os workers sobem sobre o que ele deixou pronto.
 */
import path from 'path'

import { seedIfEmpty } from '../db/seed'
import { authRequired } from '../lib/auth'
import { registrarFalhaDeBoot, registrarSucessoDeBoot } from '../lib/bootStatus'
import { configDoSentry } from '../lib/config'
import { diretorioGravavel } from '../lib/diretorios'
import { log } from '../lib/logger'

/** Destinos do `log('error')`: o diário em disco e, se configurado, o Sentry. `podarAqui` só no primário. */
export async function ligarRegistroDeErros(podarAqui: boolean): Promise<void> {
  /*
   * DIÁRIO DE ERROS — achado F5-04, a parte que não depende de escolher fornecedor.
   *
   * Ligado ANTES de tudo, inclusive das migrations: se o boot falhar, é justamente o erro do boot
   * que precisa sobreviver. O stdout de um container é volátil — `docker logs` guarda o que a
   * política do daemon deixar e um restart leva o resto — então "ninguém lê o stdout" muitas vezes
   * é, mais precisamente, "já não há stdout para ler".
   *
   * `ERROS_DIR=off` desliga, para quem tiver um coletor de verdade e não quiser a cópia em disco.
   * O que isto NÃO faz continua valendo e está escrito em `diarioDeErros.ts`: não alerta ninguém.
   */
  const dirDeErros = process.env.ERROS_DIR ?? path.join(diretorioGravavel(), 'erros')
  if (dirDeErros !== 'off') {
    try {
      const { diarioEmArquivo } = await import('../lib/diarioDeErros')
      const { registrarSinkDeErro } = await import('../lib/logger')
      /* PODA SO NO PRIMARIO. `prepararDados` e o que ja distingue os dois papeis do cluster: o
         primario migra, faz seed e agora tambem cuida do volume. Antes, N workers varriam o mesmo
         diretorio uma vez por dia cada um (achado A61). Cada processo escreve no proprio arquivo,
         e a leitura junta todos. */
      registrarSinkDeErro(diarioEmArquivo({ dir: dirDeErros, podarAqui }))
      console.log(`[erros] diário em ${dirDeErros}`)
    } catch (err) {
      /*
       * Degradação, não falha: o servidor serve sem o diário. Mas a mensagem precisa nomear o
       * caminho, e essa lição foi cara — a primeira versão usava `DATA_DIR || "data"`, um caminho
       * RELATIVO ao cwd, e dentro do container o `/app` pertence ao root enquanto o processo roda
       * como `node`. O diário morria com EACCES exatamente no ambiente para o qual foi escrito, e
       * a mensagem não dizia onde ele tinha tentado escrever. Uma observabilidade que se desliga
       * em produção e não conta onde falhou é pior do que não tê-la: dá a sensação de cobertura.
       */
      console.error(`[erros] diário em disco INDISPONÍVEL em ${dirDeErros}; seguindo só com stdout:`, err)
    }
  }

  /* SENTRY (Fase 5): mais um destino para o `log('error')` já saneado — nada além da linha do
     diário sai daqui (ver `server/lib/sentry.ts`). Ligado antes das migrações pelo mesmo motivo do
     diário: o erro do boot é o que mais precisa chegar a alguém. */
  const sentry = configDoSentry()
  if (sentry) {
    const { sinkDoSentry } = await import('../lib/sentry')
    const { registrarSinkDeErro } = await import('../lib/logger')
    const sink = sinkDoSentry(sentry)
    if (sink) {
      registrarSinkDeErro(sink)
      console.log(`[sentry] erros do servidor vão para o Sentry (ambiente ${sentry.ambiente ?? '—'})`)
    } else {
      console.warn('[sentry] SENTRY_DSN inválido — seguindo sem Sentry')
    }
  }
}

/**
 * A linha de um boot que vai encerrar o processo: o evento `boot_falhou` e o NOME do passo, no formato
 * que o diário e o Sentry recebem (o `console.error` ao lado não chega a eles). Quem encerra é o chamador.
 */
export function logarFalhaDoBoot(etapa: string, err: unknown): void {
  log('error', { event: 'boot_falhou', etapa, error: String((err as Error)?.message ?? err).slice(0, 300) })
}

/**
 * Migrations, seed e backfills. LANÇA se as migrations (ou o seed) falharem — quem chama encerra o processo:
 * sem schema o app não serve nada. Os outros passos registram a falha no `/api/health` e seguem.
 */
export async function prepararDados(): Promise<void> {
  // Migrations ANTES de tudo. Sem isto, um deploy limpo entra em crash-loop: o volume começa
  // vazio e o `seedIfEmpty()` abaixo estoura com "no such table: sessions". Idempotente —
  // num banco já migrado não faz nada.
  //
  // Falha aqui é FATAL de propósito: sem schema o app não serve nada, e um crash-loop com
  // mensagem clara é melhor sinal do que subir e devolver 500 em toda rota. O restart do
  // orquestrador também resolve sozinho a contenção transitória de lock entre réplicas.
  try {
    const { aplicarMigrations } = await import('../db/manutencao')
    await aplicarMigrations()
  } catch (err) {
    console.error('[db] FALHA AO APLICAR MIGRATIONS — o app não pode servir sem schema:', err)
    logarFalhaDoBoot('migrations', err)
    throw err
  }

  /*
   * SEED DE DEMONSTRACAO SO EM SELF-HOST (achado A61).
   *
   * `seedIfEmpty` cria uma sessao e cartoes de exemplo para o LOCAL_OWNER em toda base vazia —
   * inclusive num deploy PUBLICO, onde nao existe "dono local": os dados de demonstracao ficavam
   * pendurados num usuario que ninguem usa, e apareceriam para quem quer que recebesse aquele id.
   * Em modo publico a base nova esta certa vazia.
   */
  if (!authRequired()) {
    try {
      await seedIfEmpty()
    } catch (err) {
      logarFalhaDoBoot('seed', err)
      throw err
    }
  }

  // M-04: migra cartões Leitner → FSRS no boot (idempotente; nas próximas execuções migra 0).
  try {
    // P3-1: a migração vive em `db/manutencao` (atravessa tenants), não no barrel das rotas.
    const { migrarLeitnerParaFsrs } = await import('../db/manutencao')
    const migrados = await migrarLeitnerParaFsrs()
    if (migrados > 0) console.log(`[db] ${migrados} cartão(ões) Leitner migrado(s) para FSRS (M-04)`)
    // Passo que deu certo APAGA a falha anterior: sem isto, uma falha transitória deixaria a
    // instância em 503 para sempre — e uma probe que mente para baixo é ignorada como a que
    // mente para cima.
    registrarSucessoDeBoot('migracao-fsrs')
  } catch (err) {
    // P2-5: seguir subindo é a escolha certa (a migração é idempotente e roda de novo no
    // próximo boot), mas o /api/health precisa DENUNCIAR que os dados estão incompletos.
    console.warn('[db] migração Leitner→FSRS falhou (segue sem migrar):', (err as Error)?.message || err)
    registrarFalhaDeBoot('migracao-fsrs', err)
  }
  // Marco 1: carimba linhas legadas (user_id NULL) com o dono local, para o scoping por usuário
  // (Commits 3+) não esconder os dados atuais. Idempotente (nas próximas execuções carimba 0).
  try {
    const { backfillNullOwner } = await import('../db/repositories/tenancy')
    const { donoLocal } = await import('../lib/authContext')
    const carimbados = await backfillNullOwner(donoLocal())
    if (carimbados > 0) console.log(`[db] ${carimbados} linha(s) legada(s) atribuída(s) ao dono local (Marco 1)`)
    registrarSucessoDeBoot('backfill-tenancy')
  } catch (err) {
    // P2-5: linhas com user_id NULL continuam invisíveis ao dono — isso PRECISA aparecer.
    console.warn('[db] backfill de tenancy falhou (segue sem carimbar):', (err as Error)?.message || err)
    registrarFalhaDeBoot('backfill-tenancy', err)
  }
  /* AGREGADOS DIÁRIOS (migração 0053): conta o passado de quem ainda não tem agregados. Depois do
     backfill acima, para as linhas legadas já terem dono. Idempotente, um usuário por transação,
     com teto de usuários e de tempo. Falha aqui NÃO marca o boot: quem ficou sem agregados é
     contado na primeira leitura (`agregadosRepo.garantir`), então nenhuma rota depende deste passo. */
  try {
    const { preencherAgregadosPendentes } = await import('../db/repositories/agregados')
    const { preenchidos, restam } = await preencherAgregadosPendentes()
    if (preenchidos > 0 || restam) {
      console.log(
        `[db] agregados diários contados para ${preenchidos} usuário(s)${restam ? ' (restam outros: entram na primeira leitura de cada um)' : ''}`,
      )
    }
  } catch (err) {
    console.warn('[db] agregados diários não preenchidos no arranque (segue):', (err as Error)?.message || err)
  }
}
