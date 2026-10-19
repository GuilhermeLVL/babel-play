/**
 * O GANCHO DE MEDIÇÃO DO BANCO (Fase 5 de prontidão, 25/09/2026).
 *
 * `db.ts` embrulha o `query` do driver (PGlite ou `pg`) e chama o observador com as instruções e a
 * duração — avulsa ou dentro de `emTransacao`/`emLote`; `server/http/metricas.ts` registra o observador quando as métricas estão ligadas. Módulo
 * próprio, sem dependência nenhuma, porque os dois lados não podem se importar: `metricas.ts`
 * importando `db.ts` abriria o banco em quem só quer contar requisições, e `db.ts` importando
 * `metricas.ts` puxaria o prom-client para todo script que só lê o banco.
 *
 * CUSTO com o observador desligado (o padrão): um `if`. Ligado: um `hrtime` e uma regex na primeira
 * palavra do SQL por instrução — nada perto do custo da própria consulta (1,26 ms fixos por request).
 */
export type TipoDeConsulta = 'leitura' | 'escrita'

export type ObservadorDeConsultas = (o: { instrucoes: string[]; segundos: number }) => void

let observador: ObservadorDeConsultas | undefined

export function registrarObservadorDeConsultas(fn: ObservadorDeConsultas | undefined): void {
  observador = fn
}

type Instrucao = string | { sql: string }

const sqlDe = (i: Instrucao): string => (typeof i === 'string' ? i : String(i?.sql ?? ''))

/**
 * O TAMANHO DO BANCO (`db_tamanho_bytes`, gatilho de 5 GB do ADR 0006), pelo mesmo motivo de morar
 * aqui: `db.ts` registra quem mede (`pg_database_size`), e `metricas.ts` só pergunta. Sem medidor
 * registrado (o banco nunca foi aberto neste processo), a resposta é `undefined`.
 */
let medidorDeTamanho: (() => Promise<number>) | undefined

export function registrarMedidorDeTamanho(fn: (() => Promise<number>) | undefined): void {
  medidorDeTamanho = fn
}

export async function tamanhoDoBanco(): Promise<number | undefined> {
  if (!medidorDeTamanho) return undefined
  try {
    return await medidorDeTamanho()
  } catch {
    return undefined // banco fora do ar: a série some, e o alerta de banco é outro
  }
}

/**
 * Embrulha o `query` do driver. O resultado e o erro passam intactos;
 * a medição acontece nos dois casos (consulta que falha também ocupou o banco).
 */
export function medirConsultas<A extends unknown[], R>(
  original: (...args: A) => Promise<R>,
  instrucoesDe: (...args: A) => Instrucao[],
): (...args: A) => Promise<R> {
  return function medida(this: unknown, ...args: A): Promise<R> {
    const obs = observador
    if (!obs) return original.apply(this, args)
    const inicio = process.hrtime.bigint()
    const registrar = () => {
      try {
        obs({ instrucoes: instrucoesDe(...args).map(sqlDe), segundos: Number(process.hrtime.bigint() - inicio) / 1e9 })
      } catch {
        /* telemetria quebrada não derruba a consulta que ela observa */
      }
    }
    return original.apply(this, args).then(
      (r) => (registrar(), r),
      (err: unknown) => {
        registrar()
        throw err
      },
    )
  }
}
