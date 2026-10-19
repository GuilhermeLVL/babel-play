/**
 * PARIDADE POR CHECKSUM entre a origem (SQLite) e o destino (Postgres) da migração de dados (Fase 1,
 * Tarefa 8). Função pura: recebe as linhas já lidas e devolve um sha256.
 *
 * Os dois drivers devolvem o mesmo dado com tipos diferentes, então cada valor passa por uma forma
 * canônica antes do hash:
 *  - inteiro e float: `Number.prototype.toString()` (inteiro sai em decimal; o float, na representação
 *    mais curta que volta ao mesmo double, igual dos dois lados);
 *  - `bigint` (int8 fora do intervalo seguro): decimal;
 *  - `boolean`: `0`/`1` — que é como o SQLite guarda, então `true` e `1` dão o mesmo texto;
 *  - `null`/`undefined`: `null`; texto como veio.
 * Consequência: o checksum NÃO distingue o texto "7" do número 7 (nem `true` de 1). Não importa aqui porque
 * o tipo de cada coluna é fixo pelo schema dos dois lados, mas não use esta função para comparar tipos.
 * As linhas são ordenadas pela chave primária (composta: na ordem das colunas) e cada uma é serializada
 * com as chaves em ordem alfabética, para a ordem de leitura e a ordem das colunas não importarem.
 */
import { createHash } from 'node:crypto';

type Normalizado = string | null;

function normalizar(v: unknown): Normalizado {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number' || typeof v === 'bigint') return v.toString();
  if (typeof v === 'string') return v;
  throw new Error(`paridade: valor de tipo não suportado (${Object.prototype.toString.call(v)})`);
}

function comparar(a: Normalizado[], b: Normalizado[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** sha256 hex das linhas, ordenadas por `chavePrimaria` e normalizadas (ver o cabeçalho). */
export function checksumDaTabela(linhas: Record<string, unknown>[], chavePrimaria: readonly string[] = ['id']): string {
  const ordenadas = linhas
    .map((linha) => {
      const colunas = Object.keys(linha).sort();
      return {
        chave: chavePrimaria.map((c) => normalizar(linha[c])),
        texto: JSON.stringify(colunas.map((c) => [c, normalizar(linha[c])])),
      };
    })
    .sort((a, b) => comparar(a.chave, b.chave) || (a.texto < b.texto ? -1 : a.texto > b.texto ? 1 : 0));
  const hash = createHash('sha256');
  for (const l of ordenadas) hash.update(l.texto + '\n');
  return hash.digest('hex');
}
