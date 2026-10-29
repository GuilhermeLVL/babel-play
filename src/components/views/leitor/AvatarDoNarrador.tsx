import { useMemo } from 'react';

import { FLAG_AVATAR_3D } from '../../../core/planos';
import { detectarTier, temWebGL2 } from '../../../lib/avatar/detectarTier';
import { usePreferenciasDosAvatares } from '../../../lib/avatar/preferenciasDoInterprete';
import { useFlag } from '../../../lib/flags';
import { t } from '../../../lib/i18n';
import type { VistaDoNarrador } from '../../../lib/leitor/narrador';
import AvatarDaConversa from '../../avatar/AvatarDaConversa';

/** Quanto do texto da frase cabe na legenda do avatar (o resto está no livro, destacado). */
const MAX_LEGENDA = 140;

/**
 * O AVATAR-NARRADOR DO LEITOR (M5, flags `avatar_3d` + `avatar_elenco`, escolha "Mostrar o avatar do narrador"): reutiliza
 * o `AvatarFalante` (via `AvatarDaConversa`). Fala enquanto a narração toca, com a expressão da emoção da frase. A
 * LEGENDA em texto (quem fala e a frase) fica SEMPRE: o avatar é só imagem, quem lê e ouve nunca depende dele. Sem WebGL2,
 * no "modo economia" dos avatares ou sem as flags, só a legenda aparece.
 */
export default function AvatarDoNarrador({ vista }: { vista: VistaDoNarrador }) {
  const flag3d = useFlag(FLAG_AVATAR_3D);
  const [prefs] = usePreferenciasDosAvatares();
  const medido = useMemo(() => (flag3d ? { tier: detectarTier(), webgl2: temWebGL2() } : null), [flag3d]);
  const mostrar = !!medido && medido.webgl2 && !prefs.economia;
  const fala = vista.fala;
  const falando = vista.fase === 'tocando';
  const quem = fala?.nome ?? t('Narrador');
  const frase = vista.frase.length > MAX_LEGENDA ? `${vista.frase.slice(0, MAX_LEGENDA).trimEnd()}…` : vista.frase;
  return (
    <section className="leitor-avatar-narrador" aria-label={t('Narrador')} data-testid="avatar-do-narrador">
      {mostrar && medido && (
        <div
          className="leitor-avatar-narrador-rosto"
          aria-hidden="true"
          data-testid="avatar-do-narrador-rosto"
          data-emocao={fala?.emocao ?? 'neutro'}
        >
          <AvatarDaConversa
            dono="outro"
            estado={falando ? 'falando' : 'parado'}
            fonteDaBoca={null}
            emocao={fala?.emocao ?? 'neutro'}
            tamanho={72}
            tier={medido.tier}
            anunciar={false}
          />
        </div>
      )}
      <p className="leitor-avatar-narrador-legenda" data-testid="avatar-do-narrador-legenda">
        <b>{quem}</b>
        {frase ? <span>{frase}</span> : null}
      </p>
    </section>
  );
}
