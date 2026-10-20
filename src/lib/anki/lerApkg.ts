/**
 * LER UM `.apkg` NO NAVEGADOR — o par de `server/import/anki.ts` (`lerApkg`), com as MESMAS consultas e
 * fallbacks, trocando o motor: zip por `fflate` (com teto, `zipComTeto.ts`), zstd por `fzstd` e SQLite por
 * `sql.js`. Por que a leitura tem tantas voltas (três formatos de coleção, nomes de campo em dois lugares)
 * está no cabeçalho daquele arquivo.
 *
 * OS DOIS ESTÁGIOS DO TETO. O `collection.anki21b` é zstd DENTRO do zip: o teto do zip limita o payload
 * comprimido, não o SQLite. Zstd chega a razões maiores que deflate, então a saída do zstd é contada de
 * novo contra o mesmo teto, em fluxo (os frames do Anki não declaram o tamanho de saída). Passar do teto
 * em qualquer estágio lança `ExpansaoAcimaDoTeto`.
 */
import { Decompress } from 'fzstd';
import type { BindParams, Database, SqlValue } from 'sql.js';

import { type LeituraAnki, montarNota, type NotaAnki, TETO_DE_NOTAS } from '../../core/anki';
import { ExpansaoAcimaDoTeto, extrairDoZip, juntarPedacos } from '../zip/zipComTeto';
import type { AbrirSqlite } from './sqlite';

/** 300 MB: folgado para um baralho real e ainda cabe na memória de uma aba de celular. */
export const TETO_DE_EXPANSAO = 300 * 1024 * 1024;

export interface ProgressoDaLeitura {
  etapa: 'abrindo' | 'descomprimindo' | 'lendo';
  notas?: number;
  total?: number;
}

/** Ordem de preferência: o mais novo primeiro, porque é o que traz o baralho completo. */
const COLECOES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];

/** Separador de campos (e, no esquema novo, dos níveis do nome de baralho). */
const SEP = '\x1f';

/** A cada quantas notas a leitura avisa o progresso. */
const PASSO_DO_PROGRESSO = 1000;

/** Fatia empurrada no `fzstd`: limita quanto sai de uma vez antes de a contagem do teto olhar. */
const FATIA_ZSTD = 64 * 1024;

type Linha = Record<string, SqlValue>;

/**
 * `deps.teto` existe SÓ para os testes exercitarem o teto com um arquivo pequeno; o app usa o padrão
 * (`TETO_DE_EXPANSAO`).
 */
export async function lerApkg(
  arquivo: Blob,
  deps: { abrirSqlite: AbrirSqlite; aoProgredir?: (p: ProgressoDaLeitura) => void; teto?: number },
): Promise<LeituraAnki> {
  const teto = deps.teto ?? TETO_DE_EXPANSAO;
  const avisar = deps.aoProgredir ?? (() => {});

  avisar({ etapa: 'abrindo' });
  let zip: Awaited<ReturnType<typeof extrairDoZip>>;
  try {
    zip = await extrairDoZip(arquivo, COLECOES, teto);
  } catch (e) {
    if (e instanceof ExpansaoAcimaDoTeto) throw e;
    throw new Error('não consegui abrir este .apkg (não é um zip válido)', { cause: e });
  }
  const formato = COLECOES.find((nome) => zip.entradas.has(nome));
  if (!formato) throw new Error('não encontrei a coleção dentro do .apkg (collection.anki2/21/21b)');
  const temMidia = zip.nomes.some((n) => /^\d+$/.test(n));

  const db = await abrirColecao(zip.entradas, formato, teto, deps.abrirSqlite, avisar);
  try {
    return lerColecao(db, formato, temMidia, avisar);
  } finally {
    db.close();
  }
}

/**
 * Abre a coleção no `sql.js` (e esvazia `entradas`). Os bytes ficam presos ao escopo desta função de propósito: o `sql.js` copia
 * tudo para a memória do WASM, e assim a nossa cópia fica inalcançável antes das consultas, em vez de
 * dobrar o pico de memória durante a leitura inteira.
 */
