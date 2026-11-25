import { useEffect, useState } from 'react';

import { FLAG_CARTAO_COM_AUDIO } from '../../../core/planos';
import { gravarDestinoDoAudio, lerDestinoDoAudio } from '../../../lib/cartoes/audioDoCartao';
import { armazemDeAudioDoCartao } from '../../../lib/cartoes/audioDoCartao/armazem';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import { toast } from '../../Toast';

/**
 * AJUSTES → PRIVACIDADE → "ÁUDIO DOS CARTÕES" (openspec `cartao-com-audio-do-trecho`, tarefa 2.5; flag `cartao_com_audio`).
 *
 * Duas escolhas, "Só neste aparelho" (padrão) e "Não guardar". Não existe "Na minha conta": o clipe nunca sobe ao servidor
 * (retenção zero), então o perfil protegido e o adulto veem a mesma tela. Com a flag desligada, a seção não aparece.
 */
const formatar = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export default function AudioDosCartoes() {
  const ligada = useFlag(FLAG_CARTAO_COM_AUDIO);
  const [guardar, setGuardar] = useState(() => lerDestinoDoAudio() === 'aparelho');
  const [uso, setUso] = useState<{ clipes: number; bytes: number } | null>(null);

  useEffect(() => {
    if (!ligada) return;
    let vivo = true;
    void armazemDeAudioDoCartao()
      .uso()
      .then((u) => vivo && setUso(u));
    return () => {
      vivo = false;
    };
  }, [ligada]);

  if (!ligada) return null;

  const alternar = () => {
    const novo = !guardar;
    gravarDestinoDoAudio(novo ? 'aparelho' : 'nao');
    setGuardar(novo);
  };

  const apagar = async () => {
    await armazemDeAudioDoCartao().apagarTudo();
    setUso({ clipes: 0, bytes: 0 });
    toast.ok(t('Os áudios dos cartões foram apagados deste aparelho.'));
  };

  return (
    <section className="q-secao" data-testid="audio-dos-cartoes">
      <header>
        <div>
          <h2>{t('Áudio dos cartões')}</h2>
          <p>{t('O trecho da fala de onde a palavra veio, para ouvir na revisão.')}</p>
        </div>
      </header>
      <div className="q-ajustes">
        <div className="q-ajuste">
          <div>
            <b>{t('Guardar o áudio dos cartões neste aparelho')}</b>
            <small>
              {t(
                'O áudio guarda a voz de quem estava falando. Fica só neste aparelho: não vai para o servidor nem para a IA, e sai quando você apaga o cartão ou troca de conta.',
              )}
            </small>
          </div>
          <button
            type="button"
            className="q-interruptor"
            role="switch"
            aria-checked={guardar}
            aria-label={t('Guardar o áudio dos cartões neste aparelho')}
            onClick={alternar}
          />
        </div>
        <div className="q-ajuste">
          <div>
            <b>{t('Apagar todos os áudios')}</b>
            <small>
              {uso
                ? uso.clipes
                  ? t('{n} áudios, {tamanho}.', { n: uso.clipes, tamanho: formatar(uso.bytes) })
                  : t('Nenhum áudio guardado.')
                : ''}
            </small>
          </div>
          <button type="button" className="q-ctl" disabled={!uso?.clipes} onClick={() => void apagar()}>
            {t('Apagar')}
          </button>
        </div>
      </div>
    </section>
  );
}
