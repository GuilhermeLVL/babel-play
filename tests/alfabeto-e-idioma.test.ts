import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { chaveComparavel,ehGramatical } from '../src/core/learning/quality';
import { buildRodadasConectores, type FalaComAudio,temConectores } from '../src/core/minigames/escuta';

/**
 * AS DUAS TABELAS POR IDIOMA — o que elas prometem e o que elas não podem custar.
 *
 * `GRAMATICAIS` e `CONECTORES` só tinham `en`, `pt` e `es`. Isso deixava 25 dos 28 idiomas
 * ofertados sem o Caça-conectores e entregava `der/die/das/und` como vocabulário jogável na
 * trilha alemã. Aqui entram `de`, `fr`, `it` e `nl` — os quatro com trilha publicada, que é
 * onde dá para MEDIR o efeito em vez de supô-lo.
 *
 * O TESTE QUE IMPORTA É O ÚLTIMO. Ligar `GRAMATICAIS` num idioma novo TIRA material que hoje
 * conta: `ehGramatical` alimenta `triarCartoes`, que alimenta o `canPlay` de todos os jogos e a
 * contagem da tela. Uma lista grande demais derruba tudo isso de uma vez, e em silêncio. O teto
 * abaixo é a taxa medida na trilha real, com margem — se uma palavra de CONTEÚDO entrar na lista,
 * a taxa sobe e este teste cai antes do jogo.
 */

const RAIZ = path.resolve(__dirname, '..');

const IDIOMAS_NOVOS = ['de', 'fr', 'it', 'nl'] as const;
/** Nem toda escrita cabe nestas listas; sem certeza da lista, o fallback honesto é não filtrar. */
const IDIOMAS_SEM_LISTA = ['ja', 'ru', 'ar', 'ko', 'zh', 'pl', 'tr', 'sv', 'he', 'hi'] as const;

/** As tabelas são privadas de propósito; o teste de duplicata precisa do TEXTO-FONTE. */
function tabelaDoFonte(arquivo: string, nome: string): Record<string, string[]> {
  const src = readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const inicio = src.indexOf(`const ${nome}`);
  expect(inicio, `${nome} não encontrada em ${arquivo}`).toBeGreaterThan(-1);
  const corpo = src.slice(inicio, inicio + src.slice(inicio).indexOf('\n};'));
  const out: Record<string, string[]> = {};
  for (const m of corpo.matchAll(/(\w{2}):\s*new Set\(\[([\s\S]*?)\]\)/g)) {
    out[m[1]] = [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]);
  }
  return out;
}

function palavrasDaTrilha(lang: string): string[] {
  const j = JSON.parse(readFileSync(path.join(RAIZ, 'public/trilha', `${lang}.json`), 'utf8'));
  return ['A1', 'A2', 'B1', 'B2', 'C1'].flatMap(n => (j.niveis[n] ?? []).map((p: string[]) => p[0]));
}

const GRAMATICAIS = tabelaDoFonte('src/core/learning/quality.ts', 'GRAMATICAIS');
const CONECTORES = tabelaDoFonte('src/core/minigames/escuta.ts', 'CONECTORES');

function fala(text: string): FalaComAudio {
  return { id: text, text, startMs: 0, endMs: 3000 };
}

describe('as duas tabelas cobrem os idiomas com trilha publicada', () => {
  it.each(IDIOMAS_NOVOS)('%s tem lista gramatical e lista de conectores', lang => {
    expect(GRAMATICAIS[lang]?.length ?? 0).toBeGreaterThan(0);
    expect(CONECTORES[lang]?.length ?? 0).toBeGreaterThan(0);
    expect(temConectores(lang)).toBe(true);
  });

  it('reconhece a palavra gramatical de cada um deles', () => {
    expect(ehGramatical('der', 'de')).toBe(true);
    expect(ehGramatical('le', 'fr-CA')).toBe(true);
    expect(ehGramatical('della', 'it')).toBe(true);
    expect(ehGramatical('het', 'nl')).toBe(true);
  });

  it('e deixa passar a palavra de conteúdo, que é o que a lista NÃO é', () => {
    for (const [palavra, lang] of [['Fenster', 'de'], ['fenêtre', 'fr'], ['finestra', 'it'], ['raam', 'nl']]) {
      expect(ehGramatical(palavra, lang), `${palavra} (${lang})`).toBe(false);
    }
  });

  it('monta rodada de conectores com fala real do idioma', () => {
    const casos: Array<[string, string]> = [
      ['de', 'Ich wollte kommen, aber es hat geregnet.'],
      ['fr', 'Je voulais venir, cependant il pleuvait.'],
      ['it', 'Volevo venire da te, tuttavia pioveva troppo.'],
      ['nl', 'Ik wilde komen, echter het regende.'],
    ];
    for (const [lang, texto] of casos) {
      const r = buildRodadasConectores([fala(texto)], { lang });
      expect(r.length, lang).toBe(1);
      expect(r[0].alvos.length, lang).toBeGreaterThan(0);
    }
  });
});

