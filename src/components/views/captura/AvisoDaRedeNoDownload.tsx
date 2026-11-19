import { TriangleAlert } from 'lucide-react';
import React from 'react';

import { estimarTempo, faixaEmTexto } from '../../../lib/dispositivo/vazao';
import { t } from '../../../lib/i18n';

/**
 * A REDE NA CONFIRMAÇÃO DO DOWNLOAD (carga-rapida-no-celular, 3.3): quanto tempo o download leva nesta conexão e,
 * se ela é lenta, o aviso. Sem `navigator.connection` (Safari), quem diz é a vazão medida (`vazao.ts`): o iPhone
 * passa a ver o aviso. Para o ADULTO com rede lenta, a saída que não baixa a transcrição: a legenda do navegador
 * (decisão do dono, 17/11/2026), dizendo para onde vai o áudio. O perfil protegido nunca a vê (quem decide é a tela).
 */
export default function AvisoDaRedeNoDownload({
  mb,
  redeLenta,
  tipoDeRede,
  vazaoMbps,
  legendaDoNavegador,
}: {
  /** O total que a confirmação pede (MB). */
  mb: number;
  redeLenta: boolean;
  /** O tipo declarado pelo navegador ('3g'…), quando há. */
  tipoDeRede: string | null;
  /** A vazão medida (Mbit/s), quando há. */
  vazaoMbps: number | null;
  /** A saída da legenda do navegador: o que ainda baixa (o tradutor) e a ação. Ausente = não oferece. */
  legendaDoNavegador?: { mbTradutor: number; aoUsar: () => void };
}) {
  const faixa = estimarTempo(mb * 1024 * 1024, vazaoMbps);
  return (
    <>
      {faixa && (
        <p data-testid="estimativa-do-download">
          {t('Nesta conexão, o download deve levar {faixa}.', { faixa: faixaEmTexto(faixa, t) })}
        </p>
      )}
      {redeLenta && (
        <p className="aviso-info warn" data-testid="aviso-de-rede-lenta">
          <TriangleAlert aria-hidden />
          <span>
            {tipoDeRede
              ? t('A conexão parece lenta ({rede}): o download pode demorar.', { rede: tipoDeRede })
              : t('A conexão parece lenta: o download pode demorar.')}{' '}
            {t('Num Wi-Fi ele termina antes e não gasta o seu plano de dados.')}
          </span>
        </p>
      )}
      {redeLenta && legendaDoNavegador && (
        <button
          type="button"
          className="btn btn-outline"
          data-testid="usar-legenda-do-navegador"
          onClick={legendaDoNavegador.aoUsar}
        >
          {t('Usar a legenda do navegador')}
          <span className="block font-normal text-[12px] text-ink-muted">
            {legendaDoNavegador.mbTradutor > 0
              ? t('A transcrição não baixa nada; só o tradutor ({mb} MB).', { mb: legendaDoNavegador.mbTradutor })
              : t('Não baixa nada.')}{' '}
            {t('O áudio da sua voz vai para o reconhecimento do navegador (Google ou Apple) enquanto você fala.')}
          </span>
        </button>
      )}
    </>
  );
}
