/**
 * O CODEC DO FILTRO NA URL (`queryDoFiltro`/`filtroDaQuery`).
 *
 * A barra de endereço é o terceiro espelho da mesma escolha (estado → storage → URL). O contrato
 * que importa travar: (1) ida-e-volta sem perda; (2) filtro padrão = URL limpa; (3) a leitura
 * passa pelo MESMO saneamento da persistência — sessão/deck apagados caem fora sem derrubar o
 * resto; (4) query que não fala de filtro devolve null (a persistência local decide), nunca um
 * padrão que apagaria a escolha guardada.
 */
import { describe, expect, it, vi } from 'vitest';

import { FILTRO_PADRAO, type FiltroDaPratica } from '../src/core/minigames/filtro';
import { filtroDaQuery,queryDoFiltro } from '../src/lib/filtroDaPratica';

const cheio: FiltroDaPratica = {
  versao: 1,
  fontes: ['baralho', 'trilha'],
  baralhos: ['deck-A', 'deck-B'],
  sessoes: [],
  nivelTrilha: 'B1',
  idiomas: ['ja'],
  recorte: { dificeis: true, nuncaVistas: false, pedindoRevisao: true, niveis: ['A1', 'B2'] },
  midia: { comTraducao: true, comFrase: false },
};

describe('queryDoFiltro', () => {
  it('o filtro padrão é URL limpa — sem ruído na barra', () => {
    expect(queryDoFiltro(FILTRO_PADRAO)).toBe('');
  });

  it('o padrão com `false` explícitos (a forma que o saneador materializa) também é limpo', () => {
    expect(queryDoFiltro({
      ...FILTRO_PADRAO,
      recorte: { dificeis: false, nuncaVistas: false, pedindoRevisao: false },
      midia: { comTraducao: false, comFrase: false },
    })).toBe('');
  });

  it('fala a língua de quem lê a URL', () => {
    const q = queryDoFiltro(cheio);
    expect(q).toContain('fonte=baralho%2Ctrilha');
    expect(q).toContain('recorte=dificeis%2Cpedindo-revisao');
    expect(q).toContain('nivel=B1');
    expect(q).toContain('midia=traducao');
    expect(q).not.toContain('frase');
  });
});

describe('ida-e-volta', () => {
  it('serializar e ler devolve o MESMO filtro quando tudo ainda existe', () => {
    const lido = filtroDaQuery(queryDoFiltro(cheio), [], ['deck-A', 'deck-B']);
    expect(lido).toEqual({ ...cheio, midia: { comTraducao: true, comFrase: false } });
  });
});

describe('filtroDaQuery', () => {
  it('query sem `fonte` é null — quem decide é a persistência local', () => {
    expect(filtroDaQuery('', [], [])).toBeNull();
    expect(filtroDaQuery('utm_source=abc', [], [])).toBeNull();
  });

  it('`fonte` só com valores desconhecidos também é null — lixo não é uma escolha', () => {
    expect(filtroDaQuery('fonte=lixo', [], [])).toBeNull();
  });

  it('deck e sessão apagados caem fora sem derrubar o resto do link', () => {
    const lido = filtroDaQuery('fonte=baralho%2Csessao&baralho=morto%2Cdeck-A&sessao=sumiu', ['s1'], ['deck-A']);
    expect(lido?.fontes).toEqual(['baralho', 'sessao']);
    expect(lido?.baralhos).toEqual(['deck-A']);
    expect(lido?.sessoes).toEqual([]);
  });

  it('nível fora da escala e recorte desconhecido são ignorados campo a campo', () => {
    const lido = filtroDaQuery('fonte=trilha&nivel=Z9&recorte=dificeis%2Cvoando&niveis=A1%2CX3', [], []);
    expect(lido?.nivelTrilha).toBeUndefined();
    expect(lido?.recorte.dificeis).toBe(true);
    expect(lido?.recorte.niveis).toEqual(['A1']);
  });
});

/**
 * A CAPTURA DO BOOT e o DONO DA QUERY (`rotas.ts`) — os dois contratos que a spec
 * `persistencia-e-url` apontou como sem teste dedicado. Módulo re-avaliado por caso
 * (`vi.resetModules`) porque a captura acontece na avaliação, que é o ponto inteiro.
 */
describe('consumirQueryDoBoot e publicarQueryDoJogar', () => {
  const janela = (pathname: string, search: string) => ({
    location: { pathname, search },
    history: {
      escritas: [] as string[],
      replaceState(_a: unknown, _b: unknown, url: string) { this.escritas.push(url); },
      pushState(_a: unknown, _b: unknown, url: string) { this.escritas.push(url); },
    },
  });

  it('a query capturada no boot sobrevive à reescrita da barra, e o consumo é único', async () => {
    vi.resetModules();
    const w = janela('/jogar', '?fonte=baralho&recorte=pedindo-revisao');
    vi.stubGlobal('window', w);
    const rotas = await import('../src/lib/rotas');
    // a dança de boot do App reescreve a barra…
    w.location.pathname = '/'; w.location.search = '';
    // …e a captura do módulo ainda entrega o que chegou — uma vez.
    expect(rotas.consumirQueryDoBoot()).toBe('fonte=baralho&recorte=pedindo-revisao');
    expect(rotas.consumirQueryDoBoot()).toBe('');
    vi.unstubAllGlobals();
  });

  it('publicarQueryDoJogar só age com /jogar na barra, e limpa com string vazia', async () => {
    vi.resetModules();
    const w = janela('/biblioteca', '');
    vi.stubGlobal('window', w);
    const rotas = await import('../src/lib/rotas');
    rotas.publicarQueryDoJogar('fonte=baralho');
    expect(w.history.escritas).toEqual([]); // fora de /jogar: não-op

    w.location.pathname = '/jogar';
    rotas.publicarQueryDoJogar('fonte=baralho');
    expect(w.history.escritas).toEqual(['/jogar?fonte=baralho']);

    w.location.search = '?fonte=baralho';
    rotas.publicarQueryDoJogar('');
    expect(w.history.escritas).toEqual(['/jogar?fonte=baralho', '/jogar']); // limpar limpa
    vi.unstubAllGlobals();
  });
});
