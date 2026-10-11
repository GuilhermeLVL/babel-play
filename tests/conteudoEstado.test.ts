// @vitest-environment jsdom
/**
 * O CONTEÚDO ESCOLHIDO — uma escolha só para o app inteiro (`src/lib/conteudo/`): o padrão, a
 * persistência (aparelho e conta), a fonte que sumiu, os dois idiomas, a tradução de mão dupla com o
 * filtro guardado do Jogar e a conta de quantos jogos servem.
 */
import { FILTRO_PADRAO } from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ContagensDeConteudo, contarConteudo } from '../src/core/learning/contagensDeConteudo';
import {
  type Conteudo,
  CONTEUDO_PADRAO,
  escolher,
  type FonteDeConteudo,
  lerConteudo,
  mudarIdioma,
  sanear,
  voltarParaTudo,
} from '../src/lib/conteudo/estado';
import { conteudoDoFiltro, filtroDoConteudo } from '../src/lib/conteudo/filtro';
import { jogoServe, jogosQueServem, TODOS_OS_JOGOS } from '../src/lib/conteudo/jogos';
import { filtroDaQuery, queryDoFiltro } from '../src/lib/filtroDaPratica';

const settings = vi.hoisted(() => ({
  ui: null as string | null,
  fetchSettings: vi.fn(),
  patchUiSettings: vi.fn(async () => null),
}));
vi.mock('../src/data/rotas/settings', () => ({
  fetchSettings: settings.fetchSettings,
  patchUiSettings: settings.patchUiSettings,
}));

const SESSAO: FonteDeConteudo = { tipo: 'sessao', id: 's1', nome: 'Reunião de produto' };
const ANKI: FonteDeConteudo = { tipo: 'anki', id: 'dA', nome: 'Phrasal Verbs' };

const catalogo = (o: Partial<ContagensDeConteudo> = {}): ContagensDeConteudo => ({
  agora: 0,
  idioma: 'en',
  idiomas: [
    { id: 'en', palavras: 10 },
    { id: 'es', palavras: 4 },
  ],
  tudo: { palavras: 10, frases: 6, paraHoje: 3 },
  dificeis: { palavras: 1, frases: 1, paraHoje: 0 },
  sessoes: [{ id: 's1', nome: 'Reunião de produto', tipo: 'live', quando: 1, duracaoMs: null, palavras: 5, frases: 4, paraHoje: 2 }],
  anki: [{ id: 'dA', nome: 'Phrasal Verbs', tipo: null, quando: 1, duracaoMs: null, palavras: 3, frases: 0, paraHoje: 0 }],
  trilha: { palavras: 2, frases: 0, paraHoje: 1 },
  ...o,
});

