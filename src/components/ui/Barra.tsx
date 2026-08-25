/**
 * BARRA — progresso em faixa, com o rótulo acessível que as versões à mão esqueciam.
 *
 * O DEFEITO QUE ISTO CONSERTA. Três barras de progresso escritas à mão (Hub, lobby, trilha) e só a
 * do Hub declarava `role="progressbar"` com `aria-valuenow`. As outras duas eram duas `<div>`
 * aninhadas com `style={{width}}` — invisíveis para leitor de tela, que anunciava "nada" onde havia
 * a única indicação de quanto falta.
 *
 * O PERCENTUAL É SANEADO AQUI, não em cada chamador. `levelPct` vinha de divisão e já produziu
 * `NaN` (deck vazio → 0/0) e valores acima de 100 (XP creditado depois da subida de nível). Os dois
 * viravam uma faixa desenhada errado, sem erro em lugar nenhum. Agora a faixa nunca sai do trilho e
 * o valor que o leitor de tela anuncia é o mesmo que a tela desenha.
 */

interface BarraProps {
  /** 0 a 100. `NaN`/`Infinity`/fora da faixa são saneados, não propagados. */
  pct: number;
  tom?: 'accent' | 'good' | 'warn' | 'error';
  /** O que a barra mede, para quem não a vê ("Progresso para o nível 34"). Obrigatório. */
  rotuloAcessivel: string;
  tamanho?: 'fina' | 'padrao' | 'grossa';
  className?: string;
}

const ALTURA = { fina: 'h-1.5', padrao: 'h-2.5', grossa: 'h-4' } as const;
const PREENCHIMENTO = {
  accent: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  error: 'bg-error',
} as const;

export default function Barra({
  pct,
  tom = 'accent',
  rotuloAcessivel,
  tamanho = 'padrao',
  className = '',
}: BarraProps) {
  const seguro = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;

  return (
    <div
      className={`${ALTURA[tamanho]} w-full rounded-full bg-surface-hover overflow-hidden border border-border-subtle ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(seguro)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={rotuloAcessivel}
    >
      <div
        className={`h-full ${PREENCHIMENTO[tom]} rounded-full transition-[width] duration-500`}
        style={{ width: `${seguro}%` }}
      />
    </div>
  );
}
