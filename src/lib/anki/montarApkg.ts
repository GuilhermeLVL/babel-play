import { strToU8, zipSync } from 'fflate';

import type { AbrirSqlite } from './sqlite';

/**
 * ESCREVER UM `.apkg` QUE O ANKI ACEITE.
 *
 * POR QUE VALE O TRABALHO. O vocabulário é da pessoa, não do aplicativo. Exportar em texto já
 * resolve o essencial — o Anki importa `.txt` nativamente —, mas o `.apkg` é o formato que ela
 * reconhece como "o meu baralho": abre com um duplo clique, chega com nome, e não faz perguntas
 * sobre separador nem sobre qual coluna é qual.
 *
 * O FORMATO. Um `.apkg` é um ZIP com um SQLite dentro (`collection.anki2`) e um `media` com o
 * mapa de arquivos — `{}` no nosso caso, porque não exportamos mídia. O esquema usado aqui é o
 * **11**, o legado: ele é lido por toda versão do Anki dos últimos dez anos, enquanto o esquema
 * novo só é entendido pelas recentes. Para exportar, compatibilidade vale mais que modernidade.
 *
 * O QUE NÃO VAI JUNTO, e a tela diz: o histórico de revisão. O agendamento daqui é FSRS-5 com
 * parâmetros próprios; despejar essas datas no agendador do Anki produziria intervalos que não
 * correspondem a nada dos dois lados. Os cartões chegam lá como NOVOS, que é honesto.
 */

export interface CartaoParaExportar {
  frente: string;
  verso: string;
  exemplo?: string;
}

/**
 * CAMPO DO ANKI E HTML — e por isso ele sai escapado daqui.
 *
 * `limparCampo` (src/core/anki.ts) tira as tags do campo na IMPORTACAO, mas decodifica as
 * entidades DEPOIS, de proposito: `&lt;div&gt;` numa nota e texto que o autor quis mostrar, e
 * decodificar antes o faria ser confundido com uma tag e apagado. A consequencia, medida em
 * 2026-09-09: `&lt;script&gt;alert(1)&lt;/script&gt;` entra como entidade e sai de `limparCampo`
 * como marcacao viva — o mesmo valendo para as numericas (`&#60;`, `&#x3c;`).
 *
 * Dentro do produto isso e inerte: nada do baralho vira HTML (o unico `dangerouslySetInnerHTML`
 * do cliente e o QR do 2FA, e o React escapa todo o resto). O sink e AQUI: `notes.flds` e
 * renderizado como HTML pelo Anki. Sem esta funcao, um baralho hostil importado e depois
 * exportado levava a carga para dentro do webview do Anki da pessoa — um caminho que sai do nosso
 * dominio, onde a nossa politica de escape nao vale mais.
 *
 * Escapar aqui nao muda cartao legitimo nenhum: o conteudo que chega ja passou por `limparCampo`
 * e so tem `<`, `>` ou `&` quando o autor os escreveu como TEXTO — e ai escapar e exatamente o
 * que os preserva como texto.
 *
 * `csum` continua calculado sobre o valor NAO escapado: o Anki faz o dele sobre o campo com o
 * HTML removido, que e justamente este valor. Escapar antes do checksum quebraria a deteccao de
 * duplicata na reimportacao.
 */
function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Separador de campos de uma nota do Anki. */
const SEP = '\x1f';

/** Identificadores fixos do baralho e do modelo que criamos. Estáveis para reimportar por cima. */
const ID_MODELO = 1740000000000;
const ID_BARALHO = 1740000000001;

/**
 * `csum` do Anki: os 8 primeiros dígitos hexadecimais do SHA-1 do PRIMEIRO campo, como inteiro.
 * É o que ele usa para detectar duplicatas na importação — sem isso, reimportar o mesmo baralho
 * criaria tudo de novo em vez de reconhecer o que já existe.
 *
 * No navegador não há `node:crypto`: o SHA-1 vem do Web Crypto (`crypto.subtle.digest`), que é
 * assíncrono mas dá o mesmo resumo — por isso os checksums são calculados antes de abrir o banco.
 */
