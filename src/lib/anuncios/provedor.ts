/**
 * O PROVEDOR DE ANÚNCIOS — quem DESENHA um espaço. Injetável, e nesta etapa NÃO EXISTE o de produção.
 *
 * `EspacoDeAnuncio` decide SE (a política pura) e pergunta aqui QUEM desenha. Sem provedor registrado
 * ele não renderiza nada e não pede nada à rede: é o estado de fábrica, com a flag ligada ou não.
 *
 * O único provedor que existe é o de DEMONSTRAÇÃO (`components/anuncios/demonstracao`), só em
 * desenvolvimento, para o dono ver os lugares: cartões "Patrocinado · exemplo", sem anunciante real,
 * sem script de terceiro e sem rede. Um provedor de produção (uma rede de anúncios) entra por aqui
 * quando o dono escolher a rede, e traz junto o ajuste da CSP por configuração (`design.md` §7).
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
}

export interface ProvedorDeAnuncios {
  /** Nome curto, para diagnóstico (`demonstracao`). */
  id: string;
  /** Desenha UM espaço. Só é montado depois de a política dizer que pode. */
  Espaco: ComponentType<PropsDoEspacoDeAnuncio>;
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
