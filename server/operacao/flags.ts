/**
 * `operacao.cjs flags …` — as feature flags pela CLI de operação (Fase 6b). Não há tela admin no
 * cliente; a API (`/api/admin/flags`) e esta CLI são as duas portas de escrita.
 *
 *   node dist-server/operacao.cjs flags listar
 *   node dist-server/operacao.cjs flags ligar <chave>
 *   node dist-server/operacao.cjs flags desligar <chave>
 *   node dist-server/operacao.cjs flags definir <chave> '<json>'
 *       <json> = { "descricao"?, "habilitada"?, "regras"?, "payload"? } — merge com a atual, mesma
 *       validação da rota admin (regras e payload de `oferta_planos` pelo zod).
 *
 * A escrita fica registrada com `atualizado_por = 'cli'`. O servidor em execução é OUTRO processo:
 * a mudança aparece para os clientes quando o cache dele vencer (até 30 s, `server/lib/flags.ts`).
 *
 * Separado de `cli.ts` para ser testável: aquele arquivo roda e sai no import.
 */
import { definirFlag, ErroDeFlag, type FlagCrua, listarFlagsCruas } from '../lib/flags'

type Saida = { out: (linha: string) => void; err: (linha: string) => void }

const USO = "uso: operacao.cjs flags listar | ligar <chave> | desligar <chave> | definir <chave> '<json>'"

function linha(f: FlagCrua): string {
  const estado = f.habilitada ? 'LIGADA   ' : 'desligada'
  const regras = Object.keys(f.regras).length ? JSON.stringify(f.regras) : '(sem regras)'
  const payload = f.payload === null ? '' : ' +payload'
  return `${estado}  ${f.chave}  ${regras}${payload}  — ${f.descricao}`
}

/** Executa `flags <sub> …`. Devolve o código de saída (0 ok, 1 falha, 2 uso errado). */
export async function comandoDeFlags(
  args: string[],
  saida: Saida = { out: console.log, err: console.error },
): Promise<number> {
  const [sub, chave, json] = args
  try {
    if (sub === 'listar') {
      for (const f of await listarFlagsCruas()) saida.out(linha(f))
      return 0
    }
    if ((sub === 'ligar' || sub === 'desligar') && chave) {
      const f = await definirFlag(chave, { habilitada: sub === 'ligar' }, 'cli')
      saida.out(linha(f))
      return 0
    }
    if (sub === 'definir' && chave && json) {
      let alt: unknown
      try {
        alt = JSON.parse(json)
      } catch {
        saida.err('json ilegível')
        return 2
      }
      if (!alt || typeof alt !== 'object' || Array.isArray(alt)) {
        saida.err('o json precisa ser um objeto: { descricao?, habilitada?, regras?, payload? }')
        return 2
      }
      const { descricao, habilitada, regras, payload, ...resto } = alt as Record<string, unknown>
      if (Object.keys(resto).length) {
        saida.err(`campos desconhecidos: ${Object.keys(resto).join(', ')}`)
        return 2
      }
      if (descricao !== undefined && typeof descricao !== 'string') {
        saida.err('descricao deve ser texto')
        return 2
      }
      if (habilitada !== undefined && typeof habilitada !== 'boolean') {
        saida.err('habilitada deve ser booleano')
        return 2
      }
      const f = await definirFlag(
        chave,
        { descricao: descricao as string | undefined, habilitada: habilitada as boolean | undefined, regras, payload },
        'cli',
      )
      saida.out(linha(f))
      return 0
    }
  } catch (err) {
    if (err instanceof ErroDeFlag) {
      saida.err(err.message)
      for (const d of err.detalhes ?? []) saida.err(`  ${d}`)
      return 1
    }
    throw err
  }
  saida.err(USO)
  return 2
}
