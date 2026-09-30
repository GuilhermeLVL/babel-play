/**
 * A SONDA GUARDADA DO APARELHO, para as telas que ESTIMAM o que a captura vai baixar.
 *
 * A rota de verdade (`pipelineDeFala.prepareModels`) decide o modelo com a sonda guardada: o small
 * (589 MB) só entra com a GPU provada pelo microbenchmark (`smallComGpuProvada`). As estimativas da
 * tela (selo do modelo, folha do início, painel "Onde as contas rodam", onboarding) chamavam a mesma
 * rota SEM a sonda — e diriam 209 MB a quem, na captura, baixaria 589 MB. Com isto as duas contas
 * usam a mesma entrada.
 *
 * O módulo da sonda vem por `import()` (fica fora do JS inicial) e a leitura é só do que já está
 * guardado: nada é medido aqui. Enquanto não chega (ou sem sonda), `null` — a estimativa conservadora.
 */
import { useEffect, useState } from 'react';

import type { SondaDoAparelho } from './sonda';

export function useSondaGuardada(): SondaDoAparelho | null {
  const [sonda, setSonda] = useState<SondaDoAparelho | null>(null);
  useEffect(() => {
    let vivo = true;
    import('./sonda')
      .then((m) => m.sondaGuardada())
      .then(
        (s) => {
          if (vivo) setSonda(s);
        },
        () => undefined, // sem sonda legível: a estimativa fica a conservadora
      );
    return () => {
      vivo = false;
    };
  }, []);
  return sonda;
}
