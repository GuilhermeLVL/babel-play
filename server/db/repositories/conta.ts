/**
 * A CONTA INTEIRA — exportação e exclusão (LGPD art. 18, F5-03 da auditoria).
 *
 * Os demais repositórios respondem "os dados DESTE domínio"; este responde "TODOS os dados desta
 * pessoa", que é a pergunta que a LGPD faz. Por isso ele é o único que enxerga o schema inteiro:
 * uma tabela esquecida aqui é dado do titular que sobrevive a um pedido de exclusão.
 *
 * `profiles` entra apenas pelas linhas do usuário — as builtin têm `user_id` NULL e são globais
 * (mesma exceção documentada em `tenancy.ts`); um filtro por `user_id` já as preserva.
 */
import { eq, inArray, is, getTableColumns } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { db } from '../db'
import * as schema from '../schema'
import {
  ankiDecks,
  ankiImports,
  ankiNotes,
  billingEvents,
  creditPurchases,
  creditSpends,
  exerciseResults,
  presencas,
  providerCredentials,
  reviewLogs,
  secrets,
  seedCredits,
  seedSpends,
  sessions,
  settings,
  subscriptions,
  usageCounters,
  userInterests,
  users,
  utterances,
  vocabCards,
  vocabOccurrences,
} from '../schema'
import type { UserId } from '../../lib/authContext'

/**
 * Toda tabela com `user_id` do titular. `secrets` e `users` são tratadas à parte (chave própria).
 *
 * A ORDEM É FILHO ANTES DE PAI, e agora ela é obrigatória: com as FOREIGN KEY declaradas (F0-04),
 * o DELETE de `sessions` antes do de `utterances` viola a constraint e o `batch` inteiro sobe erro.
 * `memoryEmbeddings` saiu da lista junto com a tabela (F1-05), e `analyses`, `profiles`,
 * `ankiMedia` e `ankiNoteMedia` saíram pelo mesmo motivo na 0026.
 *
 * A LISTA CONTINUA ESCRITA À MÃO — a ordem de FK não se deduz do schema sem um grafo — mas deixou
 * de ser a única fonte: `conferirCobertura()` abaixo compara com o schema no carregamento do
 * módulo e `tests/integration/tabelas-do-titular.test.ts` faz o mesmo no CI. A auditoria de
 * 2026-09-07 (achado A06) encontrou SEIS tabelas com `user_id` fora daqui (`seed_credits`,
 * `credit_purchases`, `credit_spends`, `presencas`, `anki_media`, `anki_note_media`): créditos,
 * presenças e mídia do baralho sobreviviam a `DELETE /api/me`, e a exportação não os mostrava.
 * Uma lista à mão sem conferência é exatamente como isso acontece de novo.
 */
const TABELAS_DO_TITULAR: ReadonlyArray<readonly [string, any]> = [
  ['vocabOccurrences', vocabOccurrences],
  ['reviewLogs', reviewLogs],
  ['exerciseResults', exerciseResults],
  ['utterances', utterances],
  /* O ACERVO ANKI ENTRA AQUI, E ANTES DE `vocabCards` — não é ordem alfabética, é a FOREIGN KEY.
     `anki_notes.projected_card_id` referencia `vocab_cards`, e com `foreign_keys = ON` apagar o
     cartão antes da nota derruba o `batch` INTEIRO: o pedido de exclusão falharia com erro de
     constraint, e a promessa da LGPD viraria a mesma promessa não cumprida que este arquivo
     existe para consertar. Esquecer as três tabelas seria pior ainda em silêncio — o baralho
     importado (com o conteúdo que a pessoa escolheu trazer) sobreviveria ao pedido de eliminação. */
  ['ankiNotes', ankiNotes],
  ['ankiImports', ankiImports],
  ['ankiDecks', ankiDecks],
  ['vocabCards', vocabCards],
  ['sessions', sessions],
  ['settings', settings],
  ['userInterests', userInterests],
  // Antes de `secrets` (apagada fora do laço): é a filha de `secret_ref`.
  ['providerCredentials', providerCredentials],
  // Os dois lados de cada moeda: sem FK entre si, mas são dado do titular como qualquer outro.
  ['seedSpends', seedSpends],
  ['seedCredits', seedCredits],
  ['creditPurchases', creditPurchases],
  ['creditSpends', creditSpends],
  ['presencas', presencas],
  ['subscriptions', subscriptions],
  /* Eventos de cobrança apontam para o titular quando o provedor identifica o pagador. São
     auditoria, mas auditoria COM o id da pessoa — e o pedido de eliminação alcança isso também. A
     idempotência do webhook não sofre: o evento de uma conta apagada não tem mais a quem promover. */
  ['billingEvents', billingEvents],
  ['usageCounters', usageCounters],
]

