import { ThumbsDown } from 'lucide-react';
import { useState } from 'react';

import type { FuncaoComFeedback } from '../core/feedbackDeIa';
import { t } from '../lib/i18n';

/* O cliente chega por `import()` só no clique: quem não avalia não paga o JS. */
const carregarApi = () => import('../data/apiDoFeedback');

/**
 * O 👎 DISCRETO de uma resposta da IA (explicação, resumo, Nuance) — Fase B do plano de qualidade da IA paga.
 *
 * Um toque manda `{ funcao, nota: 'down', motivo: 'nao_ajudou', modelo, nivel }` a `POST /api/ai/feedback` e troca o
 * botão por um agradecimento. Nada da frase ou da resposta sai: só listas fechadas, e por isso o mesmo botão serve a
 * qualquer perfil, inclusive o protegido. Sem oferta, sem pergunta, sem texto para digitar.
 *
 * O aviso fica SEMPRE montado (vazio em repouso): uma região viva que nasce junto com a frase pode não ser lida. É
 * `aria-live` e não `role="status"` de propósito: as telas que o usam já têm o SEU status (o estado do pedido), e
 * um segundo status confundiria quem procura "o" aviso da seção.
 */
export default function NaoAjudou({
  funcao,
  modelo,
  nivel,
  className = 'folha-acao',
}: {
  funcao: FuncaoComFeedback;
  modelo?: string;
  nivel?: 'rapida' | 'nuance' | 'polimento';
  className?: string;
}) {
  const [enviado, setEnviado] = useState(false);

  const avaliar = () => {
    setEnviado(true);
    void carregarApi().then(({ enviarFeedback }) =>
      enviarFeedback({ funcao, nota: 'down', motivo: 'nao_ajudou', modelo, nivel }),
    );
  };

  return (
    <div className="nao-ajudou" style={{ display: 'grid', gap: 4 }}>
      {!enviado && (
        <button type="button" className={className} onClick={avaliar} style={{ justifySelf: 'start', opacity: 0.8 }}>
          <ThumbsDown aria-hidden /> {t('Não ajudou')}
        </button>
      )}
      <p className="folha-status" aria-live="polite" data-testid="aviso-do-feedback" style={{ fontSize: 12 }}>
        {enviado ? t('Obrigado pelo aviso. Ele ajuda a melhorar as respostas.') : ''}
      </p>
    </div>
  );
}
