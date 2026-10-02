import { Play, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t, tp } from '../../../../lib/i18n';

/**
 * ENCERRAR A SESSÃO NO META QUEST (maquete de 01/10/2026).
 *
 * O diálogo do computador pede título e capa: digitar com o controle é o que mais cansa no headset.
 * Aqui são três saídas grandes e um único botão principal. A sessão é salva com o título automático
 * ("Captura ao vivo, data e hora"); título e capa continuam editáveis depois, na Biblioteca.
 * Descartar pede confirmação na mesma tela, sem um segundo diálogo por cima.
 */
export default function EncerrarNoQuest({
  resumo,
  nFalas,
  aoContinuar,
  aoSalvar,
  aoDescartar,
}: {
  /** "N falas · mm:ss" */
  resumo: string;
  /** Quantas falas somem se descartar. */
  nFalas: number;
  /** Continuar gravando (também é o que o Esc faz). */
  aoContinuar: () => void;
  aoSalvar: () => void;
  aoDescartar: () => void;
}) {
  const [descartando, setDescartando] = useState(false);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && (descartando ? setDescartando(false) : aoContinuar());
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [descartando, aoContinuar]);

  return (
    <div className="q-mais-fundo" data-testid="encerrar-sessao-no-quest">
      <div className="q-mais" role="dialog" aria-modal="true" aria-label={t('Encerrar a sessão')}>
        <div className="q-cab">
          <div>
            <p className="q-sobre">{resumo}</p>
            <h2>{descartando ? t('Descartar esta captura?') : t('Encerrar a sessão')}</h2>
          </div>
        </div>
        {descartando ? (
          <>
            <p className="q-texto">
              {tp(nFalas, 'A fala desta captura some.', 'As {n} falas desta captura somem.')}{' '}
              {t('Não dá para desfazer.')}
            </p>
            <div className="q-faixa" style={{ margin: 0 }}>
              <button type="button" className="q-ctl pri" onClick={() => setDescartando(false)}>
                {t('Voltar')}
              </button>
              <span className="q-espaco" />
              <button type="button" className="q-ctl" onClick={aoDescartar} data-testid="confirmar-descarte">
                <Trash2 aria-hidden /> {t('Descartar')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="q-texto">
              {t('A sessão vai para a Biblioteca com a data de hoje. O título e a capa podem ser trocados depois.')}
            </p>
            <div className="q-faixa" style={{ margin: 0 }}>
              <button type="button" className="q-ctl pri" onClick={aoSalvar} data-testid="salvar-no-quest">
                <Save aria-hidden /> {t('Salvar')}
              </button>
              <button type="button" className="q-ctl" onClick={aoContinuar}>
                <Play aria-hidden /> {t('Continuar gravando')}
              </button>
              <span className="q-espaco" />
              <button type="button" className="q-ctl" onClick={() => setDescartando(true)}>
                <Trash2 aria-hidden /> {t('Descartar')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