/** Os nomes, para o teste de invariante e para quem precise listar sem tocar nas tabelas. */
export const NOMES_DAS_TABELAS_DO_TITULAR: readonly string[] = TABELAS_DO_TITULAR.map(([n]) => n)

/**
 * Tabelas com `user_id` que a exclusão trata FORA do laço, com chave própria: `secrets` é
 * alcançada pela `secret_ref` das credenciais E pelo `user_id` (ver `refsDeSegredo`), e apagada
 * depois de `providerCredentials` por causa da FOREIGN KEY.
 */
export const TABELAS_TRATADAS_A_PARTE: readonly string[] = ['secrets']

/**
 * Falha ALTO no carregamento se o schema tiver tabela com `user_id` fora da lista. Melhor um
 * servidor que não sobe com o nome da tabela no erro do que uma exclusão que "funciona" e deixa
 * a tabela nova para trás.
 */
function conferirCobertura(): void {
  const noSchema = Object.entries(schema)
    .filter(([, v]) => is(v, SQLiteTable))
    .filter(([, t]) => 'userId' in getTableColumns(t as SQLiteTable))
    .map(([nome]) => nome)
  const faltando = noSchema.filter(
    (n) => !NOMES_DAS_TABELAS_DO_TITULAR.includes(n) && !TABELAS_TRATADAS_A_PARTE.includes(n),
  )
  if (faltando.length) {
    throw new Error(`conta.ts: tabelas com user_id fora de TABELAS_DO_TITULAR: ${faltando.join(', ')}`)
  }
}
conferirCobertura()

/**
 * O rate limit grava em `usage_counters` com o prefixo `u:` (`server/lib/rateLimitStore.ts`),
 * fora do `WHERE user_id = ?` comum. É pouco dado, mas é dado do titular — e ficava para trás.
 */
function chavesDoTitular(nome: string, userId: UserId): string[] {
  return nome === 'usageCounters' ? [userId, `u:${userId}`] : [userId]
}

type Instrucao = Parameters<typeof db.batch>[0][number]

export interface ExportacaoDaConta {
  /** Versão do formato do arquivo. Muda quando a forma do JSON mudar. */
  formato: number
  exportadoEm: number
  userId: string
  usuario: Record<string, unknown> | null
  /** Uma chave por tabela, com as linhas cruas (inclusive as soft-deletadas, que ainda existem). */
  dados: Record<string, unknown[]>
  /** Nomes dos arquivos de áudio referenciados pelas sessões (o binário não vai no JSON). */
  arquivosDeMidia: string[]
}

export interface RelatorioDeExclusao {
  linhasPorTabela: Record<string, number>
  totalDeLinhas: number
}

/**
 * Só o METADADO da credencial. A lista de campos é explícita (e não um spread com omissão) para
 * que uma coluna nova no schema não entre na exportação por acidente.
 */
function credencialSemSegredo(c: typeof providerCredentials.$inferSelect) {
  return {
    id: c.id,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    label: c.label,
    kind: c.kind,
    baseUrl: c.baseUrl,
    defaultModel: c.defaultModel,
    temSegredo: !!c.secretRef,
  }
}

/**
 * As `ref` de segredo do titular, incluindo as de credenciais já soft-deletadas (o segredo
 * continua lá). Duas fontes: a `secret_ref` da credencial e — desde F3-04 — o `secrets.user_id`,
 * que alcança o segredo cuja credencial já foi apagada fisicamente e que antes ficava órfão e
 * inalcançável para sempre.
 */
async function refsDeSegredo(userId: UserId): Promise<string[]> {
  const [porCredencial, porDono] = await Promise.all([
    db
      .select({ ref: providerCredentials.secretRef })
      .from(providerCredentials)
      .where(eq(providerCredentials.userId, userId)),
    db.select({ ref: secrets.ref }).from(secrets).where(eq(secrets.userId, userId)),
  ])
  return [...new Set([...porCredencial, ...porDono].map((l) => l.ref).filter((r): r is string => !!r))]
}

function arquivosEmMeta(linhas: { meta: string | null }[]): string[] {
  const nomes: string[] = []
  for (const s of linhas) {
    if (!s.meta) continue
    try {
      const m = JSON.parse(s.meta) as Record<string, unknown>
      if (typeof m.audioFile === 'string' && m.audioFile) nomes.push(m.audioFile)
    } catch {
      /* meta ilegível não pode impedir a exclusão do resto da conta */
    }
  }
  return [...new Set(nomes)]
}