describe('o estado, puro', () => {
  it('o padrão é "Tudo", sem idioma decidido', () => {
    expect(CONTEUDO_PADRAO).toEqual({ idioma: '', fonte: { tipo: 'tudo' } });
    expect(lerConteudo(null)).toEqual(CONTEUDO_PADRAO);
    expect(lerConteudo('lixo')).toEqual(CONTEUDO_PADRAO);
    expect(lerConteudo({ idioma: 'EN-us', fonte: { tipo: 'inventada' } })).toEqual({ idioma: 'en', fonte: { tipo: 'tudo' } });
    expect(lerConteudo({ idioma: 'es', fonte: { tipo: 'sessao' } }).fonte).toEqual({ tipo: 'tudo' });
  });

  it('lê de volta o que guardou, nas cinco fontes', () => {
    for (const fonte of [{ tipo: 'tudo' }, { tipo: 'dificeis' }, SESSAO, ANKI, { tipo: 'trilha' }] as FonteDeConteudo[]) {
      const c: Conteudo = { idioma: 'en', fonte };
      expect(lerConteudo(JSON.parse(JSON.stringify(c)))).toEqual(c);
    }
  });

  it('escolher leva o idioma da fonte; o "x" volta para Tudo no mesmo idioma', () => {
    const c = escolher({ idioma: 'en', fonte: { tipo: 'tudo' } }, SESSAO, 'es');
    expect(c).toEqual({ idioma: 'es', fonte: SESSAO });
    expect(voltarParaTudo(c)).toEqual({ idioma: 'es', fonte: { tipo: 'tudo' } });
  });

  it('trocar de idioma: sessão e baralho voltam para Tudo; Difíceis e Trilha ficam', () => {
    expect(mudarIdioma({ idioma: 'en', fonte: SESSAO }, 'es')).toEqual({ idioma: 'es', fonte: { tipo: 'tudo' } });
    expect(mudarIdioma({ idioma: 'en', fonte: ANKI }, 'es').fonte).toEqual({ tipo: 'tudo' });
    expect(mudarIdioma({ idioma: 'en', fonte: { tipo: 'dificeis' } }, 'es')).toEqual({ idioma: 'es', fonte: { tipo: 'dificeis' } });
    const igual: Conteudo = { idioma: 'en', fonte: SESSAO };
    expect(mudarIdioma(igual, 'en')).toBe(igual);
  });

  it('a fonte que deixou de existir volta para Tudo, sem erro', () => {
    const k = catalogo({ sessoes: [], anki: [], trilha: null });
    expect(sanear({ idioma: 'en', fonte: SESSAO }, k)).toEqual({ idioma: 'en', fonte: { tipo: 'tudo' } });
    expect(sanear({ idioma: 'en', fonte: ANKI }, k).fonte).toEqual({ tipo: 'tudo' });
    expect(sanear({ idioma: 'en', fonte: { tipo: 'trilha' } }, k).fonte).toEqual({ tipo: 'tudo' });
    expect(sanear({ idioma: 'en', fonte: { tipo: 'dificeis' } }, k).fonte).toEqual({ tipo: 'dificeis' });
  });

  it('a fonte que existe fica (o mesmo objeto), e o nome acompanha a sessão renomeada', () => {
    const c: Conteudo = { idioma: 'en', fonte: SESSAO };
    expect(sanear(c, catalogo())).toBe(c);
    const renomeada = catalogo({ sessoes: [{ ...catalogo().sessoes[0], nome: 'Roadmap' }] });
    expect(sanear(c, renomeada).fonte).toEqual({ tipo: 'sessao', id: 's1', nome: 'Roadmap' });
  });

  it('o idioma é o que o catálogo aplicou; com um idioma só, é ele', () => {
    expect(sanear(CONTEUDO_PADRAO, catalogo())).toEqual({ idioma: 'en', fonte: { tipo: 'tudo' } });
    const um = catalogo({ idioma: '', idiomas: [{ id: 'fr', palavras: 3 }] });
    expect(sanear(CONTEUDO_PADRAO, um).idioma).toBe('fr');
    expect(sanear(CONTEUDO_PADRAO, catalogo({ idioma: '', idiomas: [] })).idioma).toBe('');
  });
});

describe('a conta, a mesma no servidor e no aparelho', () => {
  const cartao = (id: string, o: Record<string, unknown> = {}) => ({
    id,
    inDeck: 1,
    dueAt: null,
    lapses: 0,
    idioma: 'en',
    sessionId: null,
    sentence: null,
    ...o,
  });
  it('quem tem dois idiomas vê um por vez; quem tem um não é filtrado (o cartão sem idioma conta)', () => {
    const base = { origens: [], sessoes: [], baralhos: [], agora: 100 };
    const dois = contarConteudo({ ...base, idioma: 'es', cartoes: [cartao('a'), cartao('b'), cartao('c', { idioma: 'es' }), cartao('d', { idioma: null })] });
    expect(dois.idioma).toBe('es');
    expect(dois.tudo.palavras).toBe(1);
    const um = contarConteudo({ ...base, idioma: 'es', cartoes: [cartao('a'), cartao('d', { idioma: null })] });
    expect(um.idioma).toBe('');
    expect(um.tudo.palavras).toBe(2);
  });
});

