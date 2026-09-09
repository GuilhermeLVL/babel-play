import { sql } from 'drizzle-orm'
import type { Request, Response } from 'express'

import { db } from '../db/db'
import { migracoesAplicadas } from '../db/manutencao'
import { armazenamentoDoAmbiente, configDoS3 } from '../lib/armazenamento'
import { bootStatus } from '../lib/bootStatus'
import { log } from '../lib/logger'

/**
 * GET /api/health — status do servidor, conectividade do banco e integridade do BOOT.
 *
 * P2-5: migração e backfill do boot falhavam com `console.warn` e o servidor subia assim
 * mesmo, sem nenhum sinal externo. Agora um passo de boot que falhou deixa a probe em 503 —
 * é o que um orquestrador consegue enxergar. Só o NOME do passo é exposto; a mensagem do
 * erro fica no log (não vaza caminho nem detalhe de infra).
 *
 * O CONTRATO DESTA RESPOSTA NÃO MUDOU na Fase 5, e isso é deliberado: ela está congelada em
 * `tests/caracterizacao/__snapshots__/health.get.json` e é o que o `HEALTHCHECK` do `Dockerfile`
 * e o vigia `uptime.yml` já consomem. Quem ganhou campo novo foi o `/api/ready`, abaixo.
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const boot = await bootStatus()
  const bootPayload = boot.ok
    ? { boot: 'ok' as const }
    : { boot: 'degraded' as const, bootErros: boot.erros.map((e) => e.passo) }

  try {
    // P1-N2: era só `SELECT 1`, que funciona com o SCHEMA INTEIRO faltando. Medido na
    // re-auditoria: com a tabela `sessions` ausente, toda escrita devolvia 400 e o health
    // respondia 200 — o orquestrador manteria a réplica quebrada no balanceador.
    // Sondar uma tabela real custa o mesmo e detecta o caso.
    await db.run(sql`SELECT 1 FROM sessions LIMIT 1`)
    if (!boot.ok) {
      res.status(503).json({ status: 'degraded', db: 'up', ...bootPayload, at: Date.now() })
      return
    }
    res.json({ status: 'ok', db: 'up', ...bootPayload, at: Date.now() })
  } catch (err) {
    // Detalhe do erro só no log do servidor — a resposta não vaza caminho/driver do banco.
    // `db: 'down'` cobre os dois casos (inacessível e schema quebrado); distinguir na
    // resposta pública diria a um estranho o que exatamente está faltando.
    // F5-04: pelo logger, para chegar a um sink externo. Banco fora do ar é o evento que mais
    // precisa acordar alguém, e era o que só existia como texto no stdout.
    log('error', {
      event: 'health_db_indisponivel',
      route: '/api/health',
      status: 503,
      error: String(err).slice(0, 300),
    })
    res.status(503).json({ status: 'degraded', db: 'down', ...bootPayload })
  }
}

/**
 * GET /api/ready — a OUTRA pergunta, que o `/api/health` estava respondendo por acidente.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * POR QUE DUAS ROTAS, E NÃO UMA COM MAIS CAMPOS.
 *
 * Elas existem para CONSUMIDORES DIFERENTES, que tomam decisões opostas com a mesma resposta:
 *
 *   `health` (liveness)  — "este processo está vivo e o boot terminou?" Quem lê decide REINICIAR.
 *   `ready`  (readiness) — "este processo consegue ATENDER agora?" Quem lê decide TIRAR DO
 *                          BALANCEADOR, sem matar nada.
 *
 * Juntar as duas força uma escolha errada nos dois sentidos. Uma dependência externa lenta
 * derrubando o `health` faz o orquestrador REINICIAR um processo perfeitamente vivo — e reiniciar
 * não conserta um banco fora do ar, só troca uma instância degradada por uma instância fria, que
 * ainda por cima recomeça o boot. No outro sentido, um `health` que ignora a dependência mantém no
 * balanceador uma réplica que responde 500 em toda rota.
 *
 * É por isso que o contrato do `/api/health` acima ficou intocado: mexer nele mudaria o
 * comportamento de quem já o consome (o `HEALTHCHECK` do `Dockerfile`, que é liveness de verdade).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O QUE ENTRA NO VEREDICTO, e o que fica de fora.
 *
 *   banco          — `SELECT 1` numa tabela REAL (`sessions`), pelo motivo já medido em P1-N2:
 *                    `SELECT 1` puro passa com o schema inteiro faltando.
 *   migrações      — journal x aplicadas (`server/db/manutencao.ts`). É o modo de falha de deploy
 *                    contínuo que `SELECT 1` não vê: código novo sobre banco velho.
 *   boot           — um passo de boot falho já degrada o `health`; aqui ele também impede o ready,
 *                    porque `backfill-tenancy` incompleto significa servir dados incompletos.
 *   armazenamento  — SÓ quando há S3/R2 configurado. Sem ele a mídia é disco local, e disco local
 *                    que sumiu já aparece como falha do processo.
 *
 * PROVEDORES DE IA FICAM DE FORA, e essa é a decisão que mais importa aqui. Groq, Gemini e
 * OpenRouter são terceiros: uma instabilidade lá tiraria TODAS as réplicas do balanceador ao mesmo
 * tempo, transformando "a tradução caiu" em "o site caiu". E o servidor já foi construído para
 * esse caso — `server/ai/mtProxy.ts` tem cascata com reserva, e as rotas respondem 501/502 quando
 * não há provedor. Um recurso degradado tem resposta própria; ele não é motivo para o serviço
 * inteiro sumir.
 *
 * A RESPOSTA NOMEIA A DEPENDÊNCIA, não o erro: `armazenamento: 'indisponivel'` e nunca a URL do
 * endpoint ou a mensagem do driver — a rota é PÚBLICA (montada antes do `authMiddleware`, como o
 * health) e um detalhe de infra aqui é reconhecimento gratuito. A causa vai para o log, correlata
 * pelo `requestId` que o `AsyncLocalStorage` da Fase 5 injeta sozinho.
 */
