/**
 * A LOJA — vitrine gamificada de tudo que se desbloqueia (pedido do dono, 2026-08-27).
 *
 * Três ideias de design, na ordem em que aparecem na tela:
 *   1. O SALDO E O NÍVEL no topo: a loja é o lugar onde o progresso vira coisa — a pessoa
 *      precisa ver o que tem para gastar antes de olhar as prateleiras.
 *   2. "NO PRÓXIMO NÍVEL": a vitrine do que está QUASE na mão — é o motivo de voltar amanhã.
 *   3. PRATELEIRAS COM RARIDADE (comum → lendário, como nas lojas de jogo): borda e selo por
 *      raridade, prévia real (swatches do tema, amostra de partícula ao passar o mouse), e um
 *      botão só por card: Equipado ✓ · Equipar · Obter por N Seeds · cadeado com o caminho.
 *
 * A loja NÃO é um segundo dono da aparência: equipar delega a persistTheme/setParticulas/
 * setMenuPosition — os mesmos caminhos dos Ajustes.
 */
import { useMemo, useState } from 'react';
import { ShoppingBag, Sprout, Lock, Check, Sparkles, Palette, Type, Gamepad2, PanelRight, Wand2 } from 'lucide-react';
import {
  CATALOGO_DA_LOJA, COR_DA_RARIDADE, estadoDoItem, marcarPosse, vitrineDoProximoNivel, type ItemDaLoja,
} from '../../lib/loja';
import { gastarSeeds } from '../../data/api';
import { toast } from '../Toast';
import { comemorar, explodirAleatorio } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { setParticulas, readParticulas } from '../../lib/particulas';
import type { ThemeType, FonteType } from '../../lib/appearance';
import type { MenuPositionType } from '../shell/navItems';
import type { DerivedProgress } from '../../lib/progress';

interface LojaProps {
  progress: DerivedProgress;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
}

const ICONE_DO_TIPO: Record<string, React.ReactNode> = {
  tema: <Palette className="w-3.5 h-3.5" />,
  fonte: <Type className="w-3.5 h-3.5" />,
  particulas: <Sparkles className="w-3.5 h-3.5" />,
  posicao: <PanelRight className="w-3.5 h-3.5" />,
  estudio: <Wand2 className="w-3.5 h-3.5" />,
};

const FILTROS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'tema', nome: 'Temas' },
  { id: 'particulas', nome: 'Partículas' },
  { id: 'posicao', nome: 'Layout' },
  { id: 'estudio', nome: 'Estúdio' },
] as const;

