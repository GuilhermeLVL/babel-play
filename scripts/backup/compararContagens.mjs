/**
 * Lógica pura do exercício de restauração: compara contagens de linhas por tabela. Sem rede, sem disco,
 * sem dependências (o CLI `drill-restauracao.mjs` roda com `node` puro). Só números: nunca linhas.
 */

/**
 * @param {Record<string, number>} origem contagem por tabela no banco vivo
 * @param {Record<string, number>} restaurado contagem por tabela no banco restaurado
 * @returns {{ ok: boolean, divergentes: Array<{ tabela: string, origem: number, restaurado: number }>, faltantes: string[] }}
 */
export function compararContagens(origem, restaurado) {
  const divergentes = []
  const faltantes = []
  const tabelas = Object.keys(origem)
  for (const tabela of tabelas) {
    if (!(tabela in restaurado)) faltantes.push(tabela)
    else if (restaurado[tabela] !== origem[tabela]) {
      divergentes.push({ tabela, origem: origem[tabela], restaurado: restaurado[tabela] })
    }
  }
  // Origem vazia não prova nada: um banco sem tabelas "restaura" qualquer coisa.
  return { ok: tabelas.length > 0 && divergentes.length === 0 && faltantes.length === 0, divergentes, faltantes }
}

/**
 * O destino do drill está livre? Só o texto exato `0` (a contagem do `psql -A -t`, com espaço/quebra de
 * linha em volta) libera. Saída vazia ou estranha (`NaN`, `00`, `3`) NÃO pode passar por "vazio".
 * @param {string} saidaDoPsql
 */
export function destinoLivre(saidaDoPsql) {
  return String(saidaDoPsql).trim() === '0'
}

/** Sem banco de origem (workflow): o restaurado precisa ter tabelas e ao menos uma migração registrada. */
export function validarRestaurado(restaurado) {
  const motivos = []
  if (Object.keys(restaurado).length === 0) motivos.push('nenhuma tabela restaurada')
  if (!((restaurado.__drizzle_migrations ?? 0) >= 1)) motivos.push('drizzle.__drizzle_migrations vazia ou ausente')
  return { ok: motivos.length === 0, motivos }
}

/** Tabela Markdown de contagens. `origem` nulo = modo sem origem (só o restaurado). */
export function tabelaMarkdown(origem, restaurado) {
  const nomes = [...new Set([...Object.keys(origem ?? {}), ...Object.keys(restaurado)])].sort()
  if (!origem) {
    return ['| Tabela | Restaurado |', '| --- | ---: |', ...nomes.map((t) => `| ${t} | ${restaurado[t]} |`)].join('\n')
  }
  const linhas = nomes.map((t) => {
    const o = origem[t]
    const r = restaurado[t]
    const situacao = o === undefined ? 'extra' : r === undefined ? 'FALTA' : o === r ? 'ok' : 'DIVERGE'
    return `| ${t} | ${o ?? '-'} | ${r ?? '-'} | ${situacao} |`
  })
  return ['| Tabela | Origem | Restaurado | Situação |', '| --- | ---: | ---: | --- |', ...linhas].join('\n')
}
