/**
 * O SOFT GATE — modal contextual que aparece na primeira vez que, sem conta, a pessoa tenta algo
 * que precisa de uma (abrir a biblioteca, importar, usar a IA gerenciada…).
 *
 * Nunca perde o que está na tela: fecha e a pessoa segue onde estava. As três saídas são as do
 * desenho (D10): entrar · criar conta · continuar sem conta.
 */
import { useEffect, useRef } from 'react';
import { Lock, X } from 'lucide-react';

interface GateDeContaProps {
  aberto: boolean;
  /** O que motivou o gate, em linguagem de gente ("Importar do YouTube precisa de conta"). */
  motivo: string;
  onFechar: () => void;
  onEntrar: () => void;
}

export default function GateDeConta({ aberto, motivo, onFechar, onEntrar }: GateDeContaProps) {
  const primeiro = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    primeiro.current?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-conta-titulo"
        className="card-panel bg-surface w-full max-w-md p-6 shadow-card animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-soft text-accent shrink-0">
            <Lock className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="gate-conta-titulo" className="font-display font-bold text-lg text-ink">Isto precisa de conta</h2>
            <p className="mt-1 text-sm text-ink-muted">{motivo}</p>
            <p className="mt-2 text-xs text-ink-faint">Transcrever, traduzir e jogar com a sessão atual continuam livres. O que você já fez neste navegador sobe para a conta quando você entrar.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-ink-muted hover:text-ink cursor-pointer">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="mt-5 grid gap-2">
          <button ref={primeiro} type="button" onClick={onEntrar} className="btn-ink w-full justify-center">Entrar ou criar conta</button>
          <button type="button" onClick={onFechar} className="btn-outline w-full justify-center">Continuar sem conta</button>
        </div>
      </div>
    </div>
  );
}
