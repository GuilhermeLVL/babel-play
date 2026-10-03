import { useEffect, useState } from 'react';

import { aoMudarChave, CHAVES_DE_TESTE, chaveLigada, gravarChave } from '../../../../lib/captura/testesDoInterprete';
import { t } from '../../../../lib/i18n';

/**
 * OS TESTES DO INTÉRPRETE (Intérprete v3), no `/diagnostico`: um botão por recurso novo, ligado de
 * fábrica. Liga, abra o intérprete e toque um vídeo ou entre numa conversa; desliga e volta ao de antes.
 */
export default function TestesDoInterprete() {
  const [ligadas, setLigadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHAVES_DE_TESTE.map((c) => [c.id, chaveLigada(c.id)])),
  );
  useEffect(() => aoMudarChave((id, ligada) => setLigadas((a) => ({ ...a, [id]: ligada }))), []);
  return (
    <div data-testid="testes-do-interprete">
      {CHAVES_DE_TESTE.map((c) => (
        <div key={c.id} style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={ligadas[c.id] ? 'btn btn-solid' : 'btn btn-outline'}
            aria-pressed={!!ligadas[c.id]}
            onClick={() => gravarChave(c.id, !ligadas[c.id])}
          >
            {c.titulo}: {ligadas[c.id] ? t('ligado') : t('desligado')}
          </button>
          <p className="mut" style={{ fontSize: 13, marginTop: 4 }}>
            {c.descricao}
          </p>
        </div>
      ))}
    </div>
  );
}
