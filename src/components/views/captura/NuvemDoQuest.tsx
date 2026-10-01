import { Cloud, CloudOff } from 'lucide-react';

import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { mudarConsentimento } from '../../../lib/preferencias';

/**
 * A NUVEM DO QUEST NA TELA DE CAPTURA (`lib/nuvemDoQuest.ts`).
 *
 * O headset não acompanha a fala com o modelo local (3 núcleos), então a transcrição pode ir à nuvem
 * do próprio site. É escolha da pessoa, dita com todas as letras: o que sai do aparelho, para onde, e
 * que nada é guardado. O interruptor é o consentimento de nuvem de sempre (registro datado em Ajustes).
 */
export default function NuvemDoQuest({ gravando }: { gravando: boolean }) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  return (
    <div className="aviso-info" data-testid="nuvem-do-quest" style={{ marginTop: 8, alignItems: 'center' }}>
      {consentiu ? <Cloud aria-hidden /> : <CloudOff aria-hidden />}
      <span style={{ flex: 1 }}>
        {consentiu ? (
          <>
            <b>Legenda pela nuvem: ligada.</b> O áudio de cada fala vai à Cloudflare só para ser transcrito; nada é
            guardado. Sem rede ou sem cota, a legenda volta a ser feita no headset.
          </>
        ) : (
          <>
            <b>O headset é lento para transcrever sozinho.</b> Com a nuvem, o áudio de cada fala vai à Cloudflare só
            para ser transcrito (nada é guardado) e a legenda chega bem mais rápido, em qualquer idioma.
          </>
        )}
      </span>
      <button
        type="button"
        className={consentiu ? 'btn btn-outline peq' : 'btn btn-solid peq'}
        disabled={gravando}
        onClick={() => void (consentiu ? mudarConsentimento('nuvem', false) : autorizar())}
      >
        {consentiu ? 'Desligar' : 'Usar a nuvem'}
      </button>
    </div>
  );
}
