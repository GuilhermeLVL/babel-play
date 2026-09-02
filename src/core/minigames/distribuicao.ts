import type { CartaoFiltravel, FiltroDaPratica } from './filtro';

/**
 * DISTRIBUIÇÃO MULTI-FONTE DA RODADA (Q1 do brief do seletor, decidida como ADR no design).
 *
 * Quando o filtro tem mais de uma fonte, a rodada não pode ser "o que a ordenação trouxe
 * primeiro": o pool chega ordenado por vencimento, e um baralho Anki recém-importado (tudo
 * `dueAt = now`) engoliria as gravações inteiras em silêncio — a união viraria mentira.
 *
 * A regra: **proporcional ao tamanho do pool de cada fonte, com piso 1, por maior-resto
 * (largest remainder), determinística.**
 *  · proporcional — quem tem mais material aparece mais, sem cota mágica;
 *  · piso 1 — toda fonte COM material aparece ao menos uma vez (o motivo de existir união);
 *  · maior-resto — as sobras de arredondamento vão às maiores frações, com desempate estável
 *    pela ordem das fontes no filtro (determinismo: mesma entrada, mesma rodada);
 *  · dentro de cada fonte, a ordem RELATIVA do pool é preservada — a priorização por vencimento
 *    continua valendo, só que dentro da cota de cada fonte.
 *
 * FONTE DE UM CARTÃO, para efeito de cota: a mesma partição de `passaFontes` (`filtro.ts`) —
 * trilha por `daTrilha`, sessão por `sourceSessionId`, baralho é o resto. A classificação vai da
 * MAIS específica para a menos (trilha → sessão → resto), nunca pela ordem da lista do filtro:
 * "baralho é o resto" aceitaria quase tudo e, vindo primeiro, engoliria a cota da sessão — o
 * exato defeito que a distribuição existe para impedir. Um cartão conta UMA vez, na fonte mais
 * específica pedida que o aceita.
 */

export type FonteDaCota = 'baralho' | 'sessao' | 'trilha';

function fonteDoCartao(c: CartaoFiltravel, fontes: readonly FonteDaCota[]): FonteDaCota | null {
  if (fontes.includes('trilha') && c.daTrilha === true) return 'trilha';
  if (fontes.includes('sessao') && c.sourceSessionId) return 'sessao';
  if (fontes.includes('baralho') && !c.daTrilha) return 'baralho';
  return null;
}

/** Cotas por maior-resto: soma exata `total`, piso 1 para todo pool não-vazio (enquanto couber). */
export function cotasPorMaiorResto(tamanhos: readonly number[], total: number): number[] {
  const populacao = tamanhos.reduce((a, b) => a + b, 0);
  if (populacao === 0 || total <= 0) return tamanhos.map(() => 0);
  const alvo = Math.min(total, populacao);

  const exatas = tamanhos.map((t) => (t / populacao) * alvo);
  const cotas = exatas.map((e, i) => Math.min(tamanhos[i], Math.floor(e)));

  // Piso 1: fonte com material não pode zerar por arredondamento — é o contrato da união.
  for (let i = 0; i < cotas.length; i++) {
    if (tamanhos[i] > 0 && cotas[i] === 0) cotas[i] = 1;
  }

  // Ajuste ao alvo: sobras vão às MAIORES frações; excessos saem das MENORES (nunca abaixo do
  // piso, nunca acima do pool). Desempate estável pelo índice — determinismo.
  let soma = cotas.reduce((a, b) => a + b, 0);
  const porResto = exatas
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  let guarda = tamanhos.length * 2 + alvo;
  while (soma < alvo && guarda-- > 0) {
    for (const { i } of porResto) {
      if (soma >= alvo) break;
      if (cotas[i] < tamanhos[i]) { cotas[i]++; soma++; }
    }
  }
  const porRestoInverso = [...porResto].reverse();
  guarda = tamanhos.length * 2 + alvo;
  while (soma > alvo && guarda-- > 0) {
    for (const { i } of porRestoInverso) {
      if (soma <= alvo) break;
      const piso = tamanhos[i] > 0 ? 1 : 0;
      if (cotas[i] > piso) { cotas[i]--; soma--; }
    }
    // Se só o piso sobrou em todas e ainda excede (mais fontes que vagas): corta do fim.
    if (soma > alvo && cotas.every((c, i) => c <= (tamanhos[i] > 0 ? 1 : 0))) {
      for (const { i } of porRestoInverso) {
        if (soma <= alvo) break;
        if (cotas[i] > 0) { cotas[i]--; soma--; }
      }
    }
  }
  return cotas;
}

/**
 * Reparte `cartoes` (já filtrados e ORDENADOS por prioridade) em até `tamanho` itens, honrando a
 * cota de cada fonte de `filtro.fontes`. Com uma fonte só (ou nenhuma classificável), devolve o
 * prefixo simples — o comportamento de sempre, sem cota.
 */
export function distribuirPorFonte<T extends CartaoFiltravel>(
  cartoes: readonly T[],
  filtro: Pick<FiltroDaPratica, 'fontes'>,
  tamanho: number,
): T[] {
  const fontes = filtro.fontes as FonteDaCota[];
  if (fontes.length <= 1) return cartoes.slice(0, Math.max(0, tamanho));

  const porFonte = new Map<FonteDaCota, T[]>(fontes.map((f) => [f, []]));
  for (const c of cartoes) {
    const f = fonteDoCartao(c, fontes);
    if (f) porFonte.get(f)!.push(c);
  }
  const pools = fontes.map((f) => porFonte.get(f)!);
  const cotas = cotasPorMaiorResto(pools.map((p) => p.length), tamanho);

  /* Remontagem na ordem GLOBAL original (não fonte a fonte em bloco): a rodada continua vendo o
     mais urgente primeiro; a cota só decide QUEM entra, não a ordem de quem entrou. */
  const restante = new Map<FonteDaCota, number>(fontes.map((f, i) => [f, cotas[i]]));
  const escolhidos: T[] = [];
  for (const c of cartoes) {
    if (escolhidos.length >= tamanho) break;
    const f = fonteDoCartao(c, fontes);
    if (!f) continue;
    const sobra = restante.get(f)!;
    if (sobra > 0) { restante.set(f, sobra - 1); escolhidos.push(c); }
  }
  return escolhidos;
}
