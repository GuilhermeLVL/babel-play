import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lerApkg, lerTextoAnki, limparCampo } from '../server/import/anki';

/**
 * O LEITOR DE BARALHOS DO ANKI.
 *
 * As fixtures são `.apkg` DE VERDADE, geradas com SQLite e ZIP reais — nos dois formatos que
 * existem no mundo. O moderno (`collection.anki21b`, Anki ≥ 2.1.50) vem comprimido com zstd e é
 * o que se baixa do AnkiWeb hoje; se ele quebrar, a funcionalidade não serve para nada, e um
 * teste com objeto falso não pegaria isso.
 */

const FIXTURES = join(__dirname, 'fixtures');

describe('limpeza dos campos', () => {
  it('tira o HTML que o Anki guarda dentro do campo', () => {
    expect(limparCampo('<b>light</b>')).toBe('light');
    expect(limparCampo('  spaced   out  ')).toBe('spaced out');
  });

  it('quebra de linha vira ESPAÇO, não emenda as palavras', () => {
    // Sem isto, "luz<br>claridade" viraria "luzclaridade" — uma palavra que não existe.
    expect(limparCampo('luz<br>claridade')).toBe('luz claridade');
    expect(limparCampo('<div>um</div><div>dois</div>')).toBe('um dois');
  });

  it('marcador de mídia some: o arquivo não é importado, então o rótulo só atrapalha', () => {
    expect(limparCampo('house [sound:house.mp3]')).toBe('house');
    expect(limparCampo('<img src="x.png"> casa')).toBe('casa');
  });

  it('desfaz as entidades HTML', () => {
    expect(limparCampo('a &amp; b')).toBe('a & b');
    expect(limparCampo('&quot;oi&quot;')).toBe('"oi"');
  });
});

describe('.apkg antigo (SQLite cru, campos no JSON de col.models)', () => {
  it('lê as notas e reconhece os nomes dos campos', async () => {
    const buf = await readFile(join(FIXTURES, 'baralho-antigo.apkg'));
    const r = await lerApkg(buf);
    expect(r.formato).toBe('collection.anki2');
    expect(r.campos).toEqual(['Front', 'Back', 'Example']);
    expect(r.notas.map(n => n.frente)).toEqual(['house', 'water', 'bread', 'light']);
    expect(r.notas[0]).toMatchObject({ frente: 'house', verso: 'casa', exemplo: 'I live in a big house.' });
  });

  it('descarta a nota sem frente em vez de inventar um lado', async () => {
    const r = await lerApkg(await readFile(join(FIXTURES, 'baralho-antigo.apkg')));
    expect(r.descartadas).toBe(1);
  });

  it('traz as tags do baralho', async () => {
    const r = await lerApkg(await readFile(join(FIXTURES, 'baralho-antigo.apkg')));
    expect(r.notas[0].tags).toEqual(['tag1']);
  });
});

describe('.apkg moderno (zstd + tabelas notetypes/fields)', () => {
  it('descomprime o zstd e lê as notas — é o formato do AnkiWeb hoje', async () => {
    const buf = await readFile(join(FIXTURES, 'baralho-moderno.apkg'));
    const r = await lerApkg(buf);
    expect(r.formato).toBe('collection.anki21b');
    expect(r.notas.map(n => n.frente)).toEqual(['house', 'water', 'bread', 'light']);
  });

  it('pega os nomes dos campos nas TABELAS quando o JSON de models está vazio', async () => {
    const r = await lerApkg(await readFile(join(FIXTURES, 'baralho-moderno.apkg')));
    expect(r.campos).toEqual(['Frente', 'Verso', 'Frase']);
  });

  it('o HTML do campo é limpo também aqui', async () => {
    const r = await lerApkg(await readFile(join(FIXTURES, 'baralho-moderno.apkg')));
    const luz = r.notas.find(n => n.frente === 'light');
    expect(luz?.verso).toBe('luz claridade');
  });
});

describe('acentuação vinda de arquivo EXTERNO', () => {
  /**
   * Este era um ponto cego: todas as asserções acima usavam palavras sem acento, então uma leitura
   * em Latin-1 passaria despercebida — e "água" viraria "Ã¡gua" em todo baralho de idioma real,
   * que é justamente onde acento é a regra e não a exceção.
   */
  it.each(['baralho-antigo.apkg', 'baralho-moderno.apkg'])('%s preserva acento', async (nome) => {
    const r = await lerApkg(await readFile(join(FIXTURES, nome)));
    const versos = r.notas.map(n => n.verso);
    expect(versos).toContain('água');
    expect(versos).toContain('pão');
    // A assinatura da leitura errada: os bytes UTF-8 vistos como Latin-1.
    expect(versos.join(' ')).not.toContain('Ã');
  });
});