export const contaRepo = {
  /**
   * Os arquivos de mídia do titular. Sem filtro de `deleted_at`: uma sessão soft-deletada cujo
   * arquivo resistiu à remoção (P1-9) ainda tem o áudio no disco, e ele é dado do titular.
   */
  async midia(userId: UserId): Promise<string[]> {
    const linhas = await db.select({ meta: sessions.meta }).from(sessions).where(eq(sessions.userId, userId))
    return arquivosEmMeta(linhas)
  },

  /**
   * Tudo o que o sistema guarda sobre o titular, em JSON.
   *
   * Segredos saem como METADADO: `value_encrypted` nunca é selecionado, então o valor (cifrado ou
   * decifrado) não tem como sair por aqui nem por engano — exportar uma chave de API por um
   * endpoint de leitura seria o mesmo vazamento que o proxy existe para impedir (S-01).
   */
  async exportar(userId: UserId): Promise<ExportacaoDaConta> {
    const dados: Record<string, unknown[]> = {}
    for (const [nome, tabela] of TABELAS_DO_TITULAR) {
      const linhas = await db
        .select()
        .from(tabela)
        .where(inArray(tabela.userId, chavesDoTitular(nome, userId)))
      /* `TABELAS_DO_TITULAR` é heterogênea, então `linhas` chega como a união das linhas de todas
         as tabelas; dentro do ramo já sabemos QUAL tabela é, e o cast só diz isso ao compilador. */
      dados[nome] =
        nome === 'providerCredentials'
          ? (linhas as (typeof providerCredentials.$inferSelect)[]).map(credencialSemSegredo)
          : linhas
    }

    const refs = await refsDeSegredo(userId)
    dados.secrets = refs.length
      ? (
          await db
            .select({ ref: secrets.ref, createdAt: secrets.createdAt, updatedAt: secrets.updatedAt })
            .from(secrets)
            .where(inArray(secrets.ref, refs))
        ).map((s) => ({ ...s, temValor: true }))
      : []

    const conta = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    return {
      formato: 1,
      exportadoEm: Date.now(),
      userId,
      usuario: conta[0] ?? null,
      dados,
      arquivosDeMidia: arquivosEmMeta((dados.sessions ?? []) as { meta: string | null }[]),
    }
  },

  /**
   * Apaga a conta. DELETE FÍSICO em todas as tabelas — não soft delete.
   *
   * Soft delete é o mecanismo de sync do projeto, não de exclusão: uma linha com `deleted_at`
   * continua com o texto, o áudio transcrito e o e-mail da pessoa dentro do banco. Para um pedido
   * de eliminação (LGPD art. 18, VI) isso é a mesma promessa não cumprida do P1-9 — confirmar o
   * que não aconteceu.
   *
   * As refs de segredo são coletadas ANTES, e tudo vai num `batch` (atômico, mesma conexão — ver
   * `db.ts`), com os filhos antes dos pais para não esbarrar nas FOREIGN KEY.
   *
   * A contagem é feita por SELECT antes do DELETE, e não pelo `rowsAffected` do driver, pelo mesmo
   * motivo de `backfillNullOwner`: o relatório do que foi apagado não pode depender do driver.
   */
  async excluir(userId: UserId): Promise<RelatorioDeExclusao> {
    const refs = await refsDeSegredo(userId)
    const linhasPorTabela: Record<string, number> = {}
    const instrucoes: Instrucao[] = []

    for (const [nome, tabela] of TABELAS_DO_TITULAR) {
      const chaves = chavesDoTitular(nome, userId)
      const linhas = await db.select({ id: tabela.id }).from(tabela).where(inArray(tabela.userId, chaves))
      linhasPorTabela[nome] = linhas.length
      if (linhas.length) instrucoes.push(db.delete(tabela).where(inArray(tabela.userId, chaves)))
    }

    const segredos = refs.length
      ? await db.select({ ref: secrets.ref }).from(secrets).where(inArray(secrets.ref, refs))
      : []
    linhasPorTabela.secrets = segredos.length
    if (segredos.length) instrucoes.push(db.delete(secrets).where(inArray(secrets.ref, refs)))

    const conta = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
    linhasPorTabela.users = conta.length
    if (conta.length) instrucoes.push(db.delete(users).where(eq(users.id, userId)))

    if (instrucoes.length) await db.batch(instrucoes as [Instrucao, ...Instrucao[]])

    return {
      linhasPorTabela,
      totalDeLinhas: Object.values(linhasPorTabela).reduce((a, b) => a + b, 0),
    }
  },
}
