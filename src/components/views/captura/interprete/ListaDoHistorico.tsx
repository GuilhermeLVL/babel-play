import { ChevronsDown } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import type { Historico, ItemDoHistorico } from '../../../../lib/captura/historicoDoInterprete';
import { t } from '../../../../lib/i18n';
import { type AoOuvirTrecho, TextoTocavel, type TrechoEmLeitura } from './TextoTocavel';

/** A distância do fim, em px, até onde a lista ainda se considera "presa no fim". */
const MARGEM_DO_FIM = 32;

/**
 * A ROLAGEM PRESA NO FIM: a lista acompanha o fim enquanto a pessoa não rolar para cima. Ao rolar, para
 * de acompanhar e conta as falas novas, para o botão "Ir ao fim". `chave` muda a cada fala que entra.
 */
function useRolagemPresa(chave: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [presa, setPresa] = useState(true);
  const [novas, setNovas] = useState(0);
  const presaRef = useRef(true);
  const primeira = useRef(true);

  const aoRolar = () => {
    const el = ref.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < MARGEM_DO_FIM;
    presaRef.current = perto;
    setPresa(perto);
    if (perto) setNovas(0);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (primeira.current) {
      primeira.current = false;
    } else if (!presaRef.current) {
      setNovas((n) => n + 1);
    }
    if (el && presaRef.current) el.scrollTop = el.scrollHeight;
  }, [chave]);
  const irAoFim = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    presaRef.current = true;
    setPresa(true);
    setNovas(0);
  };
  return { ref, presa, novas, aoRolar, irAoFim };
}

/** As ações do ORIGINAL de um item (corrigir e guardar), quando a tela as oferece. */
const donoDoOriginal = (
  item: ItemDoHistorico,
  aoEditar?: (item: ItemDoHistorico) => void,
  aoGuardar?: (item: ItemDoHistorico) => void,
) => ({
  ...(aoEditar ? { aoEditar: () => aoEditar(item) } : {}),
  ...(aoGuardar ? { aoGuardar: () => aoGuardar(item) } : {}),
});

/**
 * A CONVERSA EM BOLHAS (modo de tela "Conversa"): uma lista única, na orientação normal, para quem lê
 * sozinho. O outro à esquerda, quem segura o aparelho à direita; cada bolha traz o que foi dito e a
 * tradução, na ordem da conversa.
 */
export function ConversaEmBolhas({
  historico,
  total,
  aoVerMais,
  idiomaDaFala,
  idiomaDaTraducao,
  mudo,
  lendo,
  aoOuvir,
  fim,
  aoEditar,
  aoGuardar,
  rotulo,
}: {
  historico: Historico;
  total: number;
  /** O idioma que a bolha mostra como etiqueta (conversa virtual com detecção); sem ele, nenhuma. */
  rotulo?: (item: ItemDoHistorico) => string | null;
  aoVerMais: () => void;
  aoEditar?: (item: ItemDoHistorico) => void;
  aoGuardar?: (item: ItemDoHistorico) => void;
  /** O idioma em que a fala foi dita, e o da tradução dela. */
  idiomaDaFala: (item: ItemDoHistorico) => string;
  idiomaDaTraducao: (item: ItemDoHistorico) => string;
  mudo: (lang: string) => boolean;
  lendo: TrechoEmLeitura | null;
  aoOuvir: AoOuvirTrecho;
  fim?: ReactNode;
}) {
  const ultimo = historico.itens.at(-1);
  const chave = `${total}:${ultimo?.id ?? ''}:${ultimo?.traducao ?? ''}`;
  const { ref, presa, novas, aoRolar, irAoFim } = useRolagemPresa(chave);
  return (
    <div
      className="int-bolhas"
      ref={ref}
      onScroll={aoRolar}
      aria-live="polite"
      aria-relevant="additions"
      data-testid="int-bolhas"
    >
      <div className="int-lista">
        {historico.escondidas > 0 && (
          <button type="button" className="int-vermais" onClick={aoVerMais}>
            {t('Ver {n} mais antigas', { n: historico.escondidas })}
          </button>
        )}
        {historico.itens.map((item) => {
          const langFala = idiomaDaFala(item);
          const langTrad = idiomaDaTraducao(item);
          return (
            <div
              key={item.id}
              className="int-bolha"
              data-lado={item.lado}
              data-sem-traducao={(item.lado === 'outro' && !item.traducao && !item.traduzindo) || undefined}
            >
              {rotulo?.(item) && (
                <span className="int-bolha-idioma" data-testid="bolha-idioma">
                  {rotulo(item)}
                </span>
              )}
              <TextoTocavel
                texto={item.original}
                lang={langFala}
                mudo={mudo(langFala)}
                lendo={lendo}
                aoOuvir={aoOuvir}
                className="int-bolha-fala"
                {...donoDoOriginal(item, aoEditar, aoGuardar)}
              />
              {item.traducao && (
                <TextoTocavel
                  texto={item.traducao}
                  lang={langTrad}
                  mudo={mudo(langTrad)}
                  lendo={lendo}
                  aoOuvir={aoOuvir}
                  className="int-bolha-trad"
                />
              )}
              {item.lado === 'outro' && item.traduzindo && <p className="int-bolha-trad">…</p>}
            </div>
          );
        })}
        {fim}
      </div>
      {!presa && (
        <button type="button" className="int-aofim" onClick={irAoFim} data-testid="int-ao-fim">
          <ChevronsDown aria-hidden />
          <span>{t('Ir ao fim')}</span>
          {novas > 0 && <span className="int-aofim-n">{novas}</span>}
        </button>
      )}
    </div>
  );
}
