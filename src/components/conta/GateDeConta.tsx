/**
 * O SOFT GATE — modal contextual que aparece na primeira vez que, sem conta, a pessoa tenta algo
 * que precisa de uma (abrir a biblioteca, importar, usar a IA gerenciada…).
 *
 * Nunca perde o que está na tela: fecha e a pessoa segue onde estava. As três saídas são as do
 * desenho (D10): entrar · criar conta · continuar sem conta.
 */
import { Lock, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import { usePedacoDoQuest } from './quest/usePedacoDoQuest';

const carregarGateDoQuest = () => import('./quest/GateDeContaDoQuest');

interface GateDeContaProps {
  aberto: boolean;
  /** O que motivou o gate, em linguagem de gente ("Importar do YouTube precisa de conta"). */
  motivo: string;
  onFechar: () => void;
  onEntrar: () => void;
}

export default function GateDeConta({ aberto, motivo, onFechar, onEntrar }: GateDeContaProps) {
  const primeiro = useRef<HTMLButtonElement | null>(null);
  const questNovo = useQuestNovo();
  /* O desenho do headset desce com o app (não só quando o aviso abre), para já estar lá no toque. Se
     não chegar, vale o desenho de sempre: este aviso nunca recarrega a página. */
  const doQuest = usePedacoDoQuest(carregarGateDoQuest, questNovo);

  useEffect(() => {
    if (!aberto) return;
    primeiro.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [aberto, onFechar, doQuest.falhou]);

  if (!aberto) return null;
  /* Edição estática: o mesmo modal, com a verdade dela — não há conta; o recurso está na versão
     completa. Uma saída só, fechar. */
  const semServidor = edicaoEstatica();

  /* QUEST: o mesmo aviso, no centro e com alvos de 60 px. O arquivo desce só no Quest (este
     componente mora no pacote inicial; o CSS do headset fica fora dele). O Esc continua aqui. Enquanto
     o arquivo não chega, uma espera visível (o toque teve resposta); se não chegar, o aviso de sempre. */
  if (questNovo && doQuest.Componente) {
    const GateDeContaDoQuest = doQuest.Componente;
    return <GateDeContaDoQuest motivo={motivo} semServidor={semServidor} onFechar={onFechar} onEntrar={onEntrar} />;
  }
  if (questNovo && !doQuest.falhou)
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onFechar}>
        <p role="status" className="card-panel bg-surface px-6 py-5 text-base font-bold text-ink">
          {t('Carregando…')}
        </p>
      </div>
    );

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
            <h2 id="gate-conta-titulo" className="font-display font-bold text-lg text-ink">
              {semServidor ? t('Disponível na versão completa') : t('Isto precisa de conta')}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{motivo}</p>
            <p className="mt-2 text-xs text-ink-faint">
              {semServidor
                ? t('Transcrever, traduzir e jogar continuam livres nesta edição, tudo no seu navegador.')
                : t(
                    'Transcrever, traduzir e jogar com a sessão atual continuam livres. O que você já fez neste navegador sobe para a conta quando você entrar.',
                  )}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label={t('Fechar')}
            className="text-ink-muted hover:text-ink cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="mt-5 grid gap-2">
          {semServidor ? (
            <button ref={primeiro} type="button" onClick={onFechar} className="btn-ink w-full justify-center">
              {t('Entendi')}
            </button>
          ) : (
            <>
              <button ref={primeiro} type="button" onClick={onEntrar} className="btn-ink w-full justify-center">
                {t('Entrar ou criar conta')}
              </button>
              <button type="button" onClick={onFechar} className="btn-outline w-full justify-center">
                {t('Continuar sem conta')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
