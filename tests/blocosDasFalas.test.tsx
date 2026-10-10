// @vitest-environment jsdom
/**
 * A LISTA DE FALAS EM BLOCOS (auditoria de desempenho de 10/10/2026, gargalo 10).
 *
 * Duas coisas se provam aqui. A conta (`lib/captura/blocosDasFalas`): a fala nunca muda de bloco e os
 * blocos ficam em ordem. E a tela (`HistoricoDoPrototipo`): a linha continua sendo o MESMO elemento
 * quando a lista cresce, e uma fala nova refaz duas linhas (ela e a que deixa de ser a atual), nunca as
 * outras: contado pelas vezes em que a linha parte o próprio texto em palavras, que é o que ela faz a
 * cada desenho.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const partidas: string[] = [];
vi.mock('../src/lib/captura/trechosTocaveis', async (importar) => {
  const real = await importar<typeof import('../src/lib/captura/trechosTocaveis')>();
  return {
    ...real,
    palavrasDoPedaco: (pedaco: string, lang: string) => {
      partidas.push(pedaco);
      return real.palavrasDoPedaco(pedaco, lang);
    },
  };
});

import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo';
import { agruparEmBlocos, blocosDasFalas, FALAS_POR_BLOCO } from '../src/lib/captura/blocosDasFalas';
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala';

const ids = (n: number, de = 0) => Array.from({ length: n }, (_, i) => `f${de + i}`);

describe('blocosDasFalas', () => {
  it('enche o bloco e abre o seguinte, na ordem', () => {
    const b = blocosDasFalas(ids(45), new Map(), 20);
    expect([b.get('f0'), b.get('f19'), b.get('f20'), b.get('f39'), b.get('f40'), b.get('f44')]).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('a fala que já tinha bloco fica nele, uma a uma, de 1 a 200', () => {
    let b = new Map<string, number>();
    const visto = new Map<string, number>();
    for (let n = 1; n <= 200; n++) {
      b = blocosDasFalas(ids(n), b);
      for (const [id, bloco] of b) {
        if (visto.has(id)) expect(bloco).toBe(visto.get(id));
        visto.set(id, bloco);
      }
    }
    expect(new Set(b.values()).size).toBe(200 / FALAS_POR_BLOCO);
    expect(b.get('f199')).toBe(9);
  });

  it('fala que entra no meio vai para o bloco da vizinha de baixo, e os blocos seguem em ordem', () => {
    const antes = blocosDasFalas(ids(40), new Map(), 20);
    const comNova = ['f0', 'f1', 'nova', ...ids(38, 2)];
    const b = blocosDasFalas(comNova, antes, 20);
    expect(b.get('nova')).toBe(0);
    const ordem = comNova.map((id) => b.get(id) as number);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
    // as antigas não se mexeram, e a do fim do bloco 0 continua nele (o bloco fica com 21)
    for (const id of ids(40)) expect(b.get(id)).toBe(antes.get(id));
  });

  it('fala que sai não puxa as outras de bloco, e a seguinte ocupa o lugar que sobrou no último', () => {
    const antes = blocosDasFalas(ids(40), new Map(), 20);
    const semDuas = ids(40).filter((id) => id !== 'f3' && id !== 'f39');
    const b = blocosDasFalas([...semDuas, 'f40'], antes, 20);
    for (const id of semDuas) expect(b.get(id)).toBe(antes.get(id));
    expect(b.get('f40')).toBe(1);
    expect(b.has('f39')).toBe(false);
  });

  it('`agruparEmBlocos` devolve os grupos na ordem da lista', () => {
    const falas = ids(45).map((id) => ({ id }));
    const grupos = agruparEmBlocos(falas, blocosDasFalas(ids(45), new Map(), 20));
    expect(grupos.map((g) => [g.bloco, g.falas.length])).toEqual([
      [0, 20],
      [1, 20],
      [2, 5],
    ]);
    expect(grupos.flatMap((g) => g.falas)).toEqual(falas);
  });
});

const fala = (id: string, originalText: string, translatedText = '', isPartial = false): SpeechSegment =>
  ({
    id,
    speakerId: 'system',
    source: 'system',
    timestamp: '00:03',
    originalText,
    translatedText,
    words: [],
    isPartial,
    lang: 'en',
  }) as unknown as SpeechSegment;

describe('a legenda em blocos na tela', () => {
  beforeEach(() => {
    partidas.length = 0;
  });
  afterEach(cleanup);

  const aoTocar = vi.fn();
  /* As mesmas propriedades que a `LiveCapture` passa: `idiomaDaTraducao` é uma função NOVA a cada
     desenho (lá é uma seta escrita no JSX), e mesmo assim a linha antiga não pode refazer. */
  const historico = (falas: SpeechSegment[]) => (
    <HistoricoDoPrototipo
      falas={falas}
      escala={1}
      idiomaPadrao="en"
      idiomaDaTraducao={() => 'pt-BR'}
      aoTocar={aoTocar}
      aoOuvir={() => undefined}
      aoPararAudio={paraAudio}
    />
  );
  const paraAudio = () => undefined;
  /* Fala ainda sem tradução: a linha grande é a original, palavra por palavra (cada desenho da linha
     passa por `palavrasDoPedaco`). */
  const lista = (n: number) => Array.from({ length: n }, (_, i) => fala(`f${i}`, `frase${i} aqui`));

  it('45 falas: três blocos, só os dois de antes podem ser pulados, e todas as linhas estão no DOM', () => {
    const { container } = render(historico(lista(45)));
    const blocos = [...container.querySelectorAll('.q-historico > .q-bloco-de-falas')];
    expect(blocos.map((b) => [b.className, b.children.length])).toEqual([
      ['q-bloco-de-falas antigo', 20],
      ['q-bloco-de-falas antigo', 20],
      ['q-bloco-de-falas', 5],
    ]);
    expect([...container.querySelectorAll('.q-linha-da-fala')].map((l) => l.getAttribute('data-fala'))).toEqual(
      lista(45).map((f) => f.id),
    );
    expect(container.querySelectorAll('.q-linha-da-fala.atual')).toHaveLength(1);
    expect(container.querySelector('.q-linha-da-fala.atual')?.getAttribute('data-fala')).toBe('f44');
  });

  it('a lista cresce de 19 para 23: as linhas são os MESMOS elementos, e só a nova e a que era a atual são refeitas', () => {
    const falas = lista(19);
    const { container, rerender } = render(historico(falas));
    const antes = new Map([...container.querySelectorAll('.q-linha-da-fala')].map((l) => [l.getAttribute('data-fala'), l]));
    for (let n = 20; n <= 23; n++) {
      partidas.length = 0;
      falas.push(fala(`f${n - 1}`, `frase${n - 1} aqui`));
      rerender(historico([...falas]));
      /* Duas linhas desenhadas, e só elas: a que deixou de ser a atual (perde a classe `atual`) e a
         nova. Cada uma parte as suas duas palavras; nenhuma das outras 17 a 21 passa por aqui. */
      expect(partidas).toEqual([`frase${n - 2}`, 'aqui', `frase${n - 1}`, 'aqui']);
    }
    for (const [id, el] of antes) expect(container.querySelector(`[data-fala="${id}"]`)).toBe(el);
    // a vigésima fechou o bloco 0; a 21ª abriu o bloco 1, e o 0 passou a poder ser pulado
    expect([...container.querySelectorAll('.q-bloco-de-falas')].map((b) => [b.className, b.children.length])).toEqual([
      ['q-bloco-de-falas antigo', 20],
      ['q-bloco-de-falas', 3],
    ]);
  });

  it('tocar numa fala de um bloco antigo abre a fala certa', () => {
    const falas = lista(45);
    const { container } = render(historico(falas));
    fireEvent.click(container.querySelector('[data-fala="f3"] .q-fala') as HTMLElement);
    expect(aoTocar).toHaveBeenLastCalledWith(falas[3], 'en');
  });

  it('a linha de escuta que sai sozinha do bloco deixa o bloco na lista (vazio, sem ocupar lugar)', () => {
    const falas = lista(20);
    const { container, rerender } = render(historico(falas));
    rerender(historico([...falas, fala('ruido', '', '', true)]));
    expect(container.querySelectorAll('.q-bloco-de-falas')).toHaveLength(2);
    const aberto = container.querySelectorAll('.q-bloco-de-falas')[1];
    expect(aberto.querySelector('[data-ouvindo]')).toBeTruthy();
    /* O ruído fechou sem texto: a fala some da lista, e o bloco em que ela estava fica. */
    rerender(historico([...falas]));
    expect(container.querySelectorAll('.q-bloco-de-falas')[1]).toBe(aberto);
    expect(aberto.children).toHaveLength(0);
    /* A próxima fala entra nesse mesmo bloco. */
    rerender(historico([...falas, fala('f20', 'frase20 aqui')]));
    expect(aberto.querySelector('[data-fala="f20"]')).toBeTruthy();
  });
});
