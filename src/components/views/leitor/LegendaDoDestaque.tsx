import '../../../styles/etiquetas.css';

import { Undo2 } from 'lucide-react';

import { t } from '../../../lib/i18n';
import type { EstadoDoDestaque } from './CamadaDeDestaque';

export interface AjustesDoDestaque {
  ligado: boolean;
  mudar: (v: boolean) => void;
  marcarAoPaginar: boolean;
  mudarMarcarAoPaginar: (v: boolean) => void;
  /** Perfil protegido (menor ou idade não declarada): a opção de marcar ao paginar não existe. */
  protegido: boolean;
  estado: EstadoDoDestaque | null;
}

/**
 * O INTERRUPTOR, A LEGENDA E A DENSIDADE do destaque por vocabulário (flag `leitor_destaque_vocab`), no painel de
 * aparência. A legenda tem 3 itens (nova, aprendendo, conhecida); a cor nunca está sozinha (a nova tem fio tracejado, a
 * que está aprendendo, pontilhado). A régua de densidade é a % de palavras novas do capítulo, como a do Word Wise.
 */
export default function LegendaDoDestaque({
  ligado,
  mudar,
  marcarAoPaginar,
  mudarMarcarAoPaginar,
  protegido,
  estado,
}: AjustesDoDestaque) {
  const r = ligado ? estado?.resumo : null;
  return (
    <div className="destaque-legenda" data-testid="legenda-do-destaque">
      <label className="leitor-alternar">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(e) => mudar(e.target.checked)}
          aria-describedby="leitor-destaque-apoio"
        />
        <span>{t('Destacar as palavras pelo seu vocabulário')}</span>
      </label>
      <p id="leitor-destaque-apoio" className="leitor-apoio">
        {t(
          'As palavras novas ganham um grifo mais forte quanto mais aparecem; as que você está aprendendo, um grifo que enfraquece conforme você fixa. Toque numa palavra para dizer o quanto você a conhece.',
        )}
      </p>
      {ligado && (
        <>
          <ul className="destaque-chave" aria-label={t('Legenda do destaque')}>
            <li>
              <span className="destaque-amostra" data-tom="nova" aria-hidden /> {t('Nova')}
            </li>
            <li>
              <span className="destaque-amostra" data-tom="aprendendo" aria-hidden /> {t('Aprendendo')}
            </li>
            <li>
              <span className="destaque-amostra" data-tom="conhecida" aria-hidden /> {t('Conhecida (sem cor)')}
            </li>
          </ul>
          {r && r.total > 0 && (
            <div className="destaque-regua" role="group" aria-label={t('Densidade de palavras novas')}>
              <div
                className="destaque-regua-barra"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={r.porcentagemDeNovas}
                aria-label={t('Palavras novas neste capítulo')}
              >
                <span style={{ width: `${Math.min(100, r.porcentagemDeNovas)}%` }} />
              </div>
              <p className="leitor-apoio">
                {t('Neste capítulo: {novas}% de palavras novas. Você conhece cerca de {conhecidas}%.', {
                  novas: r.porcentagemDeNovas,
                  conhecidas: r.porcentagemDeConhecidas,
                })}
              </p>
            </div>
          )}
          {!protegido && (
            <>
              <label className="leitor-alternar">
                <input
                  type="checkbox"
                  checked={marcarAoPaginar}
                  onChange={(e) => mudarMarcarAoPaginar(e.target.checked)}
                  aria-describedby="leitor-paginar-apoio"
                />
                <span>{t('Virar a página marca como conhecidas as palavras que não toquei')}</span>
              </label>
              <p id="leitor-paginar-apoio" className="leitor-apoio">
                {t(
                  'Só as palavras novas e comuns da página, e nunca as que você tocou. Se você só folheia o livro, deixe desligado: dá para desfazer a última página.',
                )}
              </p>
              {estado?.desfazerPagina && (
                <button type="button" className="btn btn-outline leitor-alvo" onClick={estado.desfazerPagina}>
                  <Undo2 aria-hidden /> {t('Desfazer última página ({n} palavras)', { n: estado.paginadas })}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