async function abrirColecao(
  entradas: Map<string, Uint8Array>,
  formato: string,
  teto: number,
  abrirSqlite: AbrirSqlite,
  avisar: (p: ProgressoDaLeitura) => void,
): Promise<Database> {
  let bytes = entradas.get(formato)!;
  entradas.clear();
  if (formato === 'collection.anki21b') {
    avisar({ etapa: 'descomprimindo' });
    bytes = descomprimirZstd(bytes, formato, teto);
  }
  const SQL = await abrirSqlite();
  return new SQL.Database(bytes);
}

/** Zstd em fluxo, contando a saída contra o teto (o segundo estágio — ver o cabeçalho). */
function descomprimirZstd(comprimido: Uint8Array, nome: string, teto: number): Uint8Array {
  const pedacos: Uint8Array[] = [];
  let total = 0;
  const zstd = new Decompress((pedaco) => {
    total += pedaco.length;
    if (total > teto) {
      pedacos.length = 0;
      throw new ExpansaoAcimaDoTeto(nome, teto);
    }
    if (pedaco.length) pedacos.push(pedaco);
  });
  if (!comprimido.length) zstd.push(comprimido, true);
  for (let i = 0; i < comprimido.length; i += FATIA_ZSTD) {
    zstd.push(comprimido.subarray(i, i + FATIA_ZSTD), i + FATIA_ZSTD >= comprimido.length);
  }
  return juntarPedacos(pedacos);
}

/** Todas as linhas de uma consulta, como objetos coluna → valor. */
function consultar(db: Database, sql: string, params?: BindParams): Linha[] {
  const stmt = db.prepare(sql, params);
  try {
    const linhas: Linha[] = [];
    while (stmt.step()) linhas.push(stmt.getAsObject());
    return linhas;
  } finally {
    stmt.free();
  }
}

/** Consulta que pode falhar porque a tabela não existe nesse formato de coleção: falha vira `[]`. */
function consultarSePuder(db: Database, sql: string): Linha[] {
  try {
    return consultar(db, sql);
  } catch {
    return [];
  }
}

/** O JSON de uma coluna de `col` (`models`, `decks`), ou `undefined` se não houver ou não for JSON. */
function jsonDeCol<T>(db: Database, coluna: 'models' | 'decks'): T | undefined {
  try {
    const bruto = String(consultar(db, `SELECT ${coluna} FROM col LIMIT 1`)[0]?.[coluna] ?? '');
    return bruto ? (JSON.parse(bruto) as T) : undefined;
  } catch {
    return undefined;
  }
}

