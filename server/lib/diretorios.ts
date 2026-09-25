/**
 * ONDE ESTE SERVIDOR PODE ESCREVER — uma resposta só, para todo mundo que grava em disco.
 *
 * A regra existia e vivia dentro de `server.ts`, usada só pelo diário de erros. `server/crypto.ts`
 * tinha a sua própria (`process.cwd() + '/data'`), e a divergência não era estética: num deploy
 * com volume em `/data` e o processo rodando em `/app`, o diário ia para o volume e a chave de
 * segredos ia para o sistema de arquivos efêmero do contêiner. No primeiro restart a chave sumia,
 * e com ela a leitura de toda credencial de IA já cifrada (auditoria de 2026-09-07, achado A34).
 *
 * A ordem é a mesma de sempre, agora num lugar só:
 *
 *  1. `DATA_DIR`, quando declarado — é a resposta explícita e vence tudo.
 *  2. O diretório do próprio banco (`DATABASE_URL=file:…`). É o sinal mais confiável disponível:
 *     se o banco escreve ali, o resto também escreve, e os dois viajam juntos quando alguém move
 *     o volume. O `docker-compose.yml` deste projeto passa exatamente isso e não passa `DATA_DIR`.
 *  3. O pai de `AUDIO_DIR`, pelo mesmo raciocínio.
 *  4. `data`, relativo ao `cwd` — o caso do desenvolvimento local.
 */
import path from 'node:path'

export function diretorioGravavel(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR
  const url = process.env.DATABASE_URL ?? ''
  if (url.startsWith('file:')) return path.dirname(url.slice('file:'.length))
  if (process.env.AUDIO_DIR) return path.dirname(process.env.AUDIO_DIR)
  return 'data'
}

/**
 * MULTI-INSTÂNCIA DECLARADA.
 *
 * Não dá para descobrir por conta própria quantas réplicas existem nem se elas veem o mesmo disco
 * — e adivinhar errado é pior que perguntar: um servidor que se acha sozinho guarda estado local e
 * responde diferente conforme a réplica que atendeu. Então quem opera declara, e o boot verifica.
 *
 * `CLUSTER_WORKERS` é outra coisa e continua sendo: são processos do MESMO host, com o MESMO
 * disco. Vários processos não exigem armazenamento compartilhado; várias máquinas exigem.
 */
export function replicasDeclaradas(): number {
  const n = Number(process.env.REPLICAS)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

/** O armazenamento é alcançável por todas as réplicas? S3 configurado, ou declaração explícita. */
export function armazenamentoCompartilhado(): boolean {
  if (process.env.ARMAZENAMENTO_COMPARTILHADO === '1') return true
  // As quatro que `server/lib/armazenamento.ts:184` exige para ligar o seam de S3. Menos que isso
  // e o S3 nao esta ativo, entao dizer que o armazenamento e compartilhado seria falso.
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  )
}

/**
 * A recusa de subir em multi-réplica sem armazenamento e banco alcançáveis por todas.
 *
 * Devolve a mensagem quando a configuração é incoerente, `null` quando está de pé. Separado do
 * `process.exit` para poder ser testado sem derrubar o runner.
 */
export function erroDeMultiReplica(): string | null {
  const replicas = replicasDeclaradas()
  if (replicas <= 1) return null
  if (!armazenamentoCompartilhado())
    return (
      `REPLICAS=${replicas} sem armazenamento compartilhado. Com mais de uma instância, o áudio ` +
      'gravado por uma réplica não existe no disco da outra: o pedido cai em 404 "arquivo ausente" ' +
      'conforme o balanceador. Configure S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY, ou declare ' +
      'ARMAZENAMENTO_COMPARTILHADO=1 se as réplicas montam o MESMO volume.'
    )
  /* O BANCO TAMBÉM PRECISA SER UM SÓ (ADR 0006, auditoria de prontidão). Até aqui a trava só olhava o
     áudio: `REPLICAS=2` com S3 passava no boot, e cada máquina subia com o SEU arquivo SQLite — dois
     bancos divergentes, com rate limit, cotas e orçamento valendo por máquina. Banco em arquivo local
     serve a uma máquina só; várias exigem banco remoto (`DATABASE_URL` libsql/Postgres). */
  if ((process.env.DATABASE_URL ?? 'file:').startsWith('file:')) {
    return (
      `REPLICAS=${replicas} com banco em arquivo local (DATABASE_URL=file:…). Cada réplica teria o seu ` +
      'SQLite: dados, cotas e rate limit divergiriam entre máquinas. Use um banco remoto ou uma réplica só ' +
      '(docs/adr/0006-sqlite-numa-maquina-ate-o-gatilho-de-postgres.md).'
    )
  }
  return null
}
