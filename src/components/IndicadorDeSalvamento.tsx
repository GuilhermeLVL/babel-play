import { Loader2, TriangleAlert } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { assinarSalvamento, type EstadoDoSalvamento, lerSalvamento } from '../lib/captura/estadoDoSalvamento';
import { t } from '../lib/i18n';

/**
 * "SALVANDO…" QUE NÃO SEGURA NINGUÉM (relato do dono, 2026-09-28: "encerrar trava e eu fico
 * preso na tela").
 *
 * O salvamento da captura é trabalho do módulo (`lib/captura/trabalhoDeSalvar`) e sobrevive a sair
 * da tela; este indicador, no App, é o que diz a quem saiu que ele continua. Não bloqueia nada: um
 * selo fixo no canto, anunciado com `aria-live`. Falhou longe da captura, ele diz e leva de volta à
 * tela, onde estão as saídas (a captura está no rascunho do navegador).
 */
function rotuloDaEtapa(s: Extract<EstadoDoSalvamento, { fase: 'salvando' }>): string {
  if (s.etapa === 'finais') return t('Salvando a sessão: esperando as últimas falas…');
  if (s.etapa === 'falas')
    return s.total > 0
      ? t('Salvando a sessão: {feitas} de {total} falas…', { feitas: s.feitas, total: s.total })
      : t('Salvando a sessão…');
  if (s.etapa === 'audio') return t('Sessão salva. Enviando o áudio…');
  return t('Sessão salva. Fichando o vocabulário…');
}

export default function IndicadorDeSalvamento({
  naCaptura,
  aoVerCaptura,
}: {
  /** A tela de captura está aberta (lá o próprio aviso mostra a falha, com as saídas). */
  naCaptura: boolean;
  aoVerCaptura: () => void;
}) {
  const s = useSyncExternalStore(assinarSalvamento, lerSalvamento, lerSalvamento);
  if (s.fase === 'salvando') {
    return (
      <div className="indicador-de-salvamento" role="status" aria-live="polite" data-testid="indicador-de-salvamento">
        <Loader2 aria-hidden className="animate-spin" />
        <span>{rotuloDaEtapa(s)}</span>
      </div>
    );
  }
  if (s.fase === 'falhou' && !naCaptura) {
    return (
      <div className="indicador-de-salvamento warn" role="status" aria-live="polite" data-testid="indicador-de-salvamento">
        <TriangleAlert aria-hidden />
        <span>{t('A sessão “{titulo}” não foi salva.', { titulo: s.titulo })}</span>
        <button type="button" className="btn btn-outline peq" onClick={aoVerCaptura}>
          {t('Ver o que fazer')}
        </button>
      </div>
    );
  }
  return null;
}
