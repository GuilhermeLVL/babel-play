/**
 * Corta a lista ordenada por frequência em seis faixas de **cobertura cumulativa do corpus**:
 * cada faixa carrega ~1/6 da massa de ocorrências, não 1/6 das palavras. Bucket de tamanho igual
 * é arbitrário; cobertura é defensável — a primeira faixa é o que basta para entender um sexto do
 * que se fala, e é por isso que ela tem poucas palavras e a última tem milhares.
 *
 * As chaves seguem sendo A1..C2 (design.md, Decisão 1): são posições ordinais, não CEFR. Quem
 * escreve o JSON marca `escala: 'frequencia'` para a tela não mentir o rótulo.
 */
export const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** `palavras`: `[{ palavra, contagem }]` já filtrada e ordenada. */
export function faixas(palavras) {
  const lista = palavras ?? [];
  const fora = {};
  for (const n of NIVEIS) fora[n] = [];
  const massa = lista.reduce((s, p) => s + (Number(p.contagem) || 0), 0);
  if (!lista.length || massa <= 0) return fora;

  const alvo = massa / NIVEIS.length;
  let i = 0;
  let acumulado = 0;
  for (let k = 0; k < lista.length; k++) {
    fora[NIVEIS[i]].push(lista[k]);
    acumulado += Number(lista[k].contagem) || 0;
    // Avança só depois de a faixa corrente ter ao menos uma palavra, e nunca além da última.
    const restam = lista.length - (k + 1);
    const faixasRestantes = NIVEIS.length - (i + 1);
    if (i < NIVEIS.length - 1 && (acumulado >= alvo * (i + 1) || restam <= faixasRestantes)) i++;
  }
  return fora;
}

/** Diagnóstico: quantas palavras e que fatia do corpus cada faixa carrega. */
export function coberturaDasFaixas(porNivel) {
  const massa = NIVEIS.reduce(
    (s, n) => s + (porNivel[n] ?? []).reduce((t, p) => t + (Number(p.contagem) || 0), 0), 0);
  let acumulado = 0;
  return NIVEIS.map((n) => {
    const lista = porNivel[n] ?? [];
    const soma = lista.reduce((t, p) => t + (Number(p.contagem) || 0), 0);
    acumulado += soma;
    return {
      nivel: n,
      palavras: lista.length,
      fatia: massa ? soma / massa : 0,
      cumulativo: massa ? acumulado / massa : 0,
    };
  });
}
