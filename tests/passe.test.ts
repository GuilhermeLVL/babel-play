/**
 * PASSE DE TEMPORADA (spec personalizar-v4) — os contratos:
 * 1. O passe é uma LENTE: slot da década N destrava com nível N — nada muda na economia.
 * 2. TODO item não-exclusivo do catálogo aparece exatamente UMA vez, na década do seu nível
 *    (conteúdo antes de moeda — o feedback "passe fraco" não pode regredir).
 * 3. Exclusivo de conquista NUNCA entra no passe.
 * 4. Slots de Seeds têm creditoId determinístico (idempotência no servidor).
 */
import { describe, expect,it } from 'vitest';

import { passeNivel, premiumDoNivel, slotDestravado, slotsDoPasse, totalPremiumEmCreditos } from '../src/core/passe';
import { CATALOGO_DA_LOJA } from '../src/lib/loja';

describe('slotsDoPasse', () => {
  const slots = slotsDoPasse();

  it('todo item não-exclusivo entra exatamente uma vez, na própria década', () => {
    const naoExclusivos = CATALOGO_DA_LOJA.filter((i) => !i.exclusivoDe);
    const noPasse = slots.filter((s) => s.tipo === 'item');
    expect(noPasse.length).toBe(naoExclusivos.length);
    const vistos = new Map<string, number>();
    for (const s of noPasse) {
      if (s.tipo !== 'item') continue;
      vistos.set(s.item.id, (vistos.get(s.item.id) ?? 0) + 1);
      expect(s.decada, `${s.item.id} fora da década do nível ${s.item.nivel}`).toBe(Math.min(10, s.item.nivel));
    }
    for (const [id, n] of vistos) expect(n, `${id} duplicado no passe`).toBe(1);
  });

  it('exclusivos de conquista ficam fora', () => {
    const ids = new Set(slots.filter((s) => s.tipo === 'item').map((s) => (s.tipo === 'item' ? s.item.id : '')));
    for (const i of CATALOGO_DA_LOJA.filter((x) => x.exclusivoDe)) {
      expect(ids.has(i.id), `${i.id} é de conquista e entrou no passe`).toBe(false);
    }
  });

  it('conteúdo antes de moeda: itens são a maioria dos slots', () => {
    const itens = slots.filter((s) => s.tipo === 'item').length;
    expect(itens).toBeGreaterThan(slots.length / 2);
  });

  it('creditoId dos slots de Seeds é determinístico e único', () => {
    const ids = slots.filter((s) => s.tipo === 'seeds').map((s) => (s.tipo === 'seeds' ? s.creditoId : ''));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^passe:t1:(slot-\d+|cofre-d\d+(-\d+)?)$/);
  });

  /**
   * NENHUMA CASA VAZIA — o contrato que o dono pediu em 31/08 ("cada nível entrega algo").
   * A versão anterior deixava 33 das 100 casas vazias, 29 delas nas décadas 6-10, e 8 dos 10
   * marcos ★ eram uma estrela dourada sobre o nada. Este teste é o que impede a regressão:
   * mexer no catálogo sem repor conteúdo reprova aqui, não na tela do usuário.
   */
  it('as 100 casas estão ocupadas — nenhuma vazia', () => {
    const ocupadas = new Set(slots.map((s) => s.slot));
    const vazias = Array.from({ length: 100 }, (_, i) => i + 1).filter((n) => !ocupadas.has(n));
    expect(vazias, `casas vazias: ${vazias.join(', ')}`).toEqual([]);
  });

  it('o marco de cada dezena é o item mais raro da década (a estrela coroa algo)', () => {
    const peso = { comum: 0, raro: 1, epico: 2, lendario: 3 } as const;
    for (let d = 1; d <= 10; d++) {
      const daDecada = slots.filter((s) => s.decada === d && s.tipo === 'item');
      const noMarco = daDecada.filter((s) => s.slot === d * 10);
      expect(noMarco.length, `marco da década ${d} vazio`).toBeGreaterThan(0);
      const maiorDaDecada = Math.max(...daDecada.map((s) => (s.tipo === 'item' ? peso[s.item.raridade] : -1)));
      const noMarcoMax = Math.max(...noMarco.map((s) => (s.tipo === 'item' ? peso[s.item.raridade] : -1)));
      expect(noMarcoMax, `década ${d}: o marco não tem o item mais raro`).toBe(maiorDaDecada);
    }
  });

  it('a moeda é cofre denso, e o total da temporada não inflacionou', () => {
    const seeds = slots.filter((s): s is Extract<(typeof slots)[number], { tipo: 'seeds' }> => s.tipo === 'seeds');
    // Cofre raso é a migalha que o dono reclamou; o piso vale por cofre, não por década.
    for (const s of seeds) expect(s.quantidade, `cofre da década ${s.decada} raso demais`).toBeGreaterThanOrEqual(30);
    // Mesma economia da curva anterior (1.613-1.615): mudou a forma, não a quantidade.
    const total = seeds.reduce((acc, s) => acc + s.quantidade, 0);
    expect(total).toBeGreaterThan(1500);
    expect(total).toBeLessThan(1700);
  });

  it('o layout é determinístico entre chamadas', () => {
    expect(JSON.stringify(slotsDoPasse())).toBe(JSON.stringify(slots));
  });
});

describe('passeNivel e destravamento', () => {
  it('nível 1 com 0% = slot 1; nível 10 com 99% = 100', () => {
    expect(passeNivel(1, 0)).toBe(1);
    expect(passeNivel(10, 99)).toBe(100);
  });

  it('a década N destrava exatamente com o nível N do app (a regra de hoje)', () => {
    const s = slotsDoPasse().find((x) => x.decada === 4)!;
    expect(slotDestravado(s, 3)).toBe(false);
    expect(slotDestravado(s, 4)).toBe(true);
  });
});

describe('fileira Premium', () => {
  it('o passe se paga: devolve MAIS Créditos do que o preço planejado (950)', () => {
    expect(totalPremiumEmCreditos()).toBeGreaterThan(950);
  });

  it('marcos de dezena são variantes; o resto devolve Créditos', () => {
    expect(premiumDoNivel(60).tipo).toBe('variante');
    expect(premiumDoNivel(59).tipo).toBe('creditos');
  });

  it('é determinístico', () => {
    expect(JSON.stringify(premiumDoNivel(37))).toBe(JSON.stringify(premiumDoNivel(37)));
  });
});
