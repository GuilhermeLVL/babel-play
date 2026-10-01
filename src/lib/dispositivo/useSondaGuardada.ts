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

import { perfilDoDispositivo } from './perfil';
import type { SondaDoAparelho } from './sonda';

export function useSondaGuardada(): SondaDoAparelho | null {
  const [sonda, setSonda] = useState<SondaDoAparelho | null>(null);
  useEffect(() => {
    let vivo = true;
    import('./sonda')
      .then(async (m) => {
        const guardada = await m.sondaGuardada();
        /* QUEST: a GPU (Adreno 7xx) faz ~88x a conta da CPU (medido em 01/10/2026: 49,5 contra 0,56), e
           o Whisper só vai a ela com o microbenchmark guardado (`usarGpuNoAparelho`). No início da
           captura ele não roda mais lá (`semBenchmark`); roda aqui, no ocioso da tela, antes do Iniciar. */
        if (guardada?.benchmark || perfilDoDispositivo().tipo !== 'quest') return guardada;
        return (await m.agendarSondaDoAparelho()) ?? guardada;
      })
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