function lerColecao(
  db: Database,
  formato: string,
  temMidia: boolean,
  avisar: (p: ProgressoDaLeitura) => void,
): LeituraAnki {
  // ── Nomes dos campos, por modelo de nota: tabela `fields` (novo) ou JSON de `col.models` (antigo) ──
  const camposPorModelo = new Map<string, string[]>();
  for (const linha of consultarSePuder(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')) {
    const mid = String(linha.ntid);
    const lista = camposPorModelo.get(mid) ?? [];
    lista[Number(linha.ord)] = String(linha.name ?? '');
    camposPorModelo.set(mid, lista);
  }
  if (!camposPorModelo.size) {
    const modelos = jsonDeCol<Record<string, { flds?: Array<{ name?: string; ord?: number }> }>>(db, 'models');
    for (const [mid, m] of Object.entries(modelos ?? {})) {
      const lista: string[] = [];
      for (const f of m.flds ?? []) lista[f.ord ?? lista.length] = String(f.name ?? '');
      camposPorModelo.set(mid, lista);
    }
  }

  // ── Nome do note type, por modelo ──
  const nomePorModelo = new Map<string, string>();
  for (const linha of consultarSePuder(db, 'SELECT id, name FROM notetypes'))
    nomePorModelo.set(String(linha.id), String(linha.name ?? ''));
  if (!nomePorModelo.size) {
    const modelos = jsonDeCol<Record<string, { name?: string }>>(db, 'models');
    for (const [mid, m] of Object.entries(modelos ?? {})) nomePorModelo.set(mid, String(m.name ?? ''));
  }

  /* O esquema novo às vezes guarda a hierarquia do baralho com `\x1f` em vez de `::`: os dois viram
     `::`, senão o mesmo baralho escrito por versões diferentes do Anki pareceria dois. */
  const normalizarNomeBaralho = (s: string) => s.split(SEP).join('::');

  // ── Nome do baralho, por id ──
  const nomePorBaralho = new Map<string, string>();
  for (const linha of consultarSePuder(db, 'SELECT id, name FROM decks'))
    nomePorBaralho.set(String(linha.id), normalizarNomeBaralho(String(linha.name ?? '')));
  if (!nomePorBaralho.size) {
    const decks = jsonDeCol<Record<string, { name?: string }>>(db, 'decks');
    for (const [did, d] of Object.entries(decks ?? {}))
      nomePorBaralho.set(did, normalizarNomeBaralho(String(d.name ?? '')));
  }

  /* Nota → baralho pelo PRIMEIRO cartão (menor `ord`): a mesma nota pode ter cartões em decks
     diferentes, e um só precisa vencer. */
  const baralhoIdPorNota = new Map<string, string>();
  for (const linha of consultarSePuder(db, 'SELECT nid, did FROM cards ORDER BY nid, ord')) {
    const nid = String(linha.nid);
    if (!baralhoIdPorNota.has(nid)) baralhoIdPorNota.set(nid, String(linha.did));
  }

  // ── As notas, com TETO (`TETO_DE_NOTAS`); o count separado é o que permite avisar "truncado". ──
  const totalNoArquivo = Number(consultar(db, 'SELECT count(*) c FROM notes')[0]?.c ?? 0);
  const truncado = totalNoArquivo > TETO_DE_NOTAS;
  const total = Math.min(totalNoArquivo, TETO_DE_NOTAS);
  avisar({ etapa: 'lendo', notas: 0, total });

  /* `guid` é o id estável da nota (reimportar atualiza em vez de duplicar). A coluna pode não existir
     num arquivo de ferramenta de terceiro: aí a nota sai com guid vazio em vez de o import morrer. */
  let stmt;
  try {
    stmt = db.prepare('SELECT id, guid, mid, flds, tags FROM notes LIMIT ?', [TETO_DE_NOTAS]);
  } catch (e) {
    if (!/no such column: guid/i.test(String(e))) throw e;
    stmt = db.prepare("SELECT id, '' AS guid, mid, flds, tags FROM notes LIMIT ?", [TETO_DE_NOTAS]);
  }

  const notas: NotaAnki[] = [];
  let descartadas = 0;
  let lidas = 0;
  let camposVistos: string[] = [];
  const baralhosVistos = new Set<string>();
  try {
    while (stmt.step()) {
      const linha = stmt.getAsObject();
      const nomes = camposPorModelo.get(String(linha.mid)) ?? [];
      if (nomes.length && !camposVistos.length) camposVistos = nomes.filter(Boolean);

      const baralhoId = baralhoIdPorNota.get(String(linha.id));
      const baralho = baralhoId ? nomePorBaralho.get(baralhoId) : undefined;

      const nota = montarNota({
        guid: String(linha.guid ?? ''),
        flds: String(linha.flds ?? ''),
        tags: String(linha.tags ?? ''),
        nomesDosCampos: nomes,
        notetype: nomePorModelo.get(String(linha.mid)),
        baralho,
      });
      if (++lidas % PASSO_DO_PROGRESSO === 0) avisar({ etapa: 'lendo', notas: lidas, total });
      if (!nota) {
        descartadas++;
        continue;
      }
      if (baralho) baralhosVistos.add(baralho);
      notas.push(nota);
    }
  } finally {
    stmt.free();
  }

  return {
    notas,
    formato,
    campos: camposVistos,
    descartadas,
    temMidia,
    baralhos: baralhosVistos.size ? [...baralhosVistos].sort() : undefined,
    truncado,
    totalNoArquivo,
  };
}