describe('a tradução de mão dupla com o filtro do Jogar', () => {
  it('"Tudo" é o filtro padrão: a URL do Jogar fica limpa', () => {
    expect(filtroDoConteudo(CONTEUDO_PADRAO)).toEqual(FILTRO_PADRAO);
    expect(queryDoFiltro(filtroDoConteudo(CONTEUDO_PADRAO))).toBe('');
  });

  it('ida e volta dão a mesma escolha nas cinco fontes, com e sem idioma', () => {
    const nomes = { sessao: () => 'Reunião de produto', anki: () => 'Phrasal Verbs' };
    for (const idioma of ['', 'en'])
      for (const fonte of [{ tipo: 'tudo' }, { tipo: 'dificeis' }, SESSAO, ANKI, { tipo: 'trilha' }] as FonteDeConteudo[]) {
        const c: Conteudo = { idioma, fonte };
        expect(conteudoDoFiltro(filtroDoConteudo(c), nomes)).toEqual({ conteudo: c, exato: true });
      }
  });

  it('atravessa a query de /jogar e volta', () => {
    const c: Conteudo = { idioma: 'en', fonte: SESSAO };
    const query = queryDoFiltro(filtroDoConteudo(c));
    expect(query).toContain('fonte=sessao');
    expect(query).toContain('sessao=s1');
    const de = filtroDaQuery(query, ['s1'], ['dA']);
    expect(conteudoDoFiltro(de!, { sessao: () => 'Reunião de produto' }).conteudo).toEqual(c);
    // a sessão apagada some do filtro lido da URL, e a escolha cai em Tudo, sem erro
    expect(conteudoDoFiltro(filtroDaQuery(query, [], [])!).conteudo.fonte.tipo).toBe('tudo');
  });

  it('o que o seletor não representa volta como a escolha mais próxima, marcada como inexata', () => {
    expect(conteudoDoFiltro({ ...FILTRO_PADRAO, fontes: ['sessao'], sessoes: ['s1', 's2'] })).toMatchObject({
      conteudo: { fonte: { tipo: 'sessao', id: 's1' } },
      exato: false,
    });
    expect(conteudoDoFiltro({ ...FILTRO_PADRAO, recorte: { nuncaVistas: true } })).toMatchObject({
      conteudo: { fonte: { tipo: 'tudo' } },
      exato: false,
    });
    expect(conteudoDoFiltro({ ...FILTRO_PADRAO, fontes: ['baralho'] }).exato).toBe(false);
  });
});

describe('quantos jogos servem (a regra de MINIGAMES)', () => {
  it('com material de sobra, todos; sem nada, nenhum', () => {
    expect(jogosQueServem({ palavras: 50, frases: 50 })).toEqual({ servem: TODOS_OS_JOGOS.length, total: TODOS_OS_JOGOS.length, fora: [] });
    expect(jogosQueServem({ palavras: 0, frases: 0 }).servem).toBe(0);
  });
  it('sem frases: os de frase ficam de fora, os de fala aceitam a palavra falada', () => {
    const r = jogosQueServem({ palavras: 60, frases: 0 });
    expect(r.fora.sort()).toEqual(['conectores', 'scramble']);
    expect(jogoServe('ditado', { palavras: 60, frases: 0 })).toMatchObject({ ok: true, de: 'palavras', comPalavrasFaladas: true });
    expect(jogoServe('scramble', { palavras: 60, frases: 2 })).toEqual({ ok: false, pede: 'frases', minimo: 3, ha: 2 });
  });
  it('fonte pequena (3 palavras): só o Termo abre, e os de fala', () => {
    const r = jogosQueServem({ palavras: 3, frases: 0 });
    expect(TODOS_OS_JOGOS.filter((j) => !r.fora.includes(j)).sort()).toEqual(['ditado', 'karaoke', 'termo']);
    expect(jogoServe('memory', { palavras: 3, frases: 0 })).toEqual({ ok: false, pede: 'palavras', minimo: 4, ha: 3 });
  });
  it('sem rede, o Karaokê espera', () => {
    expect(jogoServe('karaoke', { palavras: 50, frases: 50 }, { semRede: true })).toMatchObject({ ok: false, pede: 'rede' });
  });
});