describe('arquivo inválido', () => {
  it('diz o que está errado em vez de estourar sem explicação', async () => {
    await expect(lerApkg(Buffer.from('isto não é um zip'))).rejects.toThrow();
  });
});

describe('texto do Anki (.txt/.csv)', () => {
  it('lê o padrão do Anki: separado por tabulação', () => {
    const r = lerTextoAnki('house\tcasa\tI live here.\nwater\trágua');
    expect(r.notas).toHaveLength(2);
    expect(r.notas[0]).toMatchObject({ frente: 'house', verso: 'casa', exemplo: 'I live here.' });
  });

  it('aceita ponto-e-vírgula e vírgula, que é o que sai de planilha', () => {
    expect(lerTextoAnki('house;casa').notas[0].verso).toBe('casa');
    expect(lerTextoAnki('house,casa').notas[0].verso).toBe('casa');
  });

  it('reconhece o cabeçalho e não o transforma em cartão', () => {
    const r = lerTextoAnki('Front\tBack\nhouse\tcasa');
    expect(r.campos).toEqual(['Front', 'Back']);
    expect(r.notas).toHaveLength(1);
  });

  it('linha sem verso é descartada e CONTADA — silêncio aqui seria perda invisível', () => {
    const r = lerTextoAnki('house\tcasa\nsozinha\n\nwater\tágua');
    expect(r.notas).toHaveLength(2);
    expect(r.descartadas).toBe(1);
  });

  it('ignora comentário e linha vazia', () => {
    const r = lerTextoAnki('#separator:tab\n#html:true\n\nhouse\tcasa');
    expect(r.notas).toHaveLength(1);
  });
});

describe('exportar .apkg (ida e volta)', () => {
  it('o arquivo gerado é lido de volta pelo NOSSO leitor, com os campos no lugar', async () => {
    // Este é o teste mais forte que dá para fazer sem instalar o Anki: o leitor aqui já prova
    // que entende `.apkg` de verdade (as fixtures acima são SQLite + ZIP reais, um deles zstd),
    // então relê-lo verifica zip, esquema, tabelas e a ordem dos campos de uma vez.
    const { montarApkg } = await import('../server/import/ankiExport');
    const apkg = await montarApkg([
      { frente: 'house', verso: 'casa', exemplo: 'I live in a big house.' },
      { frente: 'water', verso: 'água' },
    ], 'Teste');

    const lido = await lerApkg(apkg);
    expect(lido.formato).toBe('collection.anki2');
    expect(lido.campos).toEqual(['Frente', 'Verso', 'Frase']);
    expect(lido.notas.map(n => `${n.frente}=${n.verso}`)).toEqual(['house=casa', 'water=água']);
    expect(lido.notas[0].exemplo).toBe('I live in a big house.');
    expect(lido.descartadas).toBe(0);
  });

  it('cada nota ganha um cartão — sem isso o Anki importa e não mostra nada', async () => {
    const { montarApkg } = await import('../server/import/ankiExport');
    const JSZip = (await import('jszip')).default;
    const { createClient } = await import('@libsql/client');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');

    const apkg = await montarApkg([
      { frente: 'a', verso: 'b' }, { frente: 'c', verso: 'd' }, { frente: 'e', verso: 'f' },
    ], 'X');
    const zip = await JSZip.loadAsync(apkg);
    expect(Object.keys(zip.files).sort()).toEqual(['collection.anki2', 'media']);

    const dir = await mkdtemp(join(tmpdir(), 'apkg-teste-'));
    const caminho = join(dir, 'c.anki2');
    await writeFile(caminho, Buffer.from(await zip.file('collection.anki2')!.async('uint8array')));
    const cli = createClient({ url: `file:${caminho}` });
    const notas = await cli.execute('SELECT COUNT(*) n FROM notes');
    const cartoes = await cli.execute('SELECT COUNT(*) n FROM cards');
    const col = await cli.execute('SELECT ver, models, decks FROM col');
    cli.close();
    // No Windows o handle do SQLite não é liberado no mesmo instante do `close()`, e apagar
    // levanta EBUSY. É lixo de teste em pasta temporária — o SO recolhe. Falhar aqui esconderia
    // o que este teste realmente mede.
    await rm(dir, { recursive: true, force: true }).catch(() => { /* o SO limpa */ });

    expect(Number(notas.rows[0].n)).toBe(3);
    expect(Number(cartoes.rows[0].n)).toBe(3);
    // Esquema 11 (o legado) de propósito: é lido por qualquer versão do Anki.
    expect(Number(col.rows[0].ver)).toBe(11);
    expect(String(col.rows[0].models)).toContain('Frente');
    expect(String(col.rows[0].decks)).toContain('X');
  });
});
