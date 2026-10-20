/**
 * BENCHMARK DO LEITOR DE `.apkg` (Fase 3 da migração para Cloudflare).
 *
 * O critério de aceite da spec (`docs/specs/2026-10-19-migracao-cloudflare.md`) diz: "Importação de um
 * `.apkg` de 200 MB conclui no navegador em ≤ 60 s num notebook comum, sem tocar o servidor além dos lotes
 * de cartões". Este script gera um `.apkg` SINTÉTICO com essa cara — uma coleção moderna
 * (`collection.anki21b`, esquema 18 mínimo, zstd) com 20.000 notas e ~2.000 arquivos de mídia de ~100 KB
 * (bytes aleatórios, incompressíveis, como áudio e imagem reais) — e cronometra o MESMO leitor que roda
 * no navegador (`src/lib/anki/lerApkg.ts`), em Node, com o `sql.js` de `node_modules`.
 *
 * O que ele prova: que a leitura em streaming (fflate → fzstd → sql.js) não infla a mídia, não segura o
 * arquivo inteiro em memória e termina dentro do teto. O que ele NÃO prova: o tempo no navegador de
 * verdade — esse é medido à mão pela tela de importação (`npm run dev:local`), com o arquivo que este
 * script gera, e anotado em `docs/auditoria/2026-10-19-spikes-cloudflare.md`.
 *
 * Uso:
 *   npx tsx scripts/perf/anki-200mb.ts [--notas 20000] [--midia 2000] [--kb 100] [--saida /tmp/x.apkg]
 *
 * O arquivo gerado fica no diretório temporário do sistema e NÃO entra no repositório.
 */
import { randomBytes } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';

import { zipSync } from 'fflate';

import { lerApkg } from '../../src/lib/anki/lerApkg';
import { abrirSqlite } from '../../tests/harness/lerApkgNode';

const SEP = '\x1f';

function argumento(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const NOTAS = Number(argumento('notas', '20000'));
const MIDIA = Number(argumento('midia', '2000'));
const KB_POR_MIDIA = Number(argumento('kb', '100'));

/** A coleção moderna, no mínimo que o leitor consulta: `col`, `notetypes`, `fields`, `decks`, `notes`, `cards`. */
async function montarColecao(notas: number): Promise<Uint8Array> {
  const SQL = await abrirSqlite();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
        ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null,
        models text not null, decks text not null, dconf text not null, tags text not null);
      CREATE TABLE notetypes (id integer not null primary key, name text not null, mtime_secs integer not null,
        usn integer not null, config blob not null);
      CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null,
        config blob not null, primary key (ntid, ord)) without rowid;
      CREATE TABLE decks (id integer primary key not null, name text not null, mtime_secs integer not null,
        usn integer not null, common blob not null, kind blob not null);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
        usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
        flags integer not null, data text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
        mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
        ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null,
        odue integer not null, odid integer not null, flags integer not null, data text not null);
    `);
    const agora = Math.floor(Date.now() / 1000);
    db.run('INSERT INTO col VALUES (1, ?, ?, ?, 18, 0, 0, 0, ?, ?, ?, ?, ?)', [
      agora,
      agora,
      agora,
      '{}',
      '{}',
      '{}',
      '{}',
      '{}',
    ]);
    db.run('INSERT INTO notetypes VALUES (1, ?, ?, 0, ?)', ['Vocabulário', agora, new Uint8Array(0)]);
    for (const [ord, nome] of ['Word', 'Meaning', 'Example', 'Audio'].entries()) {
      db.run('INSERT INTO fields VALUES (1, ?, ?, ?)', [ord, nome, new Uint8Array(0)]);
    }
    db.run('INSERT INTO decks VALUES (1, ?, ?, 0, ?, ?)', [
      'Benchmark::200 MB',
      agora,
      new Uint8Array(0),
      new Uint8Array(0),
    ]);

    db.run('BEGIN');
    const nota = db.prepare('INSERT INTO notes VALUES (?, ?, 1, ?, 0, ?, ?, ?, 0, 0, ?)');
    const carta = db.prepare('INSERT INTO cards VALUES (?, ?, 1, 0, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)');
    for (let i = 1; i <= notas; i++) {
      const flds = [
        `palavra${i}`,
        `sentido <b>${i}</b> &amp; tradução`,
        `Uma frase de exemplo número ${i} com a palavra${i} no meio.`,
        `[sound:audio${i % MIDIA}.mp3]`,
      ].join(SEP);
      nota.run([i, `guid${i.toString(36)}`, agora, i % 7 === 0 ? 'tag-a tag-b' : '', flds, `palavra${i}`, '']);
      carta.run([i, i, agora, i, '']);
    }
    nota.free();
    carta.free();
    db.run('COMMIT');
    return db.export();
  } finally {
    db.close();
  }
}

async function gerarApkg(caminho: string): Promise<void> {
  const t0 = Date.now();
  const colecao = await montarColecao(NOTAS);
  const comprimida = zstdCompressSync(colecao);
  const entradas: Record<string, Uint8Array> = {
    'collection.anki21b': comprimida,
    'collection.anki2': new TextEncoder().encode('placeholder'),
    meta: new Uint8Array([0x08, 0x03]), // protobuf: version = Latest
  };
  const mapa: Record<string, string> = {};
  for (let i = 0; i < MIDIA; i++) {
    entradas[String(i)] = zstdCompressSync(randomBytes(KB_POR_MIDIA * 1024));
    mapa[String(i)] = `audio${i}.mp3`;
  }
  entradas.media = zstdCompressSync(new TextEncoder().encode(JSON.stringify(mapa)));
  // Mídia já comprimida em zstd vai "stored" (nível 0) no zip, como o Anki faz.
  const zip = zipSync(entradas, { level: 0 });
  await writeFile(caminho, zip);
  const { size } = await stat(caminho);
  console.log(
    `gerado ${caminho}: ${(size / 1048576).toFixed(1)} MB (coleção ${(colecao.length / 1048576).toFixed(1)} MB → zstd ${(comprimida.length / 1048576).toFixed(1)} MB; ${MIDIA} mídias de ${KB_POR_MIDIA} KB) em ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

