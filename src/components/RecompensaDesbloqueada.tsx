/**
 * RECOMPENSA ENTREGUE NA HORA — o modal de resgate.
 *
 * Personalizar v3 (2026-08-28): subir de nível ou fechar uma conquista dava um toast de 6 s;
 * quem estava no meio de um jogo precisava lembrar de ir a Personalizar depois. Agora o que
 * abriu aparece no centro da tela, com "Equipar agora" por item — e NÃO interrompe uma rodada:
 * se há jogo em curso (`document.body[data-jogo-ativo]`), espera `babel:rodada-fechou`.
 *
 * Fila: um evento por vez. `babel.recompensas_vistas` guarda o que já foi mostrado (nível ou
 * conquista) para não repetir em recarga.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Trophy, Check, X, Sprout } from 'lucide-react';
import { COR_DA_RARIDADE, type ItemDaLoja } from '../lib/loja';
import { emojiDoItem } from '../lib/galeria/progressao';
import { TEXTOS } from '../lib/galeria/textos';
import { comemorar, explodirAleatorio } from '../lib/juice';

export type Recompensa =
  | { tipo: 'nivel'; nivel: number; itens: ItemDaLoja[] }
  | { tipo: 'conquista'; id: string; nome: string; emoji: string; seeds: number; xp: number; item?: ItemDaLoja };

export const EVENTO_RODADA_FECHOU = 'babel:rodada-fechou';
const CHAVE_VISTAS = 'babel.recompensas_vistas';

export function chaveDaRecompensa(r: Recompensa): string {
  return r.tipo === 'nivel' ? `nivel:${r.nivel}` : `conquista:${r.id}`;
}
export function recompensasVistas(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_VISTAS) || '[]') as string[]); } catch { return new Set(); }
}
export function marcarVista(r: Recompensa): void {
  try { const v = recompensasVistas(); v.add(chaveDaRecompensa(r)); localStorage.setItem(CHAVE_VISTAS, JSON.stringify([...v].slice(-200))); } catch { /* sem storage */ }
}
/** Há uma rodada de jogo em curso? (Play marca o body enquanto joga.) */
export function jogoAtivo(): boolean {
  return typeof document !== 'undefined' && document.body.hasAttribute('data-jogo-ativo');
}

interface Props {
  fila: Recompensa[];
  /** Equipa pelo caminho único (`equiparItem`); devolve `false` quando não equipa. */
  onEquipar: (item: ItemDaLoja) => boolean;
  /** Tira a recompensa da frente da fila (já marcada como vista aqui). */
  onFechar: (r: Recompensa) => void;
  onVerPersonalizar: () => void;
}

export default function RecompensaDesbloqueada({ fila, onEquipar, onFechar, onVerPersonalizar }: Props) {
  const atual = fila[0] ?? null;
  const [pronta, setPronta] = useState(() => !jogoAtivo());
  const [equipados, setEquipados] = useState<Set<string>>(new Set());

  // Espera a rodada fechar; enquanto isso o modal não existe na tela.
  useEffect(() => {
    if (!atual) return;
    if (!jogoAtivo()) { setPronta(true); return; }
    setPronta(false);
    const ouvir = () => setPronta(true);
    window.addEventListener(EVENTO_RODADA_FECHOU, ouvir);
    return () => window.removeEventListener(EVENTO_RODADA_FECHOU, ouvir);
  }, [atual]);

  useEffect(() => {
    if (!atual || !pronta) return;
    comemorar('subiuNivel', null, { tremer: true });
    explodirAleatorio(3, 'confete');
    setEquipados(new Set());
  }, [atual, pronta]);

  if (!atual || !pronta) return null;

  const itens: ItemDaLoja[] = atual.tipo === 'nivel' ? atual.itens : (atual.item ? [atual.item] : []);
  const fechar = () => { marcarVista(atual); onFechar(atual); };
  const equipar = (i: ItemDaLoja, el: HTMLElement | null) => {
    if (!onEquipar(i)) return;
    setEquipados((s) => new Set(s).add(i.id));
    comemorar('acerto', el, { texto: TEXTOS.emUso });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="recompensa-titulo">
      <div className="card-panel bg-surface w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <span className="w-12 h-12 rounded-2xl bg-warn/15 border border-warn text-warn-ink flex items-center justify-center text-2xl shrink-0" aria-hidden>
            {atual.tipo === 'nivel' ? <Sparkles className="w-6 h-6" /> : atual.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-mono">{atual.tipo === 'nivel' ? 'Subiu de nível' : 'Conquista feita'}</p>
            <h2 id="recompensa-titulo" className="font-display font-black text-2xl text-ink leading-tight">
              {atual.tipo === 'nivel' ? `Nível ${atual.nivel}!` : atual.nome}
            </h2>
            {atual.tipo === 'conquista' && (
              <p className="flex items-center gap-2 text-[12.5px] mt-1 tabular-nums">
                <span className="flex items-center gap-1 font-bold text-good-ink"><Sprout className="w-3.5 h-3.5" aria-hidden /> +{atual.seeds} Seeds</span>
                {atual.xp > 0 && <span className="text-ink-muted">+{atual.xp} XP</span>}
              </p>
            )}
          </div>
          <button onClick={fechar} className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-hover cursor-pointer" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>

        {itens.length > 0 ? (
          <div>
            <p className="text-[12.5px] text-ink-muted mb-2">{atual.tipo === 'nivel' ? 'Você liberou:' : 'Item exclusivo liberado:'}</p>
            <ul className="space-y-2">
              {itens.map((i) => {
                const cor = COR_DA_RARIDADE[i.raridade];
                const equipado = equipados.has(i.id);
                const peca = i.tipo !== 'galeria' && i.tipo !== 'aprimoramento';
                return (
                  <li key={i.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${cor.borda} ${cor.fundo}`}>
                    <span className="text-2xl shrink-0" aria-hidden>{emojiDoItem(i)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[13.5px] text-ink leading-tight truncate">{i.nome}</p>
                      <p className="text-[11.5px] text-ink-muted truncate">{i.desc}</p>
                    </div>
                    {peca ? (
                      <button
                        onClick={(e) => equipar(i, e.currentTarget)}
                        disabled={equipado}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition-colors ${equipado ? 'bg-good-soft text-good-ink' : 'bg-accent text-accent-contrast hover:brightness-110'}`}
                      >
                        {equipado ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {TEXTOS.emUso}</span> : TEXTOS.equiparAgora}
                      </button>
                    ) : (
                      <span className="shrink-0 text-[11px] font-bold text-ink-muted">{TEXTOS.liberado}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">Nada novo para equipar neste nível — o próximo desbloqueio vem aí. <Trophy className="inline w-4 h-4 text-warn" aria-hidden /></p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={fechar} className="flex-1 py-3 rounded-xl bg-accent text-accent-contrast font-bold text-[14px] cursor-pointer hover:brightness-110">{TEXTOS.resgatarEContinuar}</button>
          <button onClick={() => { fechar(); onVerPersonalizar(); }} className="btn-outline justify-center">{TEXTOS.verEmPersonalizar}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
