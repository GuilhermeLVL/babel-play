import { useCallback, useEffect, useRef, useState } from 'react';

import type { Resposta } from '../../../lib/admin';

export interface Carga<T> {
  estado: 'carregando' | 'ok' | 'erro';
  dados: T | null;
  erro: string;
  /** Há uma busca em andamento por cima de dados já mostrados (depois de uma ação). */
  atualizando: boolean;
  recarregar: () => void;
}

/**
 * Carrega uma rota de administração e a recarrega sob pedido (depois de cada ação).
 *
 * Recarregar NÃO apaga o que está na tela: a lista continua visível enquanto a nova chega, e some
 * só se a nova falhar. Quando o servidor pede o segundo fator, avisa quem chamou (`aoPedirCodigo`)
 * em vez de mostrar um erro genérico. Os dados ficam só em memória.
 */
export function useCarga<T>(carregar: () => Promise<Resposta<T>>, aoPedirCodigo: () => void): Carga<T> {
  const [estado, setEstado] = useState<Carga<T>['estado']>('carregando');
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [rodada, setRodada] = useState(0);
  const funcao = useRef({ carregar, aoPedirCodigo });
  funcao.current = { carregar, aoPedirCodigo };

  useEffect(() => {
    let vivo = true;
    setAtualizando(true);
    void funcao.current.carregar().then((r) => {
      if (!vivo) return;
      setAtualizando(false);
      if (r.ok) {
        setDados(r.dados);
        setErro('');
        setEstado('ok');
        return;
      }
      if (r.segundoFator) funcao.current.aoPedirCodigo();
      setDados(null);
      setErro(r.erro);
      setEstado('erro');
    });
    return () => {
      vivo = false;
    };
  }, [rodada]);

  const recarregar = useCallback(() => setRodada((n) => n + 1), []);
  return { estado, dados, erro, atualizando, recarregar };
}
