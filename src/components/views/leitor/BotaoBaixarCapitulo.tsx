/**
 * "BAIXAR ESTE CAPÍTULO" (F2): guarda o áudio do capítulo no aparelho para ouvir sem rede. Mostra o tamanho ANTES,
 * diz que fica só aqui e que dá para apagar. Só é carregado por `lazy(import())` com o áudio gravado em uso (a flag
 * `audiolivros` desligada não baixa este código).
 */
import { useEffect, useState } from 'react';

import { t } from '../../../lib/i18n';
import {
  apagarCapitulo,
  baixarCapitulo,
  capituloBaixado,
  tamanhoLegivel,
} from '../../../lib/leitor/audiolivro/capituloOffline';

type Estado = 'conferindo' | 'livre' | 'baixando' | 'baixado' | 'erro';

export default function BotaoBaixarCapitulo({ url, bytes, minutos }: { url: string; bytes: number; minutos: number }) {
  const [estado, setEstado] = useState<Estado>('conferindo');
  const [fracao, setFracao] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado('conferindo');
    void capituloBaixado(url)
      .catch(() => false)
      .then((sim) => vivo && setEstado(sim ? 'baixado' : 'livre'));
    return () => {
      vivo = false;
    };
  }, [url]);

  const baixar = async () => {
    setEstado('baixando');
    setFracao(0);
    try {
      await baixarCapitulo(url, setFracao);
      setEstado('baixado');
    } catch {
      setEstado('erro');
    }
  };
  const apagar = async () => {
    await apagarCapitulo(url).catch(() => {});
    setEstado('livre');
  };

  const tamanho = tamanhoLegivel(bytes);
  const situacao =
    estado === 'baixando'
      ? t('Baixando: {n}%', { n: Math.round(fracao * 100) })
      : estado === 'baixado'
        ? t('Capítulo baixado: dá para ouvir sem internet.')
        : estado === 'erro'
          ? t('Não deu para baixar agora. O capítulo continua tocando com internet.')
          : '';

  return (
    <div className="leitor-baixar-capitulo" data-testid="baixar-capitulo">
      {estado === 'baixado' ? (
        <button type="button" className="btn btn-outline leitor-alvo" onClick={() => void apagar()}>
          {t('Apagar do aparelho')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-outline leitor-alvo"
          disabled={estado === 'conferindo' || estado === 'baixando'}
          onClick={() => void baixar()}
        >
          {t('Baixar este capítulo ({tamanho})', { tamanho })}
        </button>
      )}
      <p className="leitor-apoio">{t('Ele fica só neste aparelho e você apaga quando quiser.')}</p>
      {minutos > 0 && <p className="leitor-apoio">{t('Cerca de {n} min de áudio.', { n: minutos })}</p>}
      <p className="leitor-apoio" aria-live="polite">
        {situacao}
      </p>
    </div>
  );
}
