import { useEffect, useState } from 'react';

import { criarPalavrasConhecidas } from '../../core/harness/palavrasConhecidas';
import { fetchDeck } from '../../data/api';
import { baseLang } from '../languages';
import type { ConhecidasDaFala } from './traducaoSobDemanda';

/**
 * AS PALAVRAS QUE O ALUNO JÁ SABE, no idioma estudado — só quando o modo "Só frases com palavra
 * nova" está ligado. Desligado, nada é baixado: nem o caderno, nem a trilha (~250 KB por idioma).
 *
 * Até chegar, devolve `null` e o modo traduz tudo (errar para o lado de traduzir). A trilha vem
 * por `import()` para não pesar no arranque da captura; sem trilha do idioma, valem o caderno e as
 * palavras funcionais.
 */
export function usePalavrasConhecidas(idioma: string, ativo: boolean): ConhecidasDaFala | null {
  const [conhecidas, setConhecidas] = useState<ConhecidasDaFala | null>(null);
  const lang = baseLang(idioma);
  useEffect(() => {
    if (!ativo || !lang) {
      setConhecidas(null);
      return;
    }
    let vivo = true;
    void (async () => {
      const [cartoes, trilha] = await Promise.all([
        fetchDeck().catch(() => []),
        import('../../data/trilha/carregar').then((m) => m.carregarTrilha(lang)).catch(() => null),
      ]);
      if (!vivo) return;
      const k = criarPalavrasConhecidas({ idioma: lang, cartoes, trilha });
      setConhecidas({ idioma: k.idioma, conhece: k.conhece });
    })();
    return () => {
      vivo = false;
    };
  }, [lang, ativo]);
  return conhecidas;
}