export async function readyHandler(_req: Request, res: Response): Promise<void> {
  const boot = await bootStatus()

  let banco: 'up' | 'down' = 'down'
  try {
    /* DRIZZLE DIRETO, e a regra `rota-fala-com-o-banco` (audit/rules/ast-grep) pede o motivo
       escrito: `server/db/repositories/` existe para aplicar o `userId`, e esta consulta não tem
       usuário nenhum — ela é sobre o BANCO, não sobre dados de alguém. Passar por um repositório
       aqui acrescentaria a camada que a probe existe para não depender. Mesmo caso, e mesma linha,
       do `healthHandler` acima.
       Tabela REAL e não `SELECT 1` puro: medido em P1-N2, `SELECT 1` passa com o schema inteiro
       faltando, e a probe manteria no balanceador uma réplica que devolve 400 em toda escrita. */
    await db.run(sql`SELECT 1 FROM sessions LIMIT 1`)
    banco = 'up'
  } catch (err) {
    log('error', { event: 'ready_db_indisponivel', route: '/api/ready', status: 503, error: String(err).slice(0, 300) })
  }

  /* Só faz sentido perguntar pelas migrações com o banco de pé: sem ele o veredicto seria
     `atrasadas` por indisponibilidade, e o operador procuraria uma migração que não é o problema. */
  const migracoes = banco === 'up' ? await migracoesAplicadas() : 'desconhecida'

  let armazenamento: 'nao-configurado' | 'ok' | 'indisponivel' = 'nao-configurado'
  if (configDoS3()) {
    try {
      /* O diretório passado é irrelevante e não é usado: com S3 configurado, `armazenamentoDoAmbiente`
         nunca cai no ramo de arquivos. Passá-lo mesmo assim evita duplicar aqui a montagem do
         cliente S3 — a regra de qual armazenamento vale mora num lugar só. */
      await armazenamentoDoAmbiente('').sondar()
      armazenamento = 'ok'
    } catch (err) {
      log('error', {
        event: 'ready_armazenamento_indisponivel',
        route: '/api/ready',
        status: 503,
        error: String(err).slice(0, 300),
      })
      armazenamento = 'indisponivel'
    }
  }

  /* `desconhecida` NÃO reprova — ver `migracoesAplicadas`: é a réplica legítima que serve sem a
     pasta de migrações no disco (achado P1-N1). Reprovar ali tiraria do balanceador uma instância
     que atende. */
  const pronto = banco === 'up' && boot.ok && migracoes !== 'atrasadas' && armazenamento !== 'indisponivel'

  res.status(pronto ? 200 : 503).json({
    status: pronto ? 'pronto' : 'indisponivel',
    db: banco,
    migracoes,
    boot: boot.ok ? 'ok' : 'degraded',
    /* O NOME do passo, como no health: é o suficiente para o operador saber onde olhar, e não
       carrega mensagem de erro nenhuma. */
    ...(boot.ok ? {} : { bootErros: boot.erros.map((e) => e.passo) }),
    armazenamento,
    at: Date.now(),
  })
}
