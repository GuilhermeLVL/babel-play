# Grafo v2 — mapa da aplicação atualizado (2026-08-31, à noite)

Reconstrução incremental (`/graphify --update --directed`) sobre o grafo de 30/08, depois dos ~55
commits desta rodada (billing, economia v2, UX, gating, specs). **4.190 nós, 10.145 arestas, 261
comunidades**; saúde da extração: 0 arestas penduradas/faltantes/laço, 1 colapso trivial.

Abrir o mapa interativo: `graphify-out/graph.html` (estilo neurônio; filtro por comunidade).

## O que o grafo diz de saúde estrutural

- **Componente principal: 3.515 dos 4.190 nós (84%)** — a aplicação é um organismo só; não há
  subsistema de produto desligado do resto.
- **73 componentes menores**, e a lista é tranquilizadora: package.json/tsconfigs (metadados),
  migrações SQL (isoladas por natureza), scripts avulsos (backup, eval-fala) e testes
  autocontidos. Os dois únicos "desligados" com cara de código de produto são CONHECIDOS e
  deliberados:
  - `src/gateway/ocr.ts` (7 nós) — guardado de propósito (openspec vision-ocr-web).
  - `functions/api/rank/[[path]].ts` (7 nós) — Function do Cloudflare Pages; vive fora do
    Express por DESENHO (deploy separado, ligada pelo wrangler.toml, não por import).
- **Isolados grau 0: 19**, todos metadado/migração/dependência — nenhum módulo de app órfão.
  O código morto do grafo-v1 (streamingCloudStt, barril de repositories) já saiu (A8).

## Nós-deus (as abstrações que tudo toca)

`Play()` 86 arestas · `apiFetch()` 83 · `LiveCapture()` 73 · `AgeProfileType` 73 ·
`asUserId()` 68 · `setupEphemeralDb()` 56 · `App()` 52 · `VocabCard` 50 · `Analysis()` 42.

Leitura: os hubs são os esperados (tela de jogos, funil único de API, captura, tipo de perfil).
`AgeProfileType` com 73 arestas confirma que o sistema de perfis de exibição é transversal — e
que a tabela COPY centralizada foi a decisão certa (antes disso seriam 73 ternários espalhados).
`LiveCapture()` e `Play()` continuam os maiores arquivos-Deus (4k+ linhas) — candidatos a
fatiamento QUANDO houver motivo funcional, não por estética.

## Conexões que valem registro

- A cadeia `FONTES.md (trilha) ↔ privacidade.html ↔ specs` aparece como semanticamente ligada —
  a postura "local primeiro" está coerente entre código, dados e texto legal (bom sinal para o
  portfólio: o discurso bate com o grafo).
- `og.png ≈ hub.png` (duplicata deliberada, marcada AMBIGUOUS pelo extrator de visão).

## Diferença para o grafo-v1

O v1 (30/08) achou 3 módulos mortos → 2 removidos, 1 mantido com decisão registrada. O v2 não
encontra NENHUM módulo de produto órfão novo. As adições da rodada (billing, economia,
CardDePlanos, MenuDeConforto) entraram já conectadas ao componente principal.

## Custo

Extração incremental: 762 arquivos re-extraídos (633 código via AST, grátis; 129 docs/imagens
via 7 subagentes, ~659k tokens de entrada).