async function medir(caminho: string): Promise<void> {
  /* `openAsBlob` entrega um Blob apoiado no ARQUIVO, sem carregá-lo na memória — o mesmo que o navegador faz
     com um `File` do `<input>`. Assim o RSS medido é o do leitor (streaming do zip + zstd + sql.js), não o de
     um Buffer de 200 MB que o próprio script teria alocado. (A geração do arquivo, logo antes, deixa lixo
     no heap; a diferença de RSS é uma ordem de grandeza, não uma medida fina.) */
  const arquivo = await openAsBlob(caminho);
  const antes = process.memoryUsage().rss;
  const t0 = performance.now();
  const leitura = await lerApkg(arquivo, { abrirSqlite });
  const segundos = (performance.now() - t0) / 1000;
  const depois = process.memoryUsage().rss;
  console.log(
    [
      `arquivo: ${(arquivo.size / 1048576).toFixed(1)} MB`,
      `formato: ${leitura.formato}`,
      `notas lidas: ${leitura.notas.length} (total no arquivo ${leitura.totalNoArquivo}, descartadas ${leitura.descartadas}, truncado ${leitura.truncado})`,
      `temMidia: ${leitura.temMidia}`,
      `tempo: ${segundos.toFixed(2)} s`,
      `RSS: ${(antes / 1048576).toFixed(0)} MB → ${(depois / 1048576).toFixed(0)} MB`,
      `critério (≤ 60 s): ${segundos <= 60 ? 'OK' : 'FALHOU'}`,
    ].join('\n'),
  );
  if (segundos > 60) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (typeof zstdCompressSync !== 'function') throw new Error('este Node não tem zstd no zlib (precisa de ≥ 22.15)');
  const saida = argumento('saida', join(await mkdtemp(join(tmpdir(), 'babel-apkg-200mb-')), 'benchmark.apkg'));
  await gerarApkg(saida);
  await medir(saida);
  console.log(`\nPara medir no navegador: npm run dev:local → Cartões → importar ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
