import type { Grade } from '@core';
import { ROTULO_DA_NOTA } from '@core';

/**
 * AS TRÊS NOTAS DE UM ACERTO — Difícil · Bom · Fácil, com o intervalo que cada uma compra.
 *
 * É a metade visível do modelo híbrido (D-006): só aparece depois de uma resposta CERTA, com a
 * nota derivada pré-selecionada, e "Avançar" (do chamador) confirma o que estiver marcado. Um grupo
 * de rádio de verdade (`role="radiogroup"` + `role="radio"` + `aria-checked`), porque é uma escolha
 * exclusiva — e porque o leitor de tela precisa anunciar "Bom, selecionado, 2 de 3", não três botões.
 *
 * Os intervalos vêm de `previsaoDosBotoes` (o agendador real com o estado deste cartão), nunca de
 * string fixa — foi assim que "10m/1.2d/3.5d/8d" ficou anos errado no JSX.
 */
interface NotaDeRevisaoProps {
  opcoes: readonly Grade[];
  selecionada: Grade;
  aoEscolher: (nota: Grade) => void;
  /** Intervalo previsto por nota, já formatado ("3 d", "2 sem"). */
  previsao: Record<Grade, string> | null;
}

const TOM: Record<Grade, string> = {
  1: 'bg-error-soft text-error-ink border-error-soft',
  2: 'bg-warn-soft text-warn-ink border-warn-soft',
  3: 'bg-accent-soft text-accent-ink border-accent-soft',
  4: 'bg-good-soft text-good-ink border-good-soft',
};

export default function NotaDeRevisao({ opcoes, selecionada, aoEscolher, previsao }: NotaDeRevisaoProps) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wider text-center">Como foi lembrar?</p>
      <div role="radiogroup" aria-label="Nota da revisão" className="grid grid-cols-3 gap-2">
        {opcoes.map((nota) => {
          const ativa = nota === selecionada;
          return (
            <button
              key={nota}
              type="button"
              role="radio"
              aria-checked={ativa}
              onClick={() => aoEscolher(nota)}
              className={`p-2.5 rounded-xl border-2 text-center flex flex-col items-center justify-center min-h-[64px] cursor-pointer transition-colors ${
                ativa ? TOM[nota] : 'border-border-subtle bg-surface text-ink-muted hover:border-ink hover:text-ink'
              }`}
            >
              <span className="font-extrabold text-[12.5px]">{ROTULO_DA_NOTA[nota]}</span>
              <span className="text-[10px] font-mono mt-1 opacity-80">{previsao?.[nota] ?? '—'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
