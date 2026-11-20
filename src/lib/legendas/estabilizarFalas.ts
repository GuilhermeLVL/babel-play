/**
 * AS FALAS DA LEGENDA COM IDENTIDADE ESTÁVEL. A captura refaz a lista de falas a cada parcial (`LiveCapture`), e cada
 * fala virava um objeto novo — o `memo` de `LinhaDaLegenda` nunca segurava, e as linhas que não mudaram eram
 * repintadas (com as marcas do assistente) a cada letra da fala em curso. Aqui, a fala igual à anterior (mesmos campos)
 * devolve o MESMO objeto; só a que mudou é nova.
 */
export function estabilizarFalas<F extends { id: string }>(anteriores: Map<string, F>, novas: readonly F[]): F[] {
  const saida = novas.map((f) => {
    const antes = anteriores.get(f.id);
    return antes && mesmosCampos(antes, f) ? antes : f;
  });
  anteriores.clear();
  for (const f of saida) anteriores.set(f.id, f);
  return saida;
}

function mesmosCampos(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
