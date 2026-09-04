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
  if (!lista.length) return fora;

  /* Fatias iguais em CONTAGEM, sobre a lista já ordenada por frequência.
     Cobertura cumulativa igual foi a primeira tentativa e produziu 32 palavras na faixa 1 e 1.579
     na última (medido no espanhol): Zipf concentra a massa em pouquíssimas palavras, então dividir
     por massa devolve um topo minúsculo e uma cauda gigante. Para uma trilha o útil é o contrário
     — a faixa inicial é onde se passa mais tempo. */
  const porFaixa = Math.ceil(lista.length / NIVEIS.length);
  lista.forEach((p, k) => {
    const i = Math.min(NIVEIS.length - 1, Math.floor(k / porFaixa));
    fora[NIVEIS[i]].push(p);
  });
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
