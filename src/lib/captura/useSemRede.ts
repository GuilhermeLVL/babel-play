import { useEffect, useState } from 'react';

const semRedeAgora = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * SEM INTERNET? O que o navegador diz (`navigator.onLine`), acompanhando os eventos `online` e
 * `offline`. É a mesma leitura que o previsto do selo da fala usa (`pipelineDeFala.ts`, `semRede`): a
 * captura a observa para refazer o previsto quando a conexão cai ou volta.
 */
export function useSemRede(): boolean {
  const [semRede, setSemRede] = useState(semRedeAgora);
  useEffect(() => {
    const atualizar = () => setSemRede(semRedeAgora());
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => {
      window.removeEventListener('online', atualizar);
      window.removeEventListener('offline', atualizar);
    };
  }, []);
  return semRede;
}
