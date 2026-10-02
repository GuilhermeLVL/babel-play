import { Eye, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ThemeType } from '../../../lib/appearance';
import { tocarPreviaDoEfeito } from '../../../lib/comemoracao';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { lerEstiloDeLegenda } from '../../../lib/estilosDeLegenda';
import { t } from '../../../lib/i18n';
import type { ItemDaLoja } from '../../../lib/loja';
import { lerPeleDeCartao } from '../../../lib/pelesDeCartao';
import { applyTheme } from '../../../lib/theme';
import PreviaDaLegenda from '../../PreviaDaLegenda';
import PreviaDoCartao from '../../PreviaDoCartao';

/**
 * A PRÉVIA AO VIVO DE PERSONALIZAR (recompensas v2, Task 5.4 — spec 10.3).
 *
 * "Ver prévia" numa peça mostra a peça NO LUGAR ONDE ELA APARECE, sem equipar nada:
 *
 *  · legenda → a legenda de exemplo troca de estilo na hora;
 *  · cartão  → o cartão de exemplo veste a pele nos três estados;
 *  · tema    → o app inteiro pinta com o tema, só enquanto a tela está aberta (sair, trocar de
 *              aba do app ou "Parar prévia" devolve o tema equipado);
 *  · efeito  → a rajada da receita toca na própria peça.
 *
 * Nada disso grava: equipar continua sendo o botão "Equipar", pelo caminho único (`equiparItem`).
 */

export const TIPOS_COM_PREVIA: ReadonlySet<string> = new Set([
  'tema',
  'legenda',
  'cartao',
  'efeito-acerto',
  'efeito-combo',
  'finalizacao',
]);

export interface EstadoDaPrevia {
  legenda: string | null;
  cartao: string | null;
  tema: { alvo: string; nome: string } | null;
  /** O id da peça em prévia (o botão dela fica marcado). */
  itemId: string | null;
}

const VAZIA: EstadoDaPrevia = { legenda: null, cartao: null, tema: null, itemId: null };

export function usePreviaAoVivo(temaEquipado: ThemeType) {
  const [previa, setPrevia] = useState<EstadoDaPrevia>(VAZIA);
  const equipado = useRef(temaEquipado);
  equipado.current = temaEquipado;
  const temaEmPrevia = useRef(false);

  const devolverTema = useCallback(() => {
    if (!temaEmPrevia.current) return;
    temaEmPrevia.current = false;
    try {
      applyTheme(equipado.current);
    } catch {
      /* sem DOM */
    }
  }, []);

  // Sair da tela devolve o tema equipado: a prévia nunca sobrevive à tela que a mostrou.
  useEffect(() => devolverTema, [devolverTema]);
  // Equipar um tema durante a prévia: o equipado passa a ser o que vale, e a prévia acaba.
  useEffect(() => {
    temaEmPrevia.current = false;
    setPrevia((p) => (p.tema ? { ...p, tema: null, itemId: null } : p));
  }, [temaEquipado]);

  const prever = useCallback(
    (item: ItemDaLoja, el?: Element | null) => {
      switch (item.tipo) {
        case 'legenda':
          setPrevia((p) => ({ ...p, legenda: item.alvo, itemId: item.id }));
          return;
        case 'cartao':
          setPrevia((p) => ({ ...p, cartao: item.alvo, itemId: item.id }));
          return;
        case 'tema':
          try {
            applyTheme(item.alvo as ThemeType);
            temaEmPrevia.current = true;
          } catch {
            return;
          }
          setPrevia((p) => ({ ...p, tema: { alvo: item.alvo, nome: item.nome }, itemId: item.id }));
          return;
        case 'efeito-acerto':
        case 'efeito-combo':
        case 'finalizacao':
          tocarPreviaDoEfeito(item.tipo, item.alvo, el ?? null);
          setPrevia((p) => ({ ...p, itemId: item.id }));
          return;
        default:
          return;
      }
    },
    [],
  );

  const parar = useCallback(() => {
    devolverTema();
    setPrevia(VAZIA);
  }, [devolverTema]);

  return { previa, prever, parar };
}

/** A faixa do tema em prévia: aparece em qualquer aba enquanto o app está pintado com ele. */
export function FaixaDoTemaEmPrevia({ previa, aoParar }: { previa: EstadoDaPrevia; aoParar: () => void }) {
  const questNovo = useQuestNovo();
  if (!previa.tema) return null;
  // No headset: a faixa de aviso do desenho novo, com a única ação dela num alvo de 60 px.
  if (questNovo)
    return (
      <div className="q-aviso" role="status" data-testid="tema-em-previa">
        <span>{t('Prévia do tema {nome}: só nesta tela, nada foi equipado.', { nome: previa.tema.nome })}</span>
        <button type="button" className="q-ctl" onClick={aoParar}>
          <Undo2 aria-hidden /> {t('Parar prévia')}
        </button>
      </div>
    );
  return (
    <div className="cartao p5 entre" role="status" data-testid="tema-em-previa" style={{ gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
      <span className="linha" style={{ gap: 8 }}>
        <Eye aria-hidden style={{ width: 16, height: 16, color: 'var(--accent-ink)' }} />
        {t('Prévia do tema {nome}: só nesta tela, nada foi equipado.', { nome: previa.tema.nome })}
      </span>
      <button type="button" className="btn btn-outline peq" onClick={aoParar}>
        <Undo2 aria-hidden /> {t('Parar prévia')}
      </button>
    </div>
  );
}

/** A legenda e o cartão de exemplo, vestindo a prévia (ou o que está equipado). */
export default function PainelDePrevia({
  previa,
  aoParar,
  soEmPrevia = false,
}: {
  previa: EstadoDaPrevia;
  aoParar: () => void;
  /** Na Loja: só aparece com uma prévia ativa, e fica presa no topo enquanto a prateleira rola. */
  soEmPrevia?: boolean;
}) {
  const legenda = previa.legenda ?? lerEstiloDeLegenda();
  const cartao = previa.cartao ?? lerPeleDeCartao();
  const emPrevia = !!(previa.legenda || previa.cartao);
  if (soEmPrevia && !emPrevia) return null;
  return (
    <section
      className="cartao p5 secao"
      aria-label={t('Prévia ao vivo')}
      data-testid="painel-de-previa"
      style={{ marginBottom: 14, ...(soEmPrevia ? { position: 'sticky', top: 8, zIndex: 5 } : null) }}
    >
      <div className="entre" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="label-mono">{emPrevia ? t('Prévia ao vivo · nada foi equipado') : t('Como está agora')}</span>
        {emPrevia && (
          <button type="button" className="link" onClick={aoParar}>
            <Undo2 aria-hidden /> {t('Voltar ao equipado')}
          </button>
        )}
      </div>
      <div className="g2" style={{ alignItems: 'center' }}>
        <div data-testid="legenda-de-exemplo" data-estilo={legenda}>
          <PreviaDaLegenda estilo={legenda} />
        </div>
        <div data-testid="cartao-de-exemplo" data-pele={cartao}>
          <PreviaDoCartao pele={cartao} />
        </div>
      </div>
    </section>
  );
}
