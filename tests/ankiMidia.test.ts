import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@libsql/client';
import JSZip from 'jszip';
import { describe, expect,it } from 'vitest';

import {
  extrairCloze,
  extrairMidia,
  hashDaEstrutura,
  lerApkg,
  TETO_DE_NOTAS,
} from '../server/import/anki';

/**
 * OS INCREMENTOS 1-5: mídia preservada, cloze, nome de baralho/notetype, hash de estrutura e
 * teto de notas.
 *
 * As fixtures `.apkg` deste arquivo são montadas AQUI, com o esquema NOVO (`notetypes`, `fields`,
 * `decks`, `cards`), porque é o formato que testa o caminho principal do leitor (as tabelas, não
 * o fallback de JSON — já coberto em `tests/anki.test.ts`). O arquivo interno se chama
 * `collection.anki21` (SQLite cru, sem zstd) para não precisar comprimir nada nos testes.
 */

const SEP = '\x1f';

interface NotaCrua {
  id: number;
  mid: number;
  flds: string[];
  tags?: string;
}

interface OpcoesApkg {
  notetype: { id: number; nome: string; campos: string[] };
  baralhos: Array<{ id: number; nome: string }>;
  /** cada nota, mais o id do baralho do seu (único) cartão. */
  notas: Array<NotaCrua & { baralhoId: number }>;
}

/** Monta um `.apkg` moderno (tabelas `notetypes`/`fields`/`decks`/`cards`) para os testes. */
async function montarApkgModerno(opts: OpcoesApkg): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'babel-anki-teste-'));
  const caminho = join(dir, 'collection.anki21');
  const cliente = createClient({ url: `file:${caminho}` });
  try {
    await cliente.executeMultiple(`
      CREATE TABLE notetypes (id integer primary key, name text not null);
      CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null);
      CREATE TABLE decks (id integer primary key, name text not null);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, flds text not null, tags text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null);
    `);

    await cliente.execute({
      sql: 'INSERT INTO notetypes VALUES (?,?)',
      args: [opts.notetype.id, opts.notetype.nome],
    });
    for (const [ord, nome] of opts.notetype.campos.entries()) {
      await cliente.execute({ sql: 'INSERT INTO fields VALUES (?,?,?)', args: [opts.notetype.id, ord, nome] });
    }
    for (const b of opts.baralhos) {
      await cliente.execute({ sql: 'INSERT INTO decks VALUES (?,?)', args: [b.id, b.nome] });
    }
    // Inserção em LOTES via SQL bruto: o teste de truncamento insere dezenas de milhares de
    // notas, e uma chamada `execute` por linha (round-trip por linha) levaria minutos.
    const esc = (s: string) => `'${s.replace(/'/g, "''")}'`;
    let idCartao = 1;
    const LOTE = 1000;
    for (let inicio = 0; inicio < opts.notas.length; inicio += LOTE) {
      const fatia = opts.notas.slice(inicio, inicio + LOTE);
      const valoresNotas = fatia
        .map(n => `(${n.id},${esc(`guid-${n.id}`)},${n.mid},${esc(n.flds.join(SEP))},${esc(n.tags ?? '')})`)
        .join(',');
      const valoresCards = fatia
        .map(n => `(${idCartao++},${n.id},${n.baralhoId},0)`)
        .join(',');
      await cliente.executeMultiple(`
        INSERT INTO notes VALUES ${valoresNotas};
        INSERT INTO cards VALUES ${valoresCards};
      `);
    }

    const db = await readFile(caminho);
    const zip = new JSZip();
    zip.file('collection.anki21', db);
    return await zip.generateAsync({ type: 'nodebuffer' });
  } finally {
    try { cliente.close(); } catch { /* já fechado */ }
    await rm(dir, { recursive: true, force: true }).catch(() => { /* o SO limpa */ });
  }
}

describe('extrairMidia', () => {
  it('acha [sound:...] e <img src="...">, cada um na sua lista', () => {
    expect(extrairMidia('house [sound:house.mp3]')).toEqual({ sons: ['house.mp3'], imagens: [] });
    expect(extrairMidia('<img src="casa.png"> casa')).toEqual({ sons: [], imagens: ['casa.png'] });
  });

  it('aceita aspas simples, duplas e sem aspas no src', () => {
    expect(extrairMidia('<img src="a.png">').imagens).toEqual(['a.png']);
    expect(extrairMidia("<img src='b.png'>").imagens).toEqual(['b.png']);
    expect(extrairMidia('<img src=c.png>').imagens).toEqual(['c.png']);
  });

  it('decodifica entidades HTML no nome do arquivo', () => {
    expect(extrairMidia('[sound:on &amp; off.mp3]').sons).toEqual(['on & off.mp3']);
  });

  it('sem duplicatas, na ordem de aparição', () => {
    const r = extrairMidia('[sound:a.mp3] texto [sound:b.mp3] [sound:a.mp3]');
    expect(r.sons).toEqual(['a.mp3', 'b.mp3']);
  });

  it('não acha nada em texto sem mídia', () => {
    expect(extrairMidia('só texto')).toEqual({ sons: [], imagens: [] });
  });
});

describe('extrairCloze', () => {
  it('extrai uma lacuna simples e devolve o texto legível', () => {
    const r = extrairCloze('The capital of France is {{c1::Paris}}.');
    expect(r.texto).toBe('The capital of France is Paris.');
    expect(r.lacunas).toEqual([{ ordinal: 1, resposta: 'Paris', dica: undefined }]);
  });

  it('extrai a dica quando ela existe', () => {
    const r = extrairCloze('{{c1::Paris::capital da França}}');
    expect(r.lacunas).toEqual([{ ordinal: 1, resposta: 'Paris', dica: 'capital da França' }]);
  });

  it('múltiplos ordinais viram várias lacunas, ordenadas', () => {
    const r = extrairCloze('{{c2::segunda}} antes de {{c1::primeira}}');
    expect(r.lacunas.map(l => l.ordinal)).toEqual([1, 2]);
    expect(r.texto).toBe('segunda antes de primeira');
  });

  it('sem marcação, texto passa direto e lacunas fica vazio', () => {
    expect(extrairCloze('nada aqui')).toEqual({ texto: 'nada aqui', lacunas: [] });
  });
});

