// @vitest-environment jsdom
/**
 * OS PEDIDOS REPETIDOS AO ABRIR O APP (auditoria do servidor de 10/10/2026, achados A2, A3 e A4).
 *
 * Medido no build de produção, celular fraco: abrir o app eram 13 pedidos a `/api`, quatro deles em
 * dobro (perfil, recordes, missões e configurações). Cada bloco aqui prova um dos consertos, e o que
 * continua tendo de ir à rede:
 *  - as configurações: a leitura da abertura serve a quem pede logo depois, e fecha com o tempo ou com
 *    qualquer gravação;
 *  - as métricas: a primeira chegada da lista de sessões não refaz o pedido da montagem; sessão gravada
 *    depois, evento de métrica e pedido que falhou continuam refazendo;
 *  - as flags: a sondagem de 5 minutos não sai com a aba oculta, e volta ao ficar visível.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock('../src/data/funil');
  vi.doUnmock('../src/data/api');
});

describe('as configurações na abertura', () => {
  const CONFIG = { id: 's', activeProfileId: null, targetLanguage: 'en', ui: '{"onboarded":true}' };
  let chamadas: Array<{ url: string; metodo: string }>;
  let servidor: typeof CONFIG;

  async function modulo() {
    chamadas = [];
    servidor = { ...CONFIG };
    let geracao = 0;
    vi.doMock('../src/data/funil', () => ({
      geracaoDeEscritas: () => geracao,
      apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = (init?.method ?? 'GET').toUpperCase();
        chamadas.push({ url, metodo });
        if (metodo !== 'GET') {
          geracao++;
          const corpo = JSON.parse(String(init?.body)) as { ui?: unknown; targetLanguage?: string };
          if (corpo.ui !== undefined) servidor = { ...servidor, ui: JSON.stringify(corpo.ui) };
          if (corpo.targetLanguage) servidor = { ...servidor, targetLanguage: corpo.targetLanguage };
        }
        return resposta(servidor);
      }),
    }));
    return import('../src/data/rotas/settings');
  }
  const leituras = () => chamadas.filter((c) => c.metodo === 'GET').length;

  it('os três donos, um depois do outro, fazem UMA leitura; cada um recebe um objeto seu', async () => {
    const S = await modulo();
    const a = await S.fetchSettings();
    const b = await S.fetchSettings();
    const c = await S.fetchSettings();
    expect(leituras()).toBe(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(b).not.toBe(a);
  });

  it('a janela é de 10 s e não reabre: depois dela toda leitura vai ao servidor', async () => {
    const S = await modulo();
    const t0 = Date.now();
    const relogio = vi.spyOn(Date, 'now');
    relogio.mockReturnValue(t0);
    await S.fetchSettings();
    relogio.mockReturnValue(t0 + 9_000);
    await S.fetchSettings();
    expect(leituras()).toBe(1);
    relogio.mockReturnValue(t0 + 10_000);
    await S.fetchSettings();
    await S.fetchSettings();
    expect(leituras()).toBe(3);
  });

  it('gravar fecha a janela: quem lê depois recebe o que foi gravado, não o retrato da abertura', async () => {
    const S = await modulo();
    expect((await S.fetchSettings())?.targetLanguage).toBe('en');
    await S.saveSettings({ targetLanguage: 'ja' });
    expect((await S.fetchSettings())?.targetLanguage).toBe('ja');
    expect(leituras()).toBe(2);
    await S.fetchSettings();
    expect(leituras()).toBe(3);
  });

  it('o ler-para-gravar das preferências lê do servidor, mesmo dentro da janela', async () => {
    const S = await modulo();
    await S.fetchSettings();
    /* Outra aba gravou uma preferência depois da nossa leitura da abertura. */
    servidor = { ...servidor, ui: '{"onboarded":true,"tema":"agua"}' };
    await S.patchUiSettings({ persona: 'kids' });
    expect(JSON.parse(servidor.ui)).toEqual({ onboarded: true, tema: 'agua', persona: 'kids' });
  });

  it('leitura que falhou não vira a da abertura', async () => {
    const S = await modulo();
    const { apiFetch } = await import('../src/data/funil');
    vi.mocked(apiFetch).mockResolvedValueOnce(resposta({}, 500));
    expect(await S.fetchSettings()).toBeNull();
    expect((await S.fetchSettings())?.targetLanguage).toBe('en');
    expect(chamadas).toHaveLength(1);
  });
});

