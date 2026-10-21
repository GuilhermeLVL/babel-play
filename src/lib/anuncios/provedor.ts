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
 * FOLHA: não importa nada do app além dos tipos da política.
 */
import type { ComponentType } from 'react';

import type { EspacoDeAnuncio, FormatoDeAnuncio } from '../../core/anuncios/politicaDeAnuncio';

export interface PropsDoEspacoDeAnuncio {
  espaco: EspacoDeAnuncio;
  formato: FormatoDeAnuncio;
  /** A porta "Sem anúncios": leva aos planos. Todo anúncio tem uma ao lado (spec, "Identificação e saída"). */
  aoSemAnuncios: () => void;
  /** O premiado terminou com recompensa (a página de anúncios avisou). Quem credita é o servidor. */
  aoRecompensar?: (exibicaoId: string) => void;
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
