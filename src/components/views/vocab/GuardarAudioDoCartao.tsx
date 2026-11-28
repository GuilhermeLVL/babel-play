import { useEffect, useState } from 'react';

import { FLAG_CARTAO_COM_AUDIO } from '../../../core/planos';
import { abrirClipeDoCartao, lerDestinoDoAudio } from '../../../lib/cartoes/audioDoCartao';
import {
  type DependenciasDoClipeDaSessao,
  guardarClipeDaSessao,
  type TrechoDaSessao,
} from '../../../lib/cartoes/audioDoCartao/daSessao';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import { toast } from '../../Toast';

/**
 * "GUARDAR O ÁUDIO DESTE CARTÃO" na gaveta da palavra (openspec `cartao-com-audio-do-trecho`, tarefa 4.2; flag
 * `cartao_com_audio`). Para o cartão antigo, que nasceu sem clipe: corta o trecho da gravação da sessão e guarda SÓ neste
 * aparelho. Sem a flag, ou com "Não guardar" nos Ajustes, não renderiza nada. Sessão sem áudio: avisa, sem botão.
 */
export default function GuardarAudioDoCartao({
  cartaoId,
  trecho,
  deps,
}: {
  cartaoId: string;
  /** A cena do cartão (sessão e tempo da fala). Sem ela o cartão não veio de uma sessão: nada a guardar. */
  trecho: TrechoDaSessao | null;
  /** Só os testes trocam rede e decodificador. */
  deps?: DependenciasDoClipeDaSessao;
}) {
  const ligada = useFlag(FLAG_CARTAO_COM_AUDIO) && lerDestinoDoAudio() === 'aparelho';
  const [temClipe, setTemClipe] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!ligada) return;
    let vivo = true;
    setTemClipe(null);
    void abrirClipeDoCartao(cartaoId).then((c) => vivo && setTemClipe(!!c));
    return () => {
      vivo = false;
    };
  }, [ligada, cartaoId]);

  if (!ligada || !trecho || temClipe === null) return null;

  if (temClipe)
    return (
      <span className="ct-sem-fala mut" data-testid="audio-guardado">
        {t('Áudio guardado neste aparelho.')}
      </span>
    );

  const sessaoSemAudio = !trecho.temAudio || trecho.inicioMs === null || trecho.fimMs === null;
  if (sessaoSemAudio)
    return (
      <span className="ct-sem-fala mut" data-testid="sem-audio-para-guardar">
        {t('A sessão deste cartão não tem áudio para guardar.')}
      </span>
    );

  const guardar = async () => {
    if (ocupado) return;
    setOcupado(true);
    const r = await guardarClipeDaSessao(cartaoId, trecho, deps);
    setOcupado(false);
    if (r === 'guardou') {
      setTemClipe(true);
      toast.ok(t('Áudio guardado neste aparelho.'));
    } else if (r === 'sem-audio') toast.info(t('A sessão deste cartão não tem áudio para guardar.'));
    else if (r === 'falhou') toast.warn(t('Não deu para guardar o áudio agora.'));
  };

  return (
    <button
      type="button"
      className="btn btn-outline peq"
      data-testid="guardar-audio-do-cartao"
      disabled={ocupado}
      onClick={() => void guardar()}
    >
      {t('Guardar o áudio deste cartão')}
    </button>
  );
}
