/**
 * A FACHADA da camada de dados do cliente.
 *
 * Toda a camada fala com as rotas do servidor por AQUI, e mapeia as linhas do banco para os shapes
 * que a UI já usa (`Recording`, `VocabCard`).
 *
 * ─── O QUE FICA NESTE ARQUIVO, E POR QUÊ ───
 *
 * NADA além de reexportações. Este arquivo não tem código próprio, e isso é a correção de um
 * problema concreto: enquanto o funil (`apiFetch`, `lerErro`) morava aqui, cada `./rotas/*.ts` o
 * importava DE VOLTA de um arquivo que reexporta os `rotas/*` — dez ciclos de importação, com
 * `npm run morto:ciclos` (madge) como portão de CI. O funil foi para `./funil.ts`, que é uma FOLHA:
 * ninguém o reexporta, então não há volta e não há ciclo.
 *
 * A regra `audit/rules/ast-grep/fetch-fora-do-funil.yml` cita o caminho do funil LITERALMENTE no
 * seu `ignores` — hoje `src/data/funil.ts`, e não mais este arquivo, que não tem `fetch` algum.
 * Se a chamada de `fetch` voltar para cá, o `ignores` e a `message` da regra têm de voltar juntos.
 *
 * As funções por rota moram em `./rotas/<domínio>.ts`, com o MESMO recorte do espelho anônimo
 * (`./efemero/rotas/<domínio>.ts`): este contrato tem dois lados, e enquanto cada um era um
 * arquivo de ~1000 linhas não havia como comparar `sessoes` com `sessoes`. Agora há.
 *
 * Este arquivo REEXPORTA tudo: os ~50 importadores de `data/api` continuam valendo, e nenhum
 * símbolo público mudou de nome ou de lugar do ponto de vista de quem consome.
 */

// ───────────────────────────── O funil ─────────────────────────────
// `apiFetch`, `lerErro`, `ErroDaApi`, `IMPORT_TIMEOUT_MS`. Mora em folha por causa do ciclo (acima).
export * from './funil'

// ───────────────────────────── As rotas, por domínio ─────────────────────────────
// Um arquivo por domínio de rota, na MESMA divisão do espelho sem conta (./efemero/rotas/).
// Onde um domínio existe só de um lado, isso está escrito no cabeçalho do arquivo e cobrado por
// `tests/contratos/rotas-espelhadas.test.ts`.

export * from './rotas/conta'
export * from './rotas/credenciais'
export * from './rotas/economia'
export * from './rotas/exercicios'
export * from './rotas/imagens'
export * from './rotas/importacao'
export * from './rotas/metricas'
export * from './rotas/sessoes'
export * from './rotas/settings'
export * from './rotas/vocabulario'
