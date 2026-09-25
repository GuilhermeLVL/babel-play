import { Sparkles, X } from 'lucide-react';
import { useState } from 'react';

import { menorPrecoDeAssinatura } from '../core/planos';
import { getEntitlements } from '../lib/entitlements';
import { t } from '../lib/i18n';
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
 *  - Dispensável: o X grava em localStorage e o card não volta — anúncio que reaparece depois
 *    de dispensado é exatamente o padrão hostil que o registro de produto proíbe. A variante de
 *    armazenamento (>90%) tem dispensa PRÓPRIA com teto de frequência (7 dias) e "Não mostrar
 *    novamente" (Fase 8).
 *  - O preço vem da PLAN_MATRIX (menor plano de assinatura), nunca escrito à mão.
 */

const CHAVE_DISPENSA = 'babel.card_planos_dispensado';
/** Quando o card foi dispensado pela última vez (ms), em qualquer das duas variantes. */
const CHAVE_DISPENSADO_EM = 'babel.card_planos_dispensado_em';
/** "Não mostrar novamente" do aviso de armazenamento — permanente. */
const CHAVE_NUNCA_DA_COTA = 'babel.card_planos_cota_nunca';
/** O aviso de armazenamento volta, no máximo, uma vez a cada 7 dias depois de dispensado. */
export const INTERVALO_DO_AVISO_DE_COTA_MS = 7 * 24 * 60 * 60_000;

function lerNumero(chave: string): number | null {
  const v = Number(readStoredValue(chave));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/* `menorPreco` mudou para `core/planos.ts` (mudança vender-onde-se-ve): três telas o
   calculavam, e preço calculado em três lugares é preço que diverge em três lugares. */

/** `true` quando o usuário atual deve ver material de planos (Grátis ou anônimo). */
export function planoAnunciavel(): boolean {
  const plan = getEntitlements().plan;
  return plan === 'free' || plan === 'anonimo';
}

export default function CardDePlanos({ onVerPlanos }: { onVerPlanos: () => void }) {
  const [dispensado, setDispensado] = useState(() => readStoredValue(CHAVE_DISPENSA) === '1');
  const [cotaDispensadaEm, setCotaDispensadaEm] = useState(() => lerNumero(CHAVE_DISPENSADO_EM));
  const [cotaNunca, setCotaNunca] = useState(() => readStoredValue(CHAVE_NUNCA_DA_COTA) === '1');
  const preco = menorPrecoDeAssinatura();
  /* Quota de armazenamento estourando (>90%) é o momento em que o upgrade deixa de ser anúncio e
     vira solução — o card fala do problema real mesmo para quem dispensou o anúncio comum. Mas a
     dispensa É RESPEITADA (Fase 8): depois de qualquer dispensa, o aviso de armazenamento volta no
     máximo uma vez a cada 7 dias, e "Não mostrar novamente" o cala para sempre. Antes ele ignorava a dispensa e
     reaparecia a cada abertura do Hub. */
  const arm = getEntitlements().armazenamento;
  const quotaApertada = !!arm && arm.teto !== null && arm.teto > 0 && arm.usados / arm.teto > 0.9;
  const cotaEmSilencio =
    cotaNunca || (cotaDispensadaEm !== null && Date.now() - cotaDispensadaEm < INTERVALO_DO_AVISO_DE_COTA_MS);
  const oculto = quotaApertada ? cotaEmSilencio : dispensado;
  if (oculto || !planoAnunciavel() || !preco) return null;

  const gravar = (chave: string, valor: string) => {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      /* aba privada: some só nesta sessão */
    }
  };
  /* Toda dispensa marca a hora: é ela que o teto de 7 dias do aviso de armazenamento respeita —
     quem acabou de dispensar o anúncio comum não é cobrado pelo de armazenamento no dia seguinte. */
  const dispensar = () => {
    const agora = Date.now();
    gravar(CHAVE_DISPENSADO_EM, String(agora));
    setCotaDispensadaEm(agora);
    if (quotaApertada) return;
    gravar(CHAVE_DISPENSA, '1');
    setDispensado(true);
  };

  return (
    <div
      data-testid="card-de-planos"
      className="card-panel bg-accent-soft/30 border-accent/30 px-4 py-3 mb-8 flex items-center gap-3"
    >
      <Sparkles className="w-4 h-4 text-accent-ink shrink-0" aria-hidden />
      <p className="text-[13px] text-ink flex-1 min-w-0">
        {quotaApertada ? (
          <>
            Seu armazenamento passou de 90%. Os planos pagos (a partir de <strong>R$ {preco}/mês</strong>) dão mais
            espaço — ou apague sessões antigas.
          </>
        ) : (
          <>
            <strong>Planos a partir de R$ {preco}/mês</strong> — tradução com IA de nuvem e mais armazenamento. Você
            está no Grátis, que continua inteiro.
          </>
        )}
      </p>
      <button onClick={onVerPlanos} className="btn-outline shrink-0">
        Ver planos
      </button>
      {quotaApertada && (
        <button
          type="button"
          className="link text-[12px] shrink-0"
          onClick={() => {
            gravar(CHAVE_NUNCA_DA_COTA, '1');
            setCotaNunca(true);
          }}
        >
          {t('Não mostrar novamente')}
        </button>
      )}
      <button
        onClick={dispensar}
        aria-label="Dispensar este aviso de planos"
        title="Dispensar"
        className="w-7 h-7 rounded-lg text-ink-faint hover:bg-surface-hover hover:text-ink flex items-center justify-center cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}
