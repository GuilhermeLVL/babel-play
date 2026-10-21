/**
 * O PROVEDOR DE ANÚNCIOS — quem DESENHA um espaço. Injetável.
 *
 * `EspacoDeAnuncio` decide SE (a política pura) e pergunta aqui QUEM desenha. Sem provedor registrado
 * ele não renderiza nada e não pede nada à rede: é o estado de fábrica, com a flag ligada ou não.
 *
 * Dois provedores existem: o de DEMONSTRAÇÃO (`components/anuncios/demonstracao`), só em
 * desenvolvimento, com cartões "Patrocinado · exemplo" sem rede; e o REAL (`provedores/iframe.tsx`,
 * ruling R32), registrado por `ligar.ts` só quando o build tem `VITE_ANUNCIOS_ORIGEM`: um
 * `<iframe credentialless>` para a página de anúncios na origem própria. A CSP do app só abre o
 * `frame-src` dessa origem com a flag ligada (`server/http/csp.ts`).
 *
 * FOLHA: não importa nada do app além de TIPOS (a política e o `PremiadoConcluido` da rota do premiado).
 */
import type { ComponentType } from 'react';

import type { EspacoDeAnuncio, FormatoDeAnuncio } from '../../core/anuncios/politicaDeAnuncio';
import type { PremiadoConcluido } from '../../data/rotas/anuncios';

export interface PropsDoEspacoDeAnuncio {
  espaco: EspacoDeAnuncio;
  formato: FormatoDeAnuncio;
  /** A porta "Sem anúncios": leva aos planos. Todo anúncio tem uma ao lado (spec, "Identificação e saída"). */
  aoSemAnuncios: () => void;
  /**
   * O fim de um PREMIADO: o provedor abriu a exibição com `iniciarPremiado(espaco)` (`data/rotas/anuncios.ts`)
   * antes de mostrar o anúncio e, quando a página dele avisa o fim, chama isto com o `exibicaoId`. Quem credita é
   * o servidor, uma vez só, e a promessa resolve com o que foi creditado (`PremiadoConcluido`: o `tipo`, o `ateEm`
   * do tema, `jaCreditado`) para o provedor mostrar; recusa (teto, prazo, perfil) rejeita com o `code` dele na
   * mensagem. Ausente nos formatos que não são premiados.
   */
  aoRecompensar?: (exibicaoId: string) => Promise<PremiadoConcluido>;
}

export interface ProvedorDeAnuncios {
  /** Nome curto, para diagnóstico (`demonstracao`, `iframe`). */
  id: string;
  /** Desenha UM espaço. Só é montado depois de a política dizer que pode. */
  Espaco: ComponentType<PropsDoEspacoDeAnuncio>;
  /** Este navegador consegue desenhar? Ausente = sim. `false` vale como "sem provedor": nada aparece. */
  disponivel?: () => boolean;
  /**
   * O provedor REAL pede o consentimento no primeiro espaço elegível (`ConsentimentoDeAnuncios`) a quem
   * nunca respondeu. A demonstração e os de teste não pedem.
   */
  pedeConsentimento?: boolean;
}

let atual: ProvedorDeAnuncios | null = null;
const inscritos = new Set<() => void>();

/** O provedor registrado, ou `null` (o estado de fábrica). */
export function provedorDeAnuncios(): ProvedorDeAnuncios | null {
  return atual;
}

/** Registra (ou, com `null`, tira) o provedor. Os espaços montados se atualizam. */
export function registrarProvedorDeAnuncios(provedor: ProvedorDeAnuncios | null): void {
  if (atual === provedor) return;
  atual = provedor;
  for (const f of inscritos) f();
}

export function assinarProvedorDeAnuncios(f: () => void): () => void {
  inscritos.add(f);
  return () => {
    inscritos.delete(f);
  };
}
