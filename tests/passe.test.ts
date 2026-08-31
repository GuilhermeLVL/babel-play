/**
 * PASSE DE TEMPORADA (spec personalizar-v4) — os contratos:
 * 1. O passe é uma LENTE: slot da década N destrava com nível N — nada muda na economia.
 * 2. TODO item não-exclusivo do catálogo aparece exatamente UMA vez, na década do seu nível
 *    (conteúdo antes de moeda — o feedback "passe fraco" não pode regredir).
 * 3. Exclusivo de conquista NUNCA entra no passe.
 * 4. Slots de Seeds têm creditoId determinístico (idempotência no servidor).
 */
import { describe, it, expect } from 'vitest';
import { slotsDoPasse, passeNivel, slotDestravado } from '../src/lib/galeria/passe';
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
    expect(ids[0]).toMatch(/^passe:t1:slot-\d+$/);
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
