import { Gamepad2, Layers, Library, Mic } from 'lucide-react';

import { t, tp } from '../../../../lib/i18n';

/**
 * O RESUMO AO ENCERRAR, NO META QUEST (maquete de 01/10/2026).
 *
 * No lugar de abrir a Análise (uma tela densa, de computador), a sessão salva vira três números e
 * uma faixa de saídas. O botão principal é ESTUDAR o que acabou de ser gravado; nunca comprar. Quando
 * parte da sessão foi legendada no aparelho porque a cota da nuvem acabou, a tela diz isso com o
 * número de verdade, numa linha, sem botão.
 */
export default function ResumoDaSessaoNoQuest({
  minutos,
  falas,
  palavras,
  falasNaNuvem,
  falasNoAparelho,
  semConta = false,
  aoRevisar,
  aoJogar,
  aoAbrir,
  aoNovaCaptura,
}: {
  minutos: number;
  falas: number;
  /** Palavras novas fichadas; `null` enquanto o vocabulário ainda está sendo fichado. */
  palavras: number | null;
  /** Falas transcritas pela nuvem do site e no próprio aparelho (medidor da sessão). */
  falasNaNuvem: number;
  falasNoAparelho: number;
  /**
   * Sem conta (e no site sem servidor), a revisão e a sessão salva abrem só o cartão "isto precisa de
   * conta": o resumo oferece o que funciona, que é jogar com a sessão que acabou de ser gravada.
   */
  semConta?: boolean;
  aoRevisar: () => void;
  aoJogar: () => void;
  aoAbrir: () => void;
  aoNovaCaptura: () => void;
}) {
  const temPalavras = !!palavras && palavras > 0;
  /** Sem conta, o vocabulário não é fichado: o número de palavras não aparece. */
  const semPalavras = semConta && palavras == null;
  return (
    <div className="q-palco" data-testid="resumo-da-sessao-no-quest">
      <div className="q-cab">
        <div>
          <p className="q-sobre">{t('Sessão salva')}</p>
          <h1>
            {tp(minutos, '{n} minuto', '{n} minutos')}, {tp(falas, '{n} fala', '{n} falas')}
          </h1>
        </div>
      </div>

      <div className={semPalavras ? 'q-grade g2' : 'q-grade g3'}>
        {!semPalavras && (
          <div className="q-num">
            <b>{palavras == null ? '…' : palavras}</b>
            <span>{palavras == null ? t('guardando as palavras novas') : t('palavras novas')}</span>
          </div>
        )}
        <div className="q-num">
          <b>{falasNaNuvem}</b>
          <span>{t('falas legendadas pela nuvem')}</span>
        </div>
        <div className="q-num">
          <b>{falasNoAparelho}</b>
          <span>{t('falas legendadas no headset')}</span>
        </div>
      </div>

      {falasNaNuvem > 0 && falasNoAparelho > 0 && (
        <div className="q-aviso" role="note">
          <span>
            {t('A nuvem cobre 15 min por dia. O resto desta sessão foi legendado no headset, um pouco mais lento.')}
          </span>
        </div>
      )}

      {semConta ? (
        <div className="q-faixa">
          <button type="button" className="q-ctl pri" onClick={aoJogar} data-testid="jogar-com-a-sessao">
            <Gamepad2 aria-hidden /> {t('Jogar com esta')}
          </button>
          <span className="q-espaco" />
          <button type="button" className="q-ctl" onClick={aoNovaCaptura}>
            <Mic aria-hidden /> {t('Nova captura')}
          </button>
        </div>
      ) : (
        <div className="q-faixa">
          {temPalavras ? (
            <button type="button" className="q-ctl pri" onClick={aoRevisar} data-testid="revisar-da-sessao">
              <Layers aria-hidden /> {tp(palavras ?? 0, 'Revisar {n} palavra', 'Revisar as {n} palavras')}
            </button>
          ) : (
            <button type="button" className="q-ctl pri" onClick={aoAbrir} data-testid="abrir-a-sessao">
              <Library aria-hidden /> {t('Abrir a sessão')}
            </button>
          )}
          <button type="button" className="q-ctl" onClick={aoJogar}>
            <Gamepad2 aria-hidden /> {t('Jogar com esta')}
          </button>
          {temPalavras && (
            <button type="button" className="q-ctl" onClick={aoAbrir} data-testid="abrir-a-sessao">
              <Library aria-hidden /> {t('Abrir a sessão')}
            </button>
          )}
          <span className="q-espaco" />
          <button type="button" className="q-ctl" onClick={aoNovaCaptura}>
            <Mic aria-hidden /> {t('Nova captura')}
          </button>
        </div>
      )}
    </div>
  );
}
