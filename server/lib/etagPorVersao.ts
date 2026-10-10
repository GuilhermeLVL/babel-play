/**
 * ETAG PELA VERSÃO DOS DADOS — "mudou desde a última vez?" respondido com uma consulta de chave
 * primária, sem montar o corpo (fix/rotas-caras; estendido na auditoria de desempenho do servidor
 * de 10/10/2026).
 *
 * O ETag padrão do Express é um hash do CORPO: para responder 304 o servidor monta a resposta
 * inteira e só então descobre que ela não mudou. Com a versão de `versoes_de_dados` (mantida por
 * gatilho, migração 0032) o 304 sai antes de qualquer leitura das tabelas.
 *
 * O ETag carrega também um resumo do usuário e a ÉPOCA do processo. O primeiro impede que um
 * navegador compartilhado (duas contas no mesmo perfil) revalide a resposta de uma conta com o
 * ETag da outra quando os contadores coincidem; a segunda impede que um banco restaurado de
 * backup (contadores de volta ao passado) case com um ETag emitido antes da restauração.
 *
 * Nasceu em `server/routes/vocab.ts`; mora aqui desde que uma segunda rota passou a usar, para
 * as duas não discordarem sobre o que é "o mesmo ETag".
 */
import { createHash, randomBytes } from 'node:crypto'

const EPOCA = randomBytes(4).toString('hex')

const resumo = (texto: string) => createHash('sha256').update(texto).digest('base64url').slice(0, 12)

/**
 * `W/"<nome>-<época>-<usuário>-<versão>[-<variante>]"`. A `variante` é o que mais muda o corpo
 * além da versão (um filtro da consulta, por exemplo); entra resumida, nunca crua.
 */
export function etagPorVersao(nome: string, userId: string, versao: number | string, variante = ''): string {
  const sufixo = variante ? `-${resumo(variante)}` : ''
  return `W/"${nome}-${EPOCA}-${resumo(userId)}-${versao}${sufixo}"`
}

/** If-None-Match casa? Comparação FRACA (RFC 9110 §13.1.2): o `W/` não conta, `*` casa com tudo. */
export function casaComIfNoneMatch(cabecalho: string | undefined, etag: string): boolean {
  if (!cabecalho) return false
  const semW = (t: string) => t.trim().replace(/^W\//, '')
  return cabecalho.split(',').some((t) => t.trim() === '*' || semW(t) === semW(etag))
}
