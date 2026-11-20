/**
 * MARCAS DE DESEMPENHO DA CAPTURA (`performance.mark`), para a bancada medir onde o tempo vai (CEL-08, auditoria de
 * 17/11/2026: a 2ª sessão, com os modelos em cache, traduzia mais devagar que a 1ª, e o atraso estava entre o texto e a
 * tradução). A hipótese é a disputa entre a carga do STT e a do tradutor no início da sessão; as marcas separam as três
 * coisas: a carga do STT, a carga de cada modelo de tradução e o pedido de tradução de cada final (com a fila do worker).
 *
 * Todas começam com `frasy:` e levam o detalhe em `detail`: o harness lê `performance.getEntriesByType('mark')`
 * (`reports/auditoria-qualidade/celular/medir-celular.mjs`). Custo: uma entrada na linha do tempo por evento, nenhuma
 * por parcial. Sem `performance.mark` (Node antigo, worker sem a API): nada.
 */
export function marcar(nome: string, detalhe?: Record<string, unknown>): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    performance.mark(`frasy:${nome}`, detalhe ? { detail: detalhe } : undefined);
  } catch {
    /* a marca é diagnóstico: nunca derruba a captura */
  }
}
