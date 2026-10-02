import { Cloud, CloudOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { t } from '../../../lib/i18n';
import {
  aoMudarCotaDaNuvemDoQuest,
  cabecalhoDoDono,
  cotaDaNuvemDoQuestAcabou,
  ENDPOINT_DA_NUVEM_DO_QUEST,
} from '../../../lib/nuvemDoQuest';
import { mudarConsentimento } from '../../../lib/preferencias';

/**
 * A NUVEM DO APARELHO FRACO NA TELA DE CAPTURA (`lib/nuvemDoQuest.ts`).
 *
 * O aparelho leve (Quest, celular fraco, notebook modesto) não acompanha a fala com o modelo local,
 * então a transcrição pode ir à nuvem do próprio site. É escolha da pessoa, dita com todas as letras:
 * o que sai do aparelho, para onde, e que nada é guardado. O interruptor é o consentimento de nuvem de
 * sempre (registro datado em Ajustes). A cota é do servidor (15 min por dia por endereço de rede) e
 * aparece aqui: teto visível, nunca escondido. Acabou, a legenda continua no aparelho.
 *
 * `aoVivo` (a tela ao vivo do Quest): durante a gravação o cartão não aparece, para a legenda ficar com
 * a tela. Se a cota acabar no meio, entra uma faixa fina, sem botão, que some sozinha: nada cobre a
 * legenda e a captura não para.
 */
const TEMPO_DA_FAIXA_MS = 12_000;

export default function NuvemDoQuest({ gravando, aoVivo = false }: { gravando: boolean; aoVivo?: boolean }) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const cotaAcabou = useSyncExternalStore(aoMudarCotaDaNuvemDoQuest, cotaDaNuvemDoQuestAcabou, () => false);
  const [faixaVisivel, setFaixaVisivel] = useState(false);
  useEffect(() => {
    if (!cotaAcabou || !gravando) {
      setFaixaVisivel(false);
      return;
    }
    setFaixaVisivel(true);
    const id = window.setTimeout(() => setFaixaVisivel(false), TEMPO_DA_FAIXA_MS);
    return () => window.clearTimeout(id);
  }, [cotaAcabou, gravando]);
  /** Minutos que restam hoje; `null` = ainda não sabe; `0` = acabou (ou a nuvem recusou). */
  const [restam, setRestam] = useState<number | null>(null);

  useEffect(() => {
    if (!consentiu || gravando) return;
    let vivo = true;
    fetch(ENDPOINT_DA_NUVEM_DO_QUEST, { headers: cabecalhoDoDono() })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => ({}))) as { restante?: number };
        if (vivo) setRestam(r.ok ? Math.floor((corpo.restante ?? 0) / 60) : 0);
      })
      .catch(() => vivo && setRestam(null));
    return () => {
      vivo = false;
    };
  }, [consentiu, gravando]);

  if (aoVivo && gravando) {
    return faixaVisivel ? (
      <div className="q-aviso" role="status" data-testid="cota-da-nuvem-acabou">
        <span>{t('A nuvem de hoje acabou. A legenda segue feita no headset, um pouco mais lenta.')}</span>
      </div>
    ) : null;
  }

  return (
    <div className="aviso-info" data-testid="nuvem-do-quest" style={{ marginTop: 8, alignItems: 'center' }}>
      {consentiu ? <Cloud aria-hidden /> : <CloudOff aria-hidden />}
      <span style={{ flex: 1 }}>
        {consentiu ? (
          <>
            <b>Legenda pela nuvem: ligada.</b>{' '}
            {restam === 0
              ? 'A cota de hoje acabou: a legenda segue feita neste aparelho e a nuvem volta amanhã.'
              : restam != null
                ? `Restam cerca de ${restam} min hoje. Depois disso, a legenda segue feita neste aparelho.`
                : 'São 15 min por dia; depois disso, a legenda segue feita neste aparelho.'}{' '}
            O áudio de cada fala vai à Cloudflare só para ser transcrito; nada é guardado.
          </>
        ) : (
          <>
            <b>Este aparelho é lento para transcrever sozinho.</b> Com a nuvem (15 min por dia, grátis), o áudio de cada
            fala vai à Cloudflare só para ser transcrito, nada é guardado, e a legenda chega bem mais rápido.
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
