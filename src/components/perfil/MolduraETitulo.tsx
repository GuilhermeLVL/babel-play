import { Crown, Frame } from 'lucide-react';
import type { ReactNode } from 'react';

import { perfilEquipado } from '../../lib/galeria/equipar';
import { t } from '../../lib/i18n';
import { CATALOGO_DA_LOJA, estadoDoItem, type ItemDaLoja, type Raridade } from '../../lib/loja';

/**
 * A MOLDURA E O TÍTULO DE PERFIL EQUIPADOS (recompensas v2, onda 5 — spec 5.2.5).
 *
 * Aparecem no perfil, no cabeçalho do Personalizar e na linha "você" do ranking de adulto. Vêm só de
 * maestria (níveis 3 e 5), do ouro das conquistas e da temporada: nada disso se compra, então o que
 * aparece aqui é o que a pessoa FEZ.
 *
 * O QUE ESTÁ VESTIDO É CONFERIDO NA HORA: o id guardado (`babel.perfil_equipado`) precisa existir no
 * catálogo, ser do tipo certo e continuar liberado pela régua de sempre (`estadoDoItem`). Item que
 * sumiu do catálogo, ou posse que o servidor não confirmou, some da tela sem erro — o perfil volta
 * ao padrão sozinho.
 *
 * O desenho é o do resto do app: a moldura é um anel na cor da raridade em volta do avatar (ou do
 * ícone `Frame`, sem avatar), e o título é um `badge` com a coroa. Sem emoji, sem imagem.
 */

const COR: Record<Raridade, string> = {
  comum: 'var(--border-strong, var(--border-subtle))',
  raro: 'var(--rare)',
  epico: 'var(--epic)',
  lendario: 'var(--warn)',
};

/** O item vestido de um tipo, se ele ainda existe e ainda é seu. */
function vestido(tipo: 'moldura' | 'titulo', id: string | undefined, nivel: number): ItemDaLoja | null {
  if (!id) return null;
  const item = CATALOGO_DA_LOJA.find((i) => i.id === id && i.tipo === tipo);
  if (!item) return null;
  return estadoDoItem(item, nivel, 0).estado === 'equipavel' ? item : null;
}

/** O que está vestido agora, já conferido. */
export function molduraETituloEquipados(nivel = 1): { moldura: ItemDaLoja | null; titulo: ItemDaLoja | null } {
  const guardado = perfilEquipado();
  return { moldura: vestido('moldura', guardado.moldura, nivel), titulo: vestido('titulo', guardado.titulo, nivel) };
}

export default function MolduraETitulo({
  nivel = 1,
  avatar,
  tamanho = 40,
  compacto = false,
}: {
  /** Nível da conta, para a régua de posse. */
  nivel?: number;
  /** O avatar a emoldurar (foto, iniciais). Sem ele, a moldura aparece em volta do ícone. */
  avatar?: ReactNode;
  tamanho?: number;
  /** Na linha do ranking: só o título, pequeno, sem anel. */
  compacto?: boolean;
}) {
  const { moldura, titulo } = molduraETituloEquipados(nivel);
  if (!moldura && !titulo) return null;

  const tituloEl = titulo && (
    <span className="badge warn" data-titulo-equipado={titulo.id} title={titulo.desc}>
      <Crown aria-hidden /> {titulo.nome}
    </span>
  );
  if (compacto) return titulo ? tituloEl : null;

  return (
    <span
      className="linha"
      style={{ gap: 10, flexWrap: 'wrap' }}
      data-testid="moldura-e-titulo"
      aria-label={[moldura && t('Moldura: {nome}', { nome: moldura.nome }), titulo && t('Título: {nome}', { nome: titulo.nome })]
        .filter(Boolean)
        .join(' · ')}
    >
      {moldura && (
        <span
          data-moldura-equipada={moldura.id}
          title={moldura.nome}
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: tamanho,
            height: tamanho,
            borderRadius: '50%',
            border: `3px solid ${COR[moldura.raridade]}`,
            boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px color-mix(in srgb, ${COR[moldura.raridade]} 45%, transparent)`,
            overflow: 'hidden',
            flex: 'none',
          }}
        >
          {avatar ?? <Frame aria-hidden style={{ width: tamanho * 0.5, height: tamanho * 0.5, color: COR[moldura.raridade] }} />}
        </span>
      )}
      {tituloEl}
    </span>
  );
}
