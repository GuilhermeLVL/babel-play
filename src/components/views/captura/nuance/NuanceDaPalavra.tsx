import { Lock, Pin } from 'lucide-react';
import { useState } from 'react';

import { t } from '../../../../lib/i18n';
import ConviteDaNuance from './ConviteDaNuance';
import FixarNoGlossario, { cabeNoGlossario } from './FixarNoGlossario';

/**
 * "SEMPRE TRADUZIR ASSIM" NA FOLHA DA PALAVRA (D3 da Fase D) — o glossário pessoal nasce das palavras
 * que a pessoa encontra e guarda. Carregado por `lazy()` (a UI nova não entra no JS inicial).
 *
 * Com a Tradução Nuance: o botão abre o campo com a glosa da folha, para confirmar ou corrigir. Sem
 * ela: o mesmo botão, com cadeado, abre o texto positivo e — fora do perfil protegido — o convite.
 */
export default function NuanceDaPalavra({
  palavra,
  lang,
  glosa,
  destino,
  disponivel,
  aoConhecer,
}: {
  palavra: string;
  /** O idioma da palavra (o da fala de onde ela saiu). */
  lang: string;
  /** A glosa da folha; `null` enquanto consulta. */
  glosa: string | null;
  /** O idioma da tradução que se fixa (o seu, quando a palavra é do idioma que você estuda). */
  destino: string;
  disponivel: boolean;
  aoConhecer?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!cabeNoGlossario(palavra)) return null;

  return (
    <div className="nuance-da-palavra" style={{ display: 'grid', gap: 10 }}>
      <button
        type="button"
        className="folha-acao"
        aria-expanded={aberto}
        disabled={disponivel && glosa === null}
        onClick={() => setAberto((v) => !v)}
      >
        {disponivel ? <Pin aria-hidden /> : <Lock aria-hidden />} {t('Sempre traduzir assim')}
      </button>
      {aberto &&
        (disponivel ? (
          <FixarNoGlossario termo={palavra} traducaoInicial={glosa ?? ''} origem={lang} destino={destino} />
        ) : (
          <ConviteDaNuance
            texto={t('Com a Tradução Nuance do Premium, você fixa a sua tradução e ela vale em toda legenda.')}
            aoConhecer={aoConhecer}
          />
        ))}
    </div>
  );
}