describe('idioma sem lista continua sem jogo e sem filtro', () => {
  it.each(IDIOMAS_SEM_LISTA)('%s não ganha régua emprestada', lang => {
    expect(temConectores(lang)).toBe(false);
    expect(buildRodadasConectores([fala('uma fala qualquer com cinco palavras aqui.')], { lang })).toEqual([]);
    expect(GRAMATICAIS[lang]).toBeUndefined();
  });

  it('e nada é filtrado nesses idiomas', () => {
    expect(ehGramatical('и', 'ru')).toBe(false);
    expect(ehGramatical('の', 'ja')).toBe(false);
  });
});

describe('nenhuma lista tem palavra repetida', () => {
  /* `pt` tinha 'porque' duas vezes. Num `Set` a repetição não muda o comportamento — por isso
     passou despercebida —, mas é a evidência de que a lista foi escrita sem revisão. */
  it.each(Object.entries(GRAMATICAIS))('GRAMATICAIS.%s', (lang, itens) => {
    expect(itens.length, `duplicatas: ${duplicatas(itens).join(', ')}`).toBe(new Set(itens).size);
  });

  it.each(Object.entries(CONECTORES))('CONECTORES.%s', (lang, itens) => {
    expect(itens.length, `duplicatas: ${duplicatas(itens).join(', ')}`).toBe(new Set(itens).size);
    /* O casamento do jogo é por `chaveComparavel`, que tira o acento: 'aún' e 'aun' seriam a
       MESMA entrada, e a lista mentiria sobre o próprio tamanho. */
    const chaves = itens.map(chaveComparavel);
    expect(chaves.length, `colidem sem acento: ${duplicatas(chaves).join(', ')}`).toBe(new Set(chaves).size);
  });
});

function duplicatas(xs: string[]): string[] {
  const vistas = new Set<string>();
  return xs.filter(x => (vistas.has(x) ? true : (vistas.add(x), false)));
}

describe('a lista gramatical não come a trilha', () => {
  /**
   * Os tetos vêm de medição, não de palpite. Medido em 2026-09-08 sobre `public/trilha/*.json`
   * (A1..C1): de 1,56%, fr 1,19%, it 1,37%, nl 1,50% — a mesma faixa do inglês, que já tinha
   * lista e tira 1,07% da trilha dele. As gramaticais são as mais frequentes, então TODAS as
   * removidas caem no A1: 5,9% a 7,8% daquele nível.
   *
   * O teto de 3% (geral) e 12% (A1) é o dobro do medido: dá espaço para a lista crescer um
   * pouco, e não dá espaço para uma palavra de conteúdo comum entrar sem ser notada.
   */
  const TETO_GERAL = 0.03;
  const TETO_A1 = 0.12;

  it.each(IDIOMAS_NOVOS)('%s perde menos que o teto medido', lang => {
    const todas = palavrasDaTrilha(lang);
    expect(todas.length).toBeGreaterThan(1000);
    const removidas = todas.filter(w => ehGramatical(w, lang));
    expect(removidas.length / todas.length, `${removidas.length}/${todas.length}`).toBeLessThan(TETO_GERAL);

    const j = JSON.parse(readFileSync(path.join(RAIZ, 'public/trilha', `${lang}.json`), 'utf8'));
    const a1: string[] = j.niveis.A1.map((p: string[]) => p[0]);
    const foraDoA1 = a1.filter(w => ehGramatical(w, lang));
    expect(foraDoA1.length / a1.length, `A1 ${foraDoA1.length}/${a1.length}`).toBeLessThan(TETO_A1);
  });

  it('e o filtro continua sendo o mesmo do inglês, que é a calibração', () => {
    const en = palavrasDaTrilha('en');
    const removidas = en.filter(w => ehGramatical(w, 'en'));
    expect(removidas.length / en.length).toBeLessThan(TETO_GERAL);
  });
});
