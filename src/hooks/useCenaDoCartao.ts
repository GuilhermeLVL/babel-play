import { useCallback, useEffect, useState } from 'react';

import { abrirCenaDoCartao, apagarCenaDoCartao } from '../lib/cartoes/cenaDoCartao';

/**
 * A cena guardada no cartão (openspec `cartao-com-captura-de-tela`, tarefa 3.4): uma URL de objeto local (nunca de rede)
 * e "Remover a imagem". Sem cena, sem flag ou perfil protegido: `url` é `null` e o verso segue como era.
 */
export function useCenaDoCartao(cartaoId: string | undefined): { url: string | null; remover: () => void } {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let atual: string | null = null;
    setUrl(null);
    if (cartaoId)
      void abrirCenaDoCartao(cartaoId).then((blob) => {
        if (!vivo || !blob) return;
        atual = URL.createObjectURL(blob);
        setUrl(atual);
      });
    return () => {
      vivo = false;
      if (atual) URL.revokeObjectURL(atual);
    };
  }, [cartaoId]);

  const remover = useCallback(() => {
    if (!cartaoId) return;
    void apagarCenaDoCartao(cartaoId).then(() => setUrl(null));
  }, [cartaoId]);

  return { url, remover };
}
