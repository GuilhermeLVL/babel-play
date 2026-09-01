import { useMemo, useState } from 'react';
import { Lock, Search, ShoppingBag } from 'lucide-react';
import { toast } from '../../Toast';
import { comemorar } from '../../../lib/juice';
import {
  buscarPaletas, todasAsPaletas, ESTILOS, lerPaletaAtiva, gravarPaletaAtiva,
  type EstiloDePaleta, type Paleta,
} from '../../../lib/galeria/paletas';
import { acessoAoEstilo } from '../../../lib/galeria/acesso';
import { applyCustomColors, type ThemeType } from '../../../lib/appearance';

/**
 * AS 200 PALETAS — o produto "troque as quatro cores da tela", agora dentro do editor do TEMA.
 *
 * POR QUE ELE MUDOU DE LUGAR: era uma seção do acordeão "Monte o seu", que ficava embaixo do
 * inventário e repetia, em texto miúdo, escolhas que a grade já fazia. Paleta não é uma peça
 * separada do tema — é o tema em outras cores. Ela pertence ao editor da peça, ao lado do croma:
 * **croma troca só o acento; paleta troca as quatro.** Duas profundidades da mesma pergunta,
 * lado a lado, em vez de em telas diferentes.
 *
 * A PORTA NÃO MUDOU: `acessoAoEstilo` continua sendo quem decide, e está DENTRO do `aplicar` —
 * o `disabled` da grade é cortesia visual; quem garante é este check, que qualquer caminho novo
 * (perfil salvo, atalho, bug de UI) esbarra.
 */
export default function SeletorDePaletas({
  nivel, saldo, setTheme, aoAplicar, onIrParaLoja,
}: {
  nivel: number;
  saldo: number;
  setTheme: (t: ThemeType) => void;
  /** A tela de fora relê o nome do tema no loadout. */
  aoAplicar?: () => void;
  onIrParaLoja?: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [estilo, setEstilo] = useState<EstiloDePaleta | 'todos'>('todos');
  const [ativa, setAtiva] = useState<string | null>(lerPaletaAtiva);
  const paletas = useMemo(() => buscarPaletas(busca, estilo), [busca, estilo]);

  const aplicar = (p: Paleta, el?: HTMLElement | null) => {
    const acesso = acessoAoEstilo(p.estilo, nivel, saldo);
    if (!acesso.liberado) { toast.warn(`Estilo ainda trancado — ${acesso.motivo}.`); return; }
    applyCustomColors({ canvas: p.canvas, surface: p.surface, ink: p.ink, accent: p.accent });
    setTheme('custom');
    gravarPaletaAtiva(p.id);
    setAtiva(p.id);
    if (el) comemorar('acerto', el, { texto: p.nome });
    aoAplicar?.();
  };

  const estiloTrancado = estilo !== 'todos' ? acessoAoEstilo(estilo, nivel, saldo) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="relative flex-1 min-w-[12rem]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar (roxo, oceano, pastel…)"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-canvas border border-border-subtle text-[13px] text-ink outline-none focus:border-accent"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {[{ id: 'todos', nome: 'Todos' }, ...ESTILOS].map((e) => {
            const a = e.id === 'todos' ? null : acessoAoEstilo(e.id as EstiloDePaleta, nivel, saldo);
            return (
              <button
                key={e.id}
                onClick={() => setEstilo(e.id as EstiloDePaleta | 'todos')}
                aria-pressed={estilo === e.id}
                title={!a || a.liberado ? e.nome : a.motivo}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer inline-flex items-center gap-1 ${
                  estilo === e.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'
                }`}
              >
                {a && !a.liberado && <Lock className="w-3 h-3" aria-hidden />}{e.nome}
              </button>
            );
          })}
        </div>
      </div>

      {estiloTrancado && !estiloTrancado.liberado && (
        <p className="mb-2 text-[12.5px] text-ink-muted flex flex-wrap items-center gap-2">
          Estilo <b className="text-ink">{ESTILOS.find((e) => e.id === estilo)?.nome}</b> ainda trancado.
          <span className="inline-flex items-center gap-1.5 text-[11.5px]">
            <Lock className="w-3 h-3" aria-hidden /> {estiloTrancado.motivo}
            {estiloTrancado.item && onIrParaLoja && (
              <button onClick={onIrParaLoja} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border-subtle hover:border-accent text-ink font-bold text-[11px] cursor-pointer">
                <ShoppingBag className="w-3 h-3" aria-hidden /> ver na Loja
              </button>
            )}
          </span>
        </p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[18rem] overflow-y-auto custom-scrollbar pr-1">
        {paletas.map((p) => {
          const a = acessoAoEstilo(p.estilo, nivel, saldo);
          return (
            <button
              key={p.id}
              disabled={!a.liberado}
              onClick={(e) => aplicar(p, e.currentTarget)}
              aria-pressed={ativa === p.id}
              title={a.liberado ? p.nome : `${p.nome} · ${a.motivo}`}
              className={`rounded-xl border-2 overflow-hidden text-left cursor-pointer transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${
                ativa === p.id ? 'border-accent' : 'border-border-subtle hover:border-accent/60'
              }`}
            >
              <span className="block p-2" style={{ backgroundColor: p.canvas }}>
                <span className="block h-1.5 w-2/3 rounded-full mb-1" style={{ backgroundColor: p.ink, opacity: 0.85 }} />
                <span className="block rounded-md p-1 mb-1" style={{ backgroundColor: p.surface }}>
                  <span className="block h-1 w-3/4 rounded-full" style={{ backgroundColor: p.ink, opacity: 0.45 }} />
                </span>
                <span className="block h-2 w-1/2 rounded-full" style={{ backgroundColor: p.accent }} />
              </span>
              <span className="flex items-center justify-between gap-1 px-1.5 py-1 bg-surface">
                <span className="text-[10px] font-bold text-ink truncate">{p.nome}</span>
                {!a.liberado && <Lock className="w-2.5 h-2.5 text-ink-faint shrink-0" aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] text-ink-muted mt-2">
        {todasAsPaletas().length} paletas em {ESTILOS.length} estilos. A paleta troca as quatro
        cores da tela; o croma acima troca só o acento do tema.
      </p>
    </div>
  );
}
