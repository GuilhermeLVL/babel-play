/**
 * AS CONTAGENS DO CATÁLOGO, VIVAS — uma leitura de `GET /api/vocab/conteudo` por idioma, refeita quando
 * o idioma muda, quando alguém pede (`recarregar`) e quando a janela volta a ter o foco. Cada resposta
 * confere a escolha (`conferirConteudo`): a fonte que deixou de existir volta para "Tudo".
 *
 * `idioma` vazio (ainda não decidido) pede com o idioma de estudo do app (`fetchLangConfig`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import { lerContagensDeConteudo } from '../../data/rotas/conteudo';
import { fetchLangConfig } from '../langConfig';
import { conferirConteudo } from './loja';

export function useContagensDeConteudo(idioma: string): {
  contagens: ContagensDeConteudo | null;
  recarregar: () => Promise<ContagensDeConteudo | null>;
} {
  const [contagens, setContagens] = useState<ContagensDeConteudo | null>(null);
  const vez = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++vez.current;
    let pedir = idioma;
    if (!pedir) {
      try {
        pedir = (await fetchLangConfig()).studying.split('-')[0].toLowerCase();
      } catch {
        pedir = '';
      }
    }
    const k = await lerContagensDeConteudo(pedir);
    if (minha !== vez.current) return k;
    if (k) {
      setContagens(k);
      conferirConteudo(k, idioma);
    }
    return k;
  }, [idioma]);

  useEffect(() => {
    void recarregar();
    const aoVoltar = () => void recarregar();
    window.addEventListener('focus', aoVoltar);
    return () => {
      vez.current += 1;
      window.removeEventListener('focus', aoVoltar);
    };
  }, [recarregar]);

  return { contagens, recarregar };
}