describe('hashDaEstrutura', () => {
  it('mesmos campos, mesma ordem: mesmo hash', () => {
    expect(hashDaEstrutura(['Front', 'Back'])).toBe(hashDaEstrutura(['Front', 'Back']));
  });

  it('ordem diferente: hash diferente', () => {
    expect(hashDaEstrutura(['Front', 'Back'])).not.toBe(hashDaEstrutura(['Back', 'Front']));
  });

  it('normaliza maiúscula/acento/separador antes de gerar o hash', () => {
    expect(hashDaEstrutura(['front_text', 'back-text'])).toBe(hashDaEstrutura(['Front Text', 'Back Text']));
  });

  it('devolve 16 hex', () => {
    expect(hashDaEstrutura(['A', 'B'])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('mídia preservada na leitura do .apkg', () => {
  it('mídia em vários campos é agregada sem duplicatas, na nota', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back', 'Audio'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{
        id: 1, mid: 1, baralhoId: 1,
        flds: ['house <img src="house.png">', 'casa', '[sound:house.mp3]'],
      }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0].midia).toEqual({ sons: ['house.mp3'], imagens: ['house.png'] });
    // O texto limpo continua sem o marcador — só a referência sobrevive em outro lugar.
    expect(r.notas[0].frente).toBe('house');
  });

  it('[sound:] dentro de campo que não se chama Audio ainda é capturado', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa [sound:casa.mp3]'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].midia?.sons).toEqual(['casa.mp3']);
  });

  it('nota sem mídia não ganha o campo `midia`', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].midia).toBeUndefined();
  });
});

describe('cloze na leitura do .apkg', () => {
  it('lacunas com e sem dica, associadas à nota', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Cloze', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{
        id: 1, mid: 1, baralhoId: 1,
        flds: ['The capital of France is {{c1::Paris::capital}} and it is in {{c2::Europe}}.', 'nota de estudo'],
      }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].lacunas).toEqual([
      { ordinal: 1, resposta: 'Paris', dica: 'capital' },
      { ordinal: 2, resposta: 'Europe', dica: undefined },
    ]);
    // O texto limpo não pode conter a marcação crua — vazaria para a tela.
    expect(r.notas[0].frente).not.toContain('{{c');
    expect(r.notas[0].frente).toContain('Paris');
  });

  it('sem cloze, `lacunas` fica indefinido', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].lacunas).toBeUndefined();
  });
});

describe('nome do baralho e do note type', () => {
  it('lê o nome do note type pela tabela `notetypes`', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: '4000 Essential Words', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].notetype).toBe('4000 Essential Words');
  });

  it('deck hierárquico Pai::Filho fica com `::` intacto', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 2, nome: 'Idiomas::Inglês::Vocabulário' }],
      notas: [{ id: 1, mid: 1, baralhoId: 2, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].baralho).toBe('Idiomas::Inglês::Vocabulário');
    expect(r.baralhos).toEqual(['Idiomas::Inglês::Vocabulário']);
  });

  it('normaliza \\x1f para :: na hierarquia (variante do esquema novo)', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 2, nome: 'Idiomas\x1fInglês' }],
      notas: [{ id: 1, mid: 1, baralhoId: 2, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].baralho).toBe('Idiomas::Inglês');
  });

  it('`baralhos` traz nomes distintos, ordenados', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Zebra' }, { id: 2, nome: 'Alfa' }],
      notas: [
        { id: 1, mid: 1, baralhoId: 1, flds: ['a', 'b'] },
        { id: 2, mid: 1, baralhoId: 2, flds: ['c', 'd'] },
        { id: 3, mid: 1, baralhoId: 1, flds: ['e', 'f'] },
      ],
    });
    const r = await lerApkg(apkg);
    expect(r.baralhos).toEqual(['Alfa', 'Zebra']);
  });
});

describe('hash de estrutura na leitura do .apkg', () => {
  it('nota ganha `estruturaHash` quando o baralho nomeia os campos', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.notas[0].estruturaHash).toBe(hashDaEstrutura(['Front', 'Back']));
  });
});

describe('teto de notas e truncamento', () => {
  it('baralho acima do teto não estoura e reporta truncado: true', async () => {
    const total = TETO_DE_NOTAS + 5;
    const notas: Array<NotaCrua & { baralhoId: number }> = [];
    for (let i = 1; i <= total; i++) {
      notas.push({ id: i, mid: 1, baralhoId: 1, flds: [`front${i}`, `back${i}`] });
    }
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas,
    });
    const r = await lerApkg(apkg);
    expect(r.truncado).toBe(true);
    expect(r.totalNoArquivo).toBe(total);
    expect(r.notas.length).toBeLessThanOrEqual(TETO_DE_NOTAS);
  }, 60_000);

  it('baralho abaixo do teto não é truncado', async () => {
    const apkg = await montarApkgModerno({
      notetype: { id: 1, nome: 'Básico', campos: ['Front', 'Back'] },
      baralhos: [{ id: 1, nome: 'Idiomas' }],
      notas: [{ id: 1, mid: 1, baralhoId: 1, flds: ['house', 'casa'] }],
    });
    const r = await lerApkg(apkg);
    expect(r.truncado).toBe(false);
    expect(r.totalNoArquivo).toBe(1);
  });
});