export default function Loja({ progress, theme, setTheme, fonte, setFonte, menuPosition, setMenuPosition, onOpenStudio }: LojaProps) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('tudo');
  const [comprando, setComprando] = useState<string | null>(null);
  const [, force] = useState(0);
  const nivel = progress.available ? progress.level : 1;
  const saldo = progress.available ? progress.seeds : 0;

  const itens = useMemo(
    () => CATALOGO_DA_LOJA.filter((i) => filtro === 'tudo' || i.tipo === filtro),
    [filtro],
  );
  const vitrine = vitrineDoProximoNivel(nivel);

  const equipadoAtual = (item: ItemDaLoja): boolean => {
    if (item.tipo === 'tema') return theme === item.alvo;
    if (item.tipo === 'fonte') return fonte === item.alvo;
    if (item.tipo === 'particulas') return readParticulas() === item.alvo;
    if (item.tipo === 'posicao') return menuPosition === item.alvo;
    return false;
  };

  const equipar = (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.tipo === 'tema') setTheme(item.alvo as ThemeType);
    else if (item.tipo === 'fonte') setFonte(item.alvo as FonteType);
    else if (item.tipo === 'particulas') { setParticulas(item.alvo as never); force((n) => n + 1); }
    else if (item.tipo === 'posicao') setMenuPosition(item.alvo as MenuPositionType);
    else if (item.tipo === 'estudio') { onOpenStudio(); return; }
    comemorar('acerto', el, { texto: 'Equipado!' });
  };

  const comprar = async (item: ItemDaLoja, el: HTMLElement | null) => {
    if (item.precoSeeds === undefined) return;
    setComprando(item.id);
    try {
      // spendId fixo por item: comprar de novo (retry, aba duplicada) NÃO cobra de novo.
      const r = await gastarSeeds({ spendId: `loja-${item.id}`, amount: item.precoSeeds, reason: `loja:${item.id}` });
      if (r && (r as { ok?: boolean }).ok === false) {
        toast.warn('Não deu para completar a compra agora. Tente de novo.');
        return;
      }
      marcarPosse(item.id);
      comemorar('subiuNivel', el, { texto: 'Seu!' });
      explodirAleatorio(3, 'confete');
      toast.ok(`${item.nome} é seu! Já pode equipar.`);
      force((n) => n + 1);
    } catch {
      toast.warn('Não deu para completar a compra agora. Tente de novo.');
    } finally {
      setComprando(null);
    }
  };

  return (
    <div className="flex-1 h-full min-h-0 overflow-y-auto custom-scrollbar" aria-label="Loja">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* ── TOPO: saldo, nível, e a promessa da tela ── */}
      <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface px-6 py-8 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="sobre-blob absolute -top-14 right-8 w-56 h-56 rounded-full bg-warn/20 blur-3xl" />
          <span className="sobre-blob sobre-blob-2 absolute -bottom-16 -left-8 w-64 h-64 rounded-full bg-accent/15 blur-3xl" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
          <div>
            <p className="label-mono mb-1.5">Loja & desbloqueios</p>
            <h1 className="font-marca font-bold text-2xl sm:text-3xl text-ink tracking-tight flex items-center gap-2.5">
              <ShoppingBag className="w-7 h-7 text-accent" /> Tudo que dá para conquistar
            </h1>
            <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-xl">
              Cada nível libera itens de graça. As <b className="text-ink">Seeds</b> que você ganha
              estudando compram o atalho de quem não quer esperar.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="card-panel bg-canvas px-4 py-3 text-center min-w-[92px]">
              <p className="font-display font-black text-2xl text-ink tabular-nums">{nivel}</p>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">nível</p>
            </div>
            <div className="card-panel bg-canvas px-4 py-3 text-center min-w-[92px]">
              <p className="flex items-center justify-center gap-1 font-display font-black text-2xl text-good tabular-nums">
                <Sprout className="w-5 h-5" aria-hidden /> {saldo}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">seeds</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── NO PRÓXIMO NÍVEL: o motivo de continuar ── */}
      {vitrine.length > 0 && (
        <section className="card-panel bg-canvas border-accent/30 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[12px] font-black uppercase tracking-wider text-accent-ink mb-3">
            <Sparkles className="w-4 h-4" /> No nível {vitrine[0].nivel} você libera
          </p>
          <div className="flex flex-wrap gap-2">
            {vitrine.map((i) => (
              <span key={i.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[12.5px] font-bold text-ink ${COR_DA_RARIDADE[i.raridade].borda} ${COR_DA_RARIDADE[i.raridade].fundo}`}>
                {ICONE_DO_TIPO[i.tipo]} {i.nome}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── FILTROS ── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-4 py-2 rounded-xl text-[12.5px] font-bold cursor-pointer border transition-colors ${
              filtro === f.id ? 'bg-accent text-accent-contrast border-accent' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-accent'
            }`}
          >
            {f.nome}
          </button>
        ))}
      </div>

      {/* ── PRATELEIRAS ── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {itens.map((item) => {
          const { estado, motivo } = estadoDoItem(item, nivel, saldo);
          const raridade = COR_DA_RARIDADE[item.raridade];
          const equipado = estado === 'equipavel' && equipadoAtual(item);
          return (
            <div
              key={item.id}
              className={`card-panel overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-card border-2 ${raridade.borda} ${estado === 'bloqueado' ? 'opacity-80' : ''}`}
              onMouseEnter={(e) => {
                // Prévia VIVA: partículas soltam uma amostra ao passar o mouse no card delas.
                if (item.tipo === 'particulas' && estado !== 'bloqueado') {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  emitBurst(r.left + r.width / 2, r.top + r.height / 3, 'xp');
                }
              }}
            >
              {/* Prévia */}
              <div className={`h-24 flex items-center justify-center gap-2 ${raridade.fundo} border-b ${raridade.borda}`}>
                {item.previa ? (
                  <span className="flex -space-x-1.5">
                    {item.previa.map((c, i) => (
                      <span key={i} className="w-9 h-9 rounded-full border-2 border-surface shadow-sm shrink-0" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                ) : item.tipo === 'particulas' ? (
                  <span className="font-display font-black text-3xl select-none" aria-hidden>
                    {item.alvo === 'coracoes' ? '💛🧡❤️' : item.alvo === 'estrelas' ? '⭐✨🌟' : item.alvo === 'confete' ? '🎊🎉' : '🟧🟨🟩'}
                  </span>
                ) : item.tipo === 'estudio' ? (
                  <Wand2 className="w-10 h-10 text-warn" aria-hidden />
                ) : (
                  <Gamepad2 className="w-10 h-10 text-ink-muted" aria-hidden />
                )}
              </div>

              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-[14px] text-ink leading-tight">{item.nome}</h3>
                  <span className={`shrink-0 text-[9.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${raridade.borda} ${raridade.fundo} text-ink`}>{raridade.rotulo}</span>
                </div>
                <p className="text-[12px] text-ink-muted leading-snug flex-1">{item.desc}</p>

                {estado === 'equipavel' ? (
                  <button
                    onClick={(e) => equipar(item, e.currentTarget)}
                    disabled={equipado}
                    className={`w-full py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer ${
                      equipado ? 'bg-good-soft text-good-ink cursor-default' : 'bg-accent hover:bg-accent-ink text-white shadow-btn'
                    }`}
                  >
                    {equipado ? <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Equipado</span> : item.tipo === 'estudio' ? 'Abrir o Estúdio' : 'Equipar'}
                  </button>
                ) : estado === 'compravel' ? (
                  <button
                    onClick={(e) => void comprar(item, e.currentTarget)}
                    disabled={comprando === item.id}
                    className="w-full py-2.5 rounded-xl bg-good hover:brightness-110 text-white font-bold text-[13px] shadow-btn transition-all cursor-pointer disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sprout className="w-4 h-4" /> {comprando === item.id ? 'Comprando…' : `Obter por ${item.precoSeeds} Seeds`}
                    </span>
                  </button>
                ) : (
                  <div className="w-full py-2.5 rounded-xl bg-canvas border border-border-subtle text-center text-[12.5px] font-bold text-ink-muted">
                    <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {motivo}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11.5px] text-ink-faint pb-4">
        Seeds se ganham estudando: 1 por palavra capturada, 4 por revisão certa. Nada aqui custa dinheiro.
      </p>
    </div>
    </div>
  );
}
