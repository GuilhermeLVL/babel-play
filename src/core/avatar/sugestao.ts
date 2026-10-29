/**
 * "ESCOLHER PARA MIM": a sugestão do avatar, sempre dentro do que o perfil pode usar. Aleatório entre os modelos
 * da coleção curada (`origem: colecao | familia`); o perfil protegido só enxerga as origens que a política libera.
 * O sorteio vem de fora (`sorteio` em [0,1)), para o teste ser determinístico. Núcleo puro.
 */
import { origemPermitida, politicaDeAvatar } from './politicaDeMenor';
import type { OrigemDaBase } from './receita';

export interface ItemSugerivel {
  id: string;
  origem: OrigemDaBase;
}

export function sugerirModelo<T extends ItemSugerivel>(
  catalogo: readonly T[],
  protegido: boolean,
  sorteio: () => number,
  evitar?: string,
): T | null {
  const elegiveis = catalogo.filter((m) => m.origem !== 'importado' && origemPermitida(protegido, m.origem));
  if (elegiveis.length === 0) return null;
  // Evita repetir o atual quando há outro (o botão tem de parecer que fez alguma coisa).
  const outros = evitar ? elegiveis.filter((m) => m.id !== evitar) : elegiveis;
  const lista = outros.length > 0 ? outros : elegiveis;
  const x = sorteio();
  const i = Math.min(lista.length - 1, Math.max(0, Math.floor((Number.isFinite(x) ? x : 0) * lista.length)));
  return lista[i];
}

/** Para a UI: o que este perfil pode fazer com o avatar (a política do M1, sem repetir regra). */
export const permissoesDoAvatar = (protegido: boolean) => politicaDeAvatar(protegido);