async function checksum(primeiroCampo: string): Promise<number> {
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-1', strToU8(primeiroCampo)));
  const hex = Array.from(resumo.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
  return parseInt(hex, 16);
}

/** O modelo de nota: três campos e um cartão só (frente → verso). */
function modeloJson(nome: string) {
  return {
    [String(ID_MODELO)]: {
      id: ID_MODELO,
      name: nome,
      type: 0,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      sortf: 0,
      did: ID_BARALHO,
      tmpls: [
        {
          name: 'Cartão 1',
          ord: 0,
          qfmt: '{{Frente}}',
          afmt: '{{FrontSide}}<hr id=answer>{{Verso}}<br><i>{{Frase}}</i>',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
      flds: [
        { name: 'Frente', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Verso', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] },
        { name: 'Frase', ord: 2, sticky: false, rtl: false, font: 'Arial', size: 16, media: [] },
      ],
      css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
      latexPre: '',
      latexPost: '',
      latexsvg: false,
      req: [[0, 'any', [0]]],
      vers: [],
      tags: [],
    },
  };
}

function baralhoJson(nome: string) {
  return {
    [String(ID_BARALHO)]: {
      id: ID_BARALHO,
      name: nome,
      mod: Math.floor(Date.now() / 1000),
      usn: -1,
      desc: 'Exportado do Frasy',
      dyn: 0,
      collapsed: false,
      browserCollapsed: false,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      conf: 1,
      extendNew: 10,
      extendRev: 50,
    },
  };
}

const CONF_PADRAO = {
  nextPos: 1,
  estTimes: true,
  activeDecks: [1],
  sortType: 'noteFld',
  timeLim: 0,
  sortBackwards: false,
  addToCur: true,
  curDeck: ID_BARALHO,
  newBury: true,
  newSpread: 0,
  dueCounts: true,
  curModel: String(ID_MODELO),
  collapseTime: 1200,
};

const DCONF_PADRAO = {
  '1': {
    id: 1,
    name: 'Default',
    mod: 0,
    usn: 0,
    maxTaken: 60,
    autoplay: true,
    timer: 0,
    replayq: true,
    new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20, separate: true },
    rev: { bury: true, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, minSpace: 1, perDay: 200 },
    lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    dyn: false,
  },
};

/** Limites que a rota do servidor impunha (`ankiExportSchema`); agora valem aqui, antes de qualquer trabalho. */
const MAX_CARTOES = 5_000;
const MAX_CAMPO = 2_000;
const MAX_NOME = 120;

function validar(cartoes: CartaoParaExportar[], nome: string): void {
  if (cartoes.length < 1) throw new Error('escolha ao menos um cartão para exportar');
  if (cartoes.length > MAX_CARTOES) throw new Error('no máximo 5.000 cartões por baralho exportado');
  if (nome.length > MAX_NOME) throw new Error('o nome do baralho pode ter no máximo 120 caracteres');
  for (const c of cartoes) {
    for (const campo of [c.frente, c.verso, c.exemplo ?? '']) {
      if (campo.length > MAX_CAMPO) throw new Error('cada campo do cartão pode ter no máximo 2.000 caracteres');
    }
  }
}

/**
 * Monta o `.apkg`. Devolve o ZIP pronto.
 *
 * ATENÇÃO A ESTA LIMITAÇÃO, e ela está dita na tela: o arquivo é validado aqui relendo-o com o
 * NOSSO leitor (que lê `.apkg` reais do AnkiWeb corretamente — há fixture de teste para isso),
 * mas não foi testado contra uma instalação do Anki de verdade. Se ele recusar, a exportação em
 * texto continua sendo o caminho garantido, e a tela oferece os dois.
 *
 * Roda no navegador: o SQLite é o `sql.js` em memória (`db.export()` entrega os bytes do arquivo) e
 * o ZIP é do `fflate`. `abrirSqlite` vem por injeção para os testes usarem o mesmo `sql.js` em Node.
 */
export async function montarApkg(
  cartoes: CartaoParaExportar[],
  nomeDoBaralho: string,
  abrirSqlite: AbrirSqlite,
): Promise<Uint8Array> {
  validar(cartoes, nomeDoBaralho);
  const nome = nomeDoBaralho || 'Frasy';
  const somas = await Promise.all(cartoes.map((c) => checksum(c.frente)));

  const SQL = await abrirSqlite();
  const db = new SQL.Database();
  try {
    // Esquema 11 — o legado, lido por qualquer versão.
    db.run(`
      CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
        scm integer not null, ver integer not null, dty integer not null, usn integer not null,
        ls integer not null, conf text not null, models text not null, decks text not null,
        dconf text not null, tags text not null);
      CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
        mod integer not null, usn integer not null, tags text not null, flds text not null,
        sfld integer not null, csum integer not null, flags integer not null, data text not null);
      CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
        ord integer not null, mod integer not null, usn integer not null, type integer not null,
        queue integer not null, due integer not null, ivl integer not null, factor integer not null,
        reps integer not null, lapses integer not null, left integer not null, odue integer not null,
        odid integer not null, flags integer not null, data text not null);
      CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
      CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
        ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
        time integer not null, type integer not null);
      CREATE INDEX ix_notes_usn on notes (usn);
      CREATE INDEX ix_cards_usn on cards (usn);
      CREATE INDEX ix_cards_nid on cards (nid);
      CREATE INDEX ix_cards_sched on cards (did, queue, due);
      CREATE INDEX ix_notes_csum on notes (csum);
    `);

    const agora = Date.now();
    const agoraSeg = Math.floor(agora / 1000);
    // `crt` é a meia-noite do dia da criação: é a partir dele que o Anki conta os dias.
    const criacao = Math.floor(new Date(new Date().setHours(0, 0, 0, 0)).getTime() / 1000);

    db.run('INSERT INTO col VALUES (1,?,?,?,11,0,-1,0,?,?,?,?,?)', [
      criacao,
      agora,
      agora,
      JSON.stringify(CONF_PADRAO),
      JSON.stringify(modeloJson(nome)),
      JSON.stringify(baralhoJson(nome)),
      JSON.stringify(DCONF_PADRAO),
      '{}',
    ]);

    // Ids precisam ser únicos e crescentes: o Anki usa o id da nota como carimbo de tempo.
    let id = agora;
    for (const [i, c] of cartoes.entries()) {
      const idNota = id++;
      const campos = [c.frente, c.verso, c.exemplo ?? ''].map(escaparHtml).join(SEP);
      db.run('INSERT INTO notes VALUES (?,?,?,?,-1,?,?,?,?,0,?)', [
        idNota,
        crypto.randomUUID().slice(0, 10),
        ID_MODELO,
        agoraSeg,
        '',
        campos,
        escaparHtml(c.frente),
        somas[i],
        '',
      ]);
      // type 0 / queue 0 = cartão NOVO. Sem histórico, como explicado no cabeçalho.
      db.run('INSERT INTO cards VALUES (?,?,?,0,?,-1,0,0,?,0,0,0,0,0,0,0,0,?)', [
        id++,
        idNota,
        ID_BARALHO,
        agoraSeg,
        i + 1,
        '',
      ]);
    }

    // sem mídia — o mapa vazio é obrigatório mesmo assim
    return zipSync({ 'collection.anki2': db.export(), media: strToU8('{}') });
  } finally {
    db.close();
  }
}
