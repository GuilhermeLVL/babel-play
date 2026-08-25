/**
 * Camada de repositories: as rotas acessam dados SOMENTE por aqui (nunca SQL/driver
 * direto). Isto é o que torna o banco portável (SQLite→Postgres) e, no futuro
 * (`web-foundations`/isomorphic-data-layer), permite um adapter de CLIENTE
 * (IndexedDB/OPFS) para o perfil Grátis/Local rodar sem backend.
 */

/** Interface mínima de um repositório CRUD (adapter de servidor ou de cliente). */
export interface CrudRepository<TRow, TCreate> {
  list(): Promise<TRow[]>
  get(id: string): Promise<TRow | undefined>
  create(input: TCreate): Promise<TRow>
}

export { sessionsRepo } from './sessions'
export type { Session, NewSession } from './sessions'
export { utterancesRepo } from './utterances'
export type { Utterance, NewUtterance } from './utterances'
export { vocabRepo } from './vocab'
export type { VocabCard, NewVocabCard } from './vocab'
export { settingsRepo } from './settings'
export { credentialsRepo } from './credentials'
export type { Credential, NewCredential } from './credentials'
export { subscriptionsRepo } from './subscriptions'
export type { Subscription, Plan, SubStatus, SubscriptionPatch } from './subscriptions'
export { usersRepo } from './users'
export type { User, Role, UserStatus } from './users'
