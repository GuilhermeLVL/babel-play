import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { menorPrecoDeAssinatura } from '../core/planos';
import { getEntitlements } from '../lib/entitlements';
import { EDICAO_LEVE } from '../lib/edicao';
import { readStoredValue } from '../lib/profile';

/**
 * CARD DE PLANOS — a peça de descobribilidade que faltava (spec planos-visiveis).
 *
 * O PROBLEMA: a tela de Planos existia atrás do menu do avatar e nem o dono a achou. A linha
 * discreta que a auditoria de UX acrescentou ao Hub informava, mas não tinha o peso que "toda
 * aplicação" dá a isso — a queixa literal do dono (31/08).
 *
 * AS REGRAS, todas aqui dentro para nenhum chamador esquecer uma:
 *  - Só para quem está no Grátis ou sem conta. Assinante e self-host NUNCA veem anúncio.
 *  - Nunca na edição leve (não há o que vender lá).
 *  - Dispensável: o X grava em localStorage e o card não volta — anúncio que reaparece depois
 *    de dispensado é exatamente o padrão hostil que o registro de produto proíbe.
 *  - O preço vem da PLAN_MATRIX (menor plano de assinatura), nunca escrito à mão.
 */

const CHAVE_DISPENSA = 'babel.card_planos_dispensado';

/* `menorPreco` mudou para `core/planos.ts` (mudança vender-onde-se-ve): três telas o
   calculavam, e preço calculado em três lugares é preço que diverge em três lugares. */

/** `true` quando o usuário atual deve ver material de planos (Grátis/anônimo, fora da leve). */
export function planoAnunciavel(): boolean {
  if (EDICAO_LEVE) return false;
  const plan = getEntitlements().plan;
  return plan === 'free' || plan === 'anonimo';
}

export default function CardDePlanos({ onVerPlanos }: { onVerPlanos: () => void }) {
  const [dispensado, setDispensado] = useState(() => readStoredValue(CHAVE_DISPENSA) === '1');
  const preco = menorPrecoDeAssinatura();
  /* Quota de armazenamento estourando (>90%) é o momento em que o upgrade deixa de ser anúncio e
     vira solução — nesse caso o card fala do problema real e IGNORA a dispensa (o aviso de quota
     é operacional, não marketing). */
  const arm = getEntitlements().armazenamento;
  const quotaApertada = !!arm && arm.teto !== null && arm.teto > 0 && arm.usados / arm.teto > 0.9;
  if ((dispensado && !quotaApertada) || !planoAnunciavel() || !preco) return null;

  return (
    <div
      data-testid="card-de-planos"
      className="card-panel bg-accent-soft/30 border-accent/30 px-4 py-3 mb-8 flex items-center gap-3"
    >
      <Sparkles className="w-4 h-4 text-accent-ink shrink-0" aria-hidden />
      <p className="text-[13px] text-ink flex-1 min-w-0">
        {quotaApertada
          ? <>Seu armazenamento passou de 90%. Os planos pagos (a partir de <strong>R$ {preco}/mês</strong>) dão mais espaço — ou apague sessões antigas.</>
          : <><strong>Planos a partir de R$ {preco}/mês</strong> — tradução com IA de nuvem e mais armazenamento. Você está no Grátis, que continua inteiro.</>}
      </p>
      <button onClick={onVerPlanos} className="btn-outline shrink-0">
        Ver planos
      </button>
      <button
        onClick={() => {
          try { localStorage.setItem(CHAVE_DISPENSA, '1'); } catch { /* aba privada: some só nesta sessão */ }
          setDispensado(true);
        }}
        aria-label="Dispensar este aviso de planos"
        title="Dispensar"
        className="w-7 h-7 rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink flex items-center justify-center cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}