describe('as métricas do perfil na abertura', () => {
  const api = {
    fetchMetrics: vi.fn(),
    fetchRecordes: vi.fn(),
    lerMissoes: vi.fn(),
    leituraDaListaDeSessoes: vi.fn(),
  };
  let lista = { lidas: 0, quantas: 0 };

  beforeEach(() => {
    lista = { lidas: 0, quantas: 0 };
    api.fetchMetrics.mockReset().mockResolvedValue({ dueToday: 0, palavrasDificeis: [] });
    api.fetchRecordes.mockReset().mockResolvedValue([]);
    api.lerMissoes.mockReset().mockResolvedValue(null);
    api.leituraDaListaDeSessoes.mockReset().mockImplementation(() => lista);
    vi.doMock('../src/data/api', () => api);
    vi.doMock('../src/lib/galeria/cromas', () => ({ hidratarCromas: () => undefined }));
    vi.doMock('../src/lib/loja', () => ({ hidratarPosse: () => undefined }));
    vi.doMock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => 'conta' }));
    vi.doMock('../src/lib/metaDoDia', () => ({ reivindicarMetaDoDia: async () => null }));
    vi.doMock('../src/lib/presenca', () => ({ registrarPresencaHoje: async () => undefined }));
    vi.doMock('../src/lib/recompensasV2', () => ({ reembolsarUmaVez: async () => 0 }));
    vi.doMock('../src/lib/progress', () => ({ deriveProgress: () => ({}) }));
    vi.doMock('../src/components/Toast', () => ({ toast: { ok: () => undefined, info: () => undefined } }));
  });
  afterEach(() => {
    for (const m of ['galeria/cromas', 'loja', 'identidade', 'metaDoDia', 'presenca', 'recompensasV2', 'progress'])
      vi.doUnmock(`../src/lib/${m}`);
    vi.doUnmock('../src/components/Toast');
  });

  const montar = async (quantidade: number) => {
    const { useMetricas } = await import('../src/lib/estado/useMetricas');
    return renderHook(({ n }: { n: number }) => useMetricas(n), { initialProps: { n: quantidade } });
  };
  const assentar = () => act(async () => void (await Promise.resolve()));

  it('a lista chega (0 → 5): o perfil, os recordes e as missões saem UMA vez, e a resposta vale', async () => {
    const h = await montar(0);
    lista = { lidas: 1, quantas: 5 };
    h.rerender({ n: 5 });
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    await assentar();
    expect(api.fetchMetrics).toHaveBeenCalledTimes(1);
    expect(api.fetchRecordes).toHaveBeenCalledTimes(1);
    expect(api.lerMissoes).toHaveBeenCalledTimes(1);
  });

  it('a lista chega antes de o perfil responder: a resposta do pedido da montagem não é jogada fora', async () => {
    let soltar: (m: unknown) => void = () => undefined;
    api.fetchMetrics.mockReturnValue(new Promise((r) => (soltar = r)));
    const h = await montar(0);
    lista = { lidas: 1, quantas: 3 };
    h.rerender({ n: 3 });
    expect(h.result.current.metrics).toBeNull();
    await act(async () => soltar({ dueToday: 7, palavrasDificeis: [] }));
    await waitFor(() => expect(h.result.current.metrics).toEqual({ dueToday: 7, palavrasDificeis: [] }));
    expect(api.fetchMetrics).toHaveBeenCalledTimes(1);
  });

  it('sessão gravada depois da chegada recarrega (5 → 6)', async () => {
    const h = await montar(0);
    lista = { lidas: 1, quantas: 5 };
    h.rerender({ n: 5 });
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    h.rerender({ n: 6 });
    await waitFor(() => expect(api.fetchMetrics).toHaveBeenCalledTimes(2));
  });

  it('conta sem sessão que grava a primeira recarrega (a lista chegou com zero, e 1 não é o que ela trouxe)', async () => {
    const h = await montar(0);
    lista = { lidas: 1, quantas: 0 };
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    h.rerender({ n: 1 });
    await waitFor(() => expect(api.fetchMetrics).toHaveBeenCalledTimes(2));
  });

  it('o evento de métrica mudada recarrega, como sempre', async () => {
    const h = await montar(0);
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    act(() => void window.dispatchEvent(new Event('babel:metricas-mudaram')));
    await waitFor(() => expect(api.fetchMetrics).toHaveBeenCalledTimes(2));
  });

  it('se o pedido da montagem falhou, a chegada da lista tenta de novo', async () => {
    api.fetchMetrics.mockRejectedValueOnce(new Error('rede'));
    const h = await montar(0);
    await assentar();
    lista = { lidas: 1, quantas: 5 };
    h.rerender({ n: 5 });
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    expect(api.fetchMetrics).toHaveBeenCalledTimes(2);
  });

  it('lista relida depois (migração, conta liberada) recarrega: só a PRIMEIRA chegada é reaproveitada', async () => {
    const h = await montar(0);
    lista = { lidas: 1, quantas: 5 };
    h.rerender({ n: 5 });
    await waitFor(() => expect(h.result.current.metrics).not.toBeNull());
    lista = { lidas: 2, quantas: 9 };
    h.rerender({ n: 9 });
    await waitFor(() => expect(api.fetchMetrics).toHaveBeenCalledTimes(2));
  });
});

describe('a sondagem das flags com a aba oculta', () => {
  let visibilidade: DocumentVisibilityState;
  beforeEach(() => {
    localStorage.clear();
    visibilidade = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidade);
    vi.doMock('../src/lib/supabase', () => ({
      supabase: null,
      authRequired: true,
      carregarSupabase: async () => null,
      getAccessToken: async () => null,
    }));
  });
  afterEach(() => vi.doUnmock('../src/lib/supabase'));

  it('oculta, não sonda; ao ficar visível, lê na hora; visível, sonda a cada 5 minutos', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const rede = vi.fn(async () => resposta({ flags: {} }));
    vi.stubGlobal('fetch', rede);
    const F = await import('../src/lib/flags');
    const desligar = F.iniciarAtualizacaoDeFlags();
    await vi.advanceTimersByTimeAsync(0);
    expect(rede).toHaveBeenCalledTimes(1); // a leitura da abertura

    visibilidade = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(F.INTERVALO_DE_REFRESH_MS * 3);
    expect(rede).toHaveBeenCalledTimes(1); // três sondagens puladas

    visibilidade = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(rede).toHaveBeenCalledTimes(2); // voltou: lê na hora

    await vi.advanceTimersByTimeAsync(F.INTERVALO_DE_REFRESH_MS);
    expect(rede).toHaveBeenCalledTimes(3); // visível: a sondagem de sempre
    desligar();
  });
});
