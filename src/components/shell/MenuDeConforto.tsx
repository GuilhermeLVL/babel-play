import { Gauge, Settings2, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * CONFORTO VISUAL — três preferências raras atrás de UM botão (auditoria de UX, 31/08).
 *
 * O QUE ISTO CONSERTA. O cabeçalho tinha oito botões de ícone lado a lado; som, animações e modo
 * desempenho são preferências que a maioria toca UMA vez — e como ícone solto ("faísca"?
 * "velocímetro"?) cada um exigia decifração. Agrupados num popover, o cabeçalho respira e cada
 * opção ganha o que ícone nenhum dá: um RÓTULO por extenso com o estado dito em palavras.
 *
 * O tamanho da fonte NÃO entrou aqui de propósito: é a affordance de acessibilidade mais usada do
 * produto (o perfil sênior existe por causa dela) e merece o acesso de um toque.
 *
 * `fixed` com coordenadas medidas, espelhando `MenuDaConta` (três arquivos ao lado, mesmo motivo):
 * a raiz do app é `overflow-hidden` e um popover `absolute` seria recortado no rail vertical.
 */

interface MenuDeConfortoProps {
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  orientation: 'row' | 'column';
}

function Linha({
  icone,
  rotulo,
  estado,
  ativo,
  onClick,
}: {
  icone: React.ReactNode;
  rotulo: string;
  estado: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={ativo}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink hover:bg-surface-hover cursor-pointer"
    >
      <span className={ativo ? 'text-accent-ink' : 'text-ink-faint'}>{icone}</span>
      <span className="flex-1 text-start font-semibold">{rotulo}</span>
      <span className={`text-[11px] ${ativo ? 'text-accent-ink font-bold' : 'text-ink-faint'}`}>{estado}</span>
    </button>
  );
}

export default function MenuDeConforto(p: MenuDeConfortoProps) {
  const [aberto, setAberto] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (!r) return;
      const LARGURA = 250, ALTURA = 150, FOLGA = 8, MARGEM = 8;
      const cabeAbaixo = window.innerHeight - r.bottom >= ALTURA + FOLGA;
      const top = cabeAbaixo ? r.bottom + FOLGA : Math.max(MARGEM, r.top - ALTURA - FOLGA);
      let left = r.right - LARGURA;
      left = Math.min(left, window.innerWidth - LARGURA - MARGEM);
      left = Math.max(MARGEM, left);
      setCoords({ top, left });
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [aberto, p.orientation]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title="Som, animações e desempenho"
        aria-label="Som, animações e desempenho"
        className="w-9 h-9 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink flex items-center justify-center transition-colors cursor-pointer shrink-0"
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {aberto && coords && createPortal(
        <div
          ref={painel}
          role="menu"
          aria-label="Conforto visual"
          style={{ top: coords.top, left: coords.left, width: 250 }}
          className="fixed z-[60] card-panel bg-surface shadow-card p-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          <Linha
            icone={p.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            rotulo="Sons da interface"
            estado={p.soundEnabled ? 'ligados' : 'desligados'}
            ativo={p.soundEnabled}
            onClick={p.toggleSound}
          />
          <Linha
            icone={<Sparkles className="w-4 h-4" />}
            rotulo="Animações e efeitos"
            estado={p.animationsEnabled ? 'ligadas' : 'desligadas'}
            ativo={p.animationsEnabled}
            onClick={p.toggleAnimations}
          />
          <Linha
            icone={<Gauge className="w-4 h-4" />}
            rotulo="Modo desempenho"
            estado={p.performanceMode ? 'ligado' : 'desligado'}
            ativo={p.performanceMode}
            onClick={p.togglePerformanceMode}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
