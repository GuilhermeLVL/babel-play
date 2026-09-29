import { TriangleAlert } from 'lucide-react';

import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { t } from '../../../lib/i18n';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import { toast } from '../../Toast';

/**
 * O TRADUTOR DO APARELHO NÃO CARREGOU (relato do dono no celular, 2026-09-29): o opus-mt falhou ao
 * abrir aqui (WASM, memória — `mt.aoFalharCarga`), então a tradução que as falas esperavam não vem
 * dele. A faixa diz isso UMA vez, com clareza, e oferece o tradutor pela internet (MyMemory) — que só
 * liga com o consentimento de nuvem dado AQUI, pelo mecanismo de sempre (Ajustes → Privacidade grava
 * igual, com data). Nada é ligado sozinho. Perfil protegido (menor, idade não declarada) não vê a
 * oferta: a nuvem dele passa pelo responsável. `aoAutorizar`: a captura retraduz o que ficou sem
 * tradução.
 */
export default function AvisoDoTradutorLocal({
  aoAutorizar,
  aoFechar,
}: {
  aoAutorizar: () => void;
  aoFechar: () => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const oferecer = !consentiu && !perfilProtegido();
  return (
    <div className="aviso-info warn" role="status" data-testid="aviso-do-tradutor-local" style={{ marginBottom: 12 }}>
      <TriangleAlert aria-hidden />
      <span style={{ flex: 1 }}>
        {t('O tradutor deste aparelho não carregou (pouca memória ou navegador sem suporte). As falas seguem sem tradução.')}
        {oferecer && ' '}
        {oferecer && t('Dá para traduzir pela internet com o MyMemory: o texto das falas sai do aparelho.')}
      </span>
      {oferecer && (
        <button
          type="button"
          className="btn btn-solid peq"
          onClick={() => {
            void autorizar().then((ok) => {
              if (!ok) return toast.warn(t('Não consegui registrar a autorização agora.'));
              toast.ok(t('Autorização registrada'));
              aoAutorizar();
            });
          }}
        >
          {t('Traduzir pela internet')}
        </button>
      )}
      <button type="button" className="btn btn-outline peq" onClick={aoFechar}>
        {t('Agora não')}
      </button>
    </div>
  );
}
