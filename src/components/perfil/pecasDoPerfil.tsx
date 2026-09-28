import { Crown, Frame } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ItemDaLoja, Raridade } from '../../lib/loja';

/**
 * AS PEÇAS DE PERFIL DESENHADAS — o anel da moldura e o selo do título, sem saber o que está
 * equipado. `MolduraETitulo` (o que está vestido) e a prévia real do modal de recompensa
 * (`PreviaRealDaPeca`) usam as mesmas: a moldura que a pessoa ganha é a que ela vê no perfil.
 *
 * Mora à parte porque o modal está no grafo de arranque e não deve arrastar a posse (`equipar`).
 */

export const COR_DA_MOLDURA: Record<Raridade, string> = {
  comum: 'var(--border-strong, var(--border-subtle))',
  raro: 'var(--rare)',
  epico: 'var(--epic)',
  lendario: 'var(--warn)',
};

/** O anel na cor da raridade em volta do avatar (ou do ícone `Frame`, sem avatar). */
export function AnelDaMoldura({ item, tamanho = 40, avatar }: { item: ItemDaLoja; tamanho?: number; avatar?: ReactNode }) {
  const cor = COR_DA_MOLDURA[item.raridade];
  return (
    <span
      data-moldura-equipada={item.id}
      title={item.nome}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        border: `3px solid ${cor}`,
        boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px color-mix(in srgb, ${cor} 45%, transparent)`,
        overflow: 'hidden',
        flex: 'none',
      }}
    >
      {avatar ?? <Frame aria-hidden style={{ width: tamanho * 0.5, height: tamanho * 0.5, color: cor }} />}
    </span>
  );
}

/** O título: o `badge` com a coroa. */
export function SeloDoTitulo({ item }: { item: ItemDaLoja }) {
  return (
    <span className="badge warn" data-titulo-equipado={item.id} title={item.desc}>
      <Crown aria-hidden /> {item.nome}
    </span>
  );
}
