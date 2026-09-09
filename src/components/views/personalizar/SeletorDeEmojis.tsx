import { Lock, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

import { acessoACategoria, acessoAoCursorDeEmoji } from '../../../lib/galeria/acesso';
import { CATEGORIAS_DE_EMOJI, todosOsEmojis } from '../../../lib/galeria/emojis';

/**
 * O SELETOR DE EMOJIS — categorias com cadeado + a grade.
 *
 * ELE SAIU DO ACORDEÃO E VIROU ARQUIVO PRÓPRIO porque três editores diferentes precisam dele
 * (pack de partículas, cursor de emoji, rastro de emojis) e cada um abre no contexto da sua
 * peça. Enquanto vivia dentro de `Personalizar`, era uma função declarada no corpo do componente:
 * remontava a cada render e não dava para chamar de lugar nenhum.
 *
 * A RÉGUA DE ACESSO NÃO MUDOU: categoria trancada mostra o motivo e o caminho, nunca some.
 */
export default function SeletorDeEmojis({
  nivel, saldo, selecionados, aoTocar, aoAdicionarCategoria, onIrParaLoja,
}: {
  nivel: number;
  saldo: number;
  selecionados: ReadonlySet<string>;
  aoTocar: (emoji: string) => void;
  aoAdicionarCategoria?: (emojis: string[]) => void;
  onIrParaLoja?: () => void;
}) {
  const [cat, setCat] = useState(CATEGORIAS_DE_EMOJI[0].id);
  const [q, setQ] = useState('');
  const categoria = CATEGORIAS_DE_EMOJI.find((c) => c.id === cat)!;
  const acesso = acessoACategoria(cat, nivel, saldo);
  const lista = q.trim() ? todosOsEmojis().filter((e) => e.includes(q.trim())) : categoria.emojis;

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {CATEGORIAS_DE_EMOJI.map((c) => {
          const a = acessoACategoria(c.id, nivel, saldo);
          return (
            <button
              key={c.id}
              onClick={() => { setCat(c.id); setQ(''); }}
              aria-pressed={cat === c.id && !q}
              title={a.liberado ? c.nome : a.motivo}
              className={`px-2 py-1 rounded-lg text-[11.5px] font-bold border cursor-pointer inline-flex items-center gap-1 ${
                cat === c.id && !q ? 'bg-ink text-ink-contrast border-ink' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'
              } ${a.liberado ? '' : 'opacity-70'}`}
            >
              {!a.liberado && <Lock className="w-3 h-3" aria-hidden />}{c.emojis[0]} {c.nome}
            </button>
          );
        })}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="colar emoji"
          className="w-28 px-2 py-1 rounded-lg bg-canvas border border-border-subtle text-[11.5px] text-ink outline-none focus:border-accent"
        />
      </div>

      {!q && !acesso.liberado ? (
        <div className="p-3 rounded-xl bg-canvas border border-border-subtle text-[12.5px] text-ink-muted flex flex-wrap items-center gap-2">
          <span className="text-2xl" aria-hidden>{categoria.emojis.slice(0, 6).join(' ')}</span>
          <span className="flex-1 min-w-[12rem]"><b className="text-ink">{categoria.nome}</b> ainda não está liberada.</span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <Lock className="w-3 h-3" aria-hidden /> {acesso.motivo}
            {acesso.item && onIrParaLoja && (
              <button onClick={onIrParaLoja} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border-subtle hover:border-accent text-ink font-bold text-[11px] cursor-pointer">
                <ShoppingBag className="w-3 h-3" aria-hidden /> ver na Loja
              </button>
            )}
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto custom-scrollbar">
            {lista.map((e) => {
              const dentro = selecionados.has(e);
              /* Emoji colado FORA do catálogo caía em categoria '' → item undefined → liberado
                 (brecha B3). Fora do catálogo agora é o produto "qualquer emoji" (o item do
                 cursor de emoji), nunca liberado por ausência. */
              const catDoEmoji = CATEGORIAS_DE_EMOJI.find((c) => c.emojis.includes(e))?.id;
              const aE = q ? (catDoEmoji ? acessoACategoria(catDoEmoji, nivel, saldo) : acessoAoCursorDeEmoji(nivel, saldo)) : acesso;
              return (
                <button
                  key={e}
                  disabled={!aE.liberado}
                  onClick={() => aoTocar(e)}
                  aria-pressed={dentro}
                  title={aE.liberado ? e : aE.motivo}
                  className={`w-9 h-9 rounded-lg text-xl border cursor-pointer transition-transform hover:scale-110 disabled:opacity-40 disabled:cursor-not-allowed ${
                    dentro ? 'bg-accent-soft border-accent' : 'bg-canvas border-border-subtle'
                  }`}
                >
                  {e}
                </button>
              );
            })}
          </div>
          {aoAdicionarCategoria && !q && (
            <button
              onClick={() => aoAdicionarCategoria(categoria.emojis)}
              className="mt-2 text-[11.5px] font-semibold text-accent-ink hover:underline cursor-pointer"
            >
              + adicionar {categoria.nome} inteira
            </button>
          )}
        </>
      )}
    </div>
  );
}
