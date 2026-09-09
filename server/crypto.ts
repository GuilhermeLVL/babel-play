/**
 * Cifra de segredos em repouso (AES-256-GCM) — substitui o `safeStorage`/DPAPI do
 * desktop. Formato do blob: `iv.tag.ciphertext` (base64), tudo junto.
 *
 * ORIGEM DA CHAVE (achado da auditoria — o fallback hardcoded antigo tornava os
 * segredos efetivamente públicos se `SECRET_KEY` faltasse em produção):
 *   1. `SECRET_KEY` no env, quando definida (recomendado em produção; OBRIGATÓRIA lá).
 *   2. Local/dev: chave aleatória gerada na 1ª execução e persistida em `data/secret.key`
 *      (fora do git — `data/` já é ignorado). Estável entre restarts; por máquina.
 *   3. `NODE_ENV=production` sem `SECRET_KEY` → aborta com instrução clara, em vez de
 *      cifrar com chave adivinhável.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { diretorioGravavel } from './lib/diretorios'

/**
 * ONDE A CHAVE MORA — no diretorio gravavel do deploy, nao no `cwd` do processo.
 *
 * `path.join(process.cwd(), 'data', 'secret.key')` era o caminho antigo, e ele so coincide com o
 * volume por acaso. No `docker-compose.yml` deste projeto o processo roda em `/app` e o volume
 * esta em `/data`: a chave nascia no sistema de arquivos EFEMERO do conteiner e sumia no primeiro
 * restart, levando junto a leitura de toda credencial de IA ja cifrada (achado A34). Com duas
 * replicas o estrago e imediato: cada uma gera a sua e nenhuma le os segredos da outra.
 */
function arquivoDaChave(): string {
  return path.join(diretorioGravavel(), 'secret.key')
}

/** O caminho ANTIGO, so para ler. Ver `resolveRawKey`. */
function arquivoLegadoDaChave(): string {
  return path.join(process.cwd(), 'data', 'secret.key')
}

function resolveRawKey(): string {
  const fromEnv = process.env.SECRET_KEY?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECRET_KEY ausente em produção. Defina a variável de ambiente SECRET_KEY (32+ chars aleatórios) — ' +
      'sem ela os segredos cifrados não podem ser protegidos.',
    )
  }
  const arquivo = arquivoDaChave()
  try {
    if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim()

    /* MIGRACAO SILENCIOSA DO CAMINHO ANTIGO. Uma instalacao existente ja tem a chave em
       `<cwd>/data/secret.key` e segredos cifrados com ela. Gerar uma nova aqui tornaria esses
       segredos ilegiveis para sempre — a correcao do caminho nao pode custar os dados de quem ja
       usava. Le a antiga, copia para o lugar certo, e segue com a MESMA chave. */
    const legado = arquivoLegadoDaChave()
    if (legado !== arquivo && existsSync(legado)) {
      const anterior = readFileSync(legado, 'utf8').trim()
      try {
        mkdirSync(path.dirname(arquivo), { recursive: true })
        writeFileSync(arquivo, anterior, { encoding: 'utf8' })
        console.log(`[crypto] chave de segredos movida de ${legado} para ${arquivo} (mesma chave, segredos preservados)`)
      } catch {
        // Sem permissao no destino: seguir com a chave antiga e melhor que abortar o boot.
        console.warn(`[crypto] não consegui copiar a chave para ${arquivo}; seguindo com ${legado}`)
      }
      return anterior
    }

    mkdirSync(path.dirname(arquivo), { recursive: true })
    const fresh = randomBytes(32).toString('hex')
    writeFileSync(arquivo, fresh, { encoding: 'utf8' })
    console.log(`[crypto] chave local de segredos gerada em ${arquivo} (1ª execução)`)
    return fresh
  } catch (err) {
    throw new Error(`não consegui criar/ler ${arquivo}: ${String((err as Error)?.message || err)}`)
  }
}

const KEY = scryptSync(resolveRawKey(), 'babel-play-web:secrets', 32)

/**
 * CHAVE DERIVADA PARA HASH — não para cifra.
 *
 * Sal diferente do da `KEY` de propósito: quem obtiver este valor não obtém a chave que decifra
 * os segredos guardados. Existe para dar a um hash de uso interno algo que não esteja no
 * código-fonte — hoje, o hash da origem de um envio ao ranking (`repositories/rank.ts`), que
 * substituiu o IP em claro que a versão Cloudflare gravava.
 */
export const CHAVE_DE_HASH: string = scryptSync(resolveRawKey(), 'babel-play-web:hash', 32).toString('hex')

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.')
}

// Chave do fallback antigo — só para LER segredos cifrados antes desta correção.
// Nunca é usada para cifrar de novo.
const LEGACY_KEY = scryptSync('dev-only-insecure-key-change-me', 'babel-play-web:secrets', 32)

function decryptWith(key: Buffer, ivB: string, tagB: string, encB: string): string {
  // authTagLength explícito (achado Semgrep gcm-no-tag-length): sem ele, um tag truncado
  // de 4 bytes seria aceito, enfraquecendo a autenticação do GCM.
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'), { authTagLength: 16 })
  const tag = Buffer.from(tagB, 'base64')
  if (tag.length !== 16) throw new Error('segredo malformado (tag)')
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * Decifra e sinaliza migração (S-11). Se o blob estava cifrado com a `LEGACY_KEY`, devolve também um
 * `migratedBlob` re-cifrado com a KEY atual — o caller (repo) persiste, migrando no PRIMEIRO uso em
 * vez de esperar o usuário reeditar a credencial (o que podia nunca acontecer, deixando o segredo
 * decifrável por quem tivesse o banco, já que a LEGACY_KEY está no código-fonte).
 */
export function decryptSecretEx(blob: string): { value: string; migratedBlob: string | null } {
  const [ivB, tagB, encB] = blob.split('.')
  if (!ivB || !tagB || !encB) throw new Error('segredo malformado')
  try {
    return { value: decryptWith(KEY, ivB, tagB, encB), migratedBlob: null }
  } catch {
    const value = decryptWith(LEGACY_KEY, ivB, tagB, encB)
    return { value, migratedBlob: encryptSecret(value) }
  }
}

export function decryptSecret(blob: string): string {
  return decryptSecretEx(blob).value
}