describe('a loja: guarda, avisa e sobrevive a recarregar', () => {
  const carregar = async () => {
    vi.resetModules();
    return import('../src/lib/conteudo/loja');
  };
  beforeEach(() => {
    localStorage.clear();
    settings.ui = null;
    settings.fetchSettings.mockReset().mockImplementation(async () => ({ id: 'x', activeProfileId: null, targetLanguage: null, ui: settings.ui }));
    settings.patchUiSettings.mockClear();
    vi.useRealTimers();
  });

  it('nasce em "Tudo"', async () => {
    const loja = await carregar();
    expect(loja.conteudoAtual()).toEqual(CONTEUDO_PADRAO);
  });

  it('escolher avisa quem escuta, grava no aparelho e (depois de uma pausa) na conta', async () => {
    vi.useFakeTimers();
    const loja = await carregar();
    const ouvinte = vi.fn();
    const parar = loja.assinarConteudo(ouvinte);
    loja.escolherConteudo(SESSAO, 'en');
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(loja.conteudoAtual()).toEqual({ idioma: 'en', fonte: SESSAO });
    expect(JSON.parse(localStorage.getItem('babel.conteudo')!)).toEqual({ idioma: 'en', fonte: SESSAO });
    expect(settings.patchUiSettings).not.toHaveBeenCalled();
    loja.escolherConteudo(SESSAO, 'en'); // a mesma: ninguém é avisado de novo
    expect(ouvinte).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(settings.patchUiSettings).toHaveBeenCalledExactlyOnceWith({ conteudo: { idioma: 'en', fonte: SESSAO } });
    parar();
    loja.voltarParaTudoNoConteudo();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(loja.conteudoAtual()).toEqual({ idioma: 'en', fonte: { tipo: 'tudo' } });
  });

  it('a escolha persiste de um dia para o outro: recarregar a página a traz de volta', async () => {
    const antes = await carregar();
    antes.escolherConteudo(ANKI, 'en');
    const depois = await carregar();
    expect(depois.conteudoAtual()).toEqual({ idioma: 'en', fonte: ANKI });
  });

  it('a conta manda ao abrir (outro aparelho escolheu), sem regravar nela', async () => {
    vi.useFakeTimers();
    settings.ui = JSON.stringify({ theme: 'x', conteudo: { idioma: 'es', fonte: { tipo: 'dificeis' } } });
    const loja = await carregar();
    await loja.carregarConteudoDaConta();
    expect(loja.conteudoAtual()).toEqual({ idioma: 'es', fonte: { tipo: 'dificeis' } });
    vi.advanceTimersByTime(2000);
    expect(settings.patchUiSettings).not.toHaveBeenCalled();
  });

  it('quem já escolheu nesta página não é atropelado pela resposta da conta', async () => {
    settings.ui = JSON.stringify({ conteudo: { idioma: 'es', fonte: { tipo: 'dificeis' } } });
    let soltar = () => {};
    settings.fetchSettings.mockImplementation(
      () => new Promise((ok) => (soltar = () => ok({ id: 'x', activeProfileId: null, targetLanguage: null, ui: settings.ui }))),
    );
    const loja = await carregar();
    const lendo = loja.carregarConteudoDaConta();
    loja.escolherConteudo(SESSAO, 'en');
    soltar();
    await lendo;
    expect(loja.conteudoAtual().fonte).toEqual(SESSAO);
  });

  it('o catálogo lido confere a escolha: a sessão apagada volta para Tudo; resposta de outro idioma não julga', async () => {
    const loja = await carregar();
    loja.escolherConteudo(SESSAO, 'en');
    loja.conferirConteudo(catalogo({ idioma: 'es', sessoes: [] }), 'es');
    expect(loja.conteudoAtual().fonte).toEqual(SESSAO);
    loja.conferirConteudo(catalogo({ sessoes: [] }), 'en');
    expect(loja.conteudoAtual()).toEqual({ idioma: 'en', fonte: { tipo: 'tudo' } });
  });

  it('armazenamento corrompido: o padrão, sem erro', async () => {
    localStorage.setItem('babel.conteudo', '{nao é json');
    expect((await carregar()).conteudoAtual()).toEqual(CONTEUDO_PADRAO);
  });
});
