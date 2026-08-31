/**
 * RESUMO DO DONO — os números agregados que não existiam (E4).
 *
 * Tudo no banco era POR USUÁRIO (quotas, métricas de aprendizado); "quantos usuários", "quantas
 * capturas nesta semana" não tinha resposta em lugar nenhum — a decisão do plano intermediário
 * teria sido tomada às cegas, e o lançamento seria acompanhado por achismo.
 *
 * Aqui NÃO é analytics de produto: são contagens das tabelas que já existem, sem evento novo, sem
 * SDK, sem coleta além do que a aplicação já grava para funcionar. A postura de privacidade
 * documentada em `Settings.tsx` ("não existe telemetria") segue verdadeira — e citável na política
 * de privacidade.
 *
 * Vive num repository porque rota não fala com o banco (regra `rota-fala-com-o-banco`).
 */
import { count, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { sessions, users, utterances, vocabCards } from '../schema'

export interface ResumoDoDono {
  usuarios: number
  usuariosNovos7d: number
  sessoes: number
  sessoes7d: number
  falas: number
  cartoesDeVocabulario: number
  geradoEm: number
}

export async function resumoDoDono(): Promise<ResumoDoDono> {
  const seteDiasAtras = Date.now() - 7 * 86_400_000
  const [
    [{ n: usuarios }],
    [{ n: usuariosNovos7d }],
    [{ n: sessoes }],
    [{ n: sessoes7d }],
    [{ n: falas }],
    [{ n: cartoes }],
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, seteDiasAtras)),
    db.select({ n: count() }).from(sessions),
    db.select({ n: count() }).from(sessions).where(gte(sql`coalesce(${sessions.startedAt}, 0)`, seteDiasAtras)),
    db.select({ n: count() }).from(utterances),
    db.select({ n: count() }).from(vocabCards),
  ])
  return {
    usuarios,
    usuariosNovos7d,
    sessoes,
    sessoes7d,
    falas,
    cartoesDeVocabulario: cartoes,
    geradoEm: Date.now(),
  }
}
