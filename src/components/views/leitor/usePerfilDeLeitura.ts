/**
 * O PERFIL DE LEITURA DA PESSOA (ACE04): um só, para todo livro, guardado no aparelho. O que vale é o de
 * `normalizarPerfil` (o disco pode ter qualquer coisa); sem armazenamento, vale o padrão nesta abertura.
 */
import { useCallback, useState } from 'react';

import { normalizarPerfil, type PerfilDeLeitura } from '../../../core/leitura/perfilDeLeitura';

export const CHAVE_DO_PERFIL = 'leitor:perfil';

export function lerPerfilGuardado(): PerfilDeLeitura {
  try {
    return normalizarPerfil(JSON.parse(localStorage.getItem(CHAVE_DO_PERFIL) ?? 'null'));
  } catch {
    return normalizarPerfil(null);
  }
}

export function usePerfilDeLeitura(): [PerfilDeLeitura, (mudanca: Partial<PerfilDeLeitura>) => void, () => void] {
  const [perfil, setPerfil] = useState<PerfilDeLeitura>(lerPerfilGuardado);
  const gravar = (p: PerfilDeLeitura) => {
    try {
      localStorage.setItem(CHAVE_DO_PERFIL, JSON.stringify(p));
    } catch {
      /* sem armazenamento: o perfil vale só nesta abertura */
    }
  };
  const mudar = useCallback((m: Partial<PerfilDeLeitura>) => {
    setPerfil((atual) => {
      const novo = normalizarPerfil({ ...atual, ...m });
      gravar(novo);
      return novo;
    });
  }, []);
  const restaurar = useCallback(() => {
    const p = normalizarPerfil(null);
    gravar(p);
    setPerfil(p);
  }, []);
  return [perfil, mudar, restaurar];
}
