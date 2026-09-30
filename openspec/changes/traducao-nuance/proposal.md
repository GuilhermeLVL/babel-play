> Change RETROATIVA. Documenta a Fase D ("Tradução Nuance") do plano aprovado `functional-doodling-crane`,
> já entregue na `main` pelo merge `cd0aa88` (da `perf/gratis-leve`). Branches: `feat/d-traducao-nuance`
> (D1–D4 e D6, merge `654bae7`) e `feat/d-polir-sessao` (D5 e D7, merge `1d31327`). O D0 (o modelo da
> Nuance) continua aberto. Na Fase F (change `api-e-mcp`, ADR 0012) a regra das três rotas de IA desta
> fase saiu do Express para `server/ai/nucleo/`; os caminhos citados aqui são os de hoje.

## Why

A decisão do dono (29/09/2026, change `planos-v2`) é vender o que a pessoa sente, e não "qualidade melhor":
o Grátis é apresentado como "Tradução rápida ao vivo" e o Premium traz a "Tradução Nuance"
(`src/core/nivelDeTraducao.ts`, `docs/monetizacao.md`). A Fase C criou o entitlement `traducaoNuance`
(verdadeiro no Premium e no self-host, falso no Grátis e no convidado, `src/core/planos.ts`). A Fase B (B3,
`5f1278c`) criou os níveis `rapida | nuance | polimento` e a tabela `IA_NIVEIS` (`server/ai/niveis.ts`).
Faltava o que o Premium entrega de fato:

- **O nível vinha só do plano.** Antes do D1, `/api/ai/mt` chamava `cascataDoPlano('traducao', plano)`: quem
  pagava recebia a nuance em toda tradução, inclusive na legenda ao vivo, que roda o tempo todo e cujo
  custo foi calculado com o modelo rápido (diff de `cd76edb` em `server/ai/mtProxy.ts`).
- **Sem registro nem variante.** `pt-PT` ia ao modelo como "português" e saía à brasileira (`519e4b5`).
- **Sem glossário pessoal**, **sem outras formas de dizer uma frase** e **sem revisão da sessão com
  contexto**: a legenda traduz frase a frase, sem ver a conversa (`src/lib/traducao/promptDoPolimento.ts`).

## What Changes

- **D0 — o modelo da Nuance (ABERTO).** Escolher, pela bancada de nuvem (`.github/workflows/bancada-nuvem.yml`,
  só manual, teto de US$ 3 por execução, segredos do dono), o modelo que o registro marca com
  `niveis: ["nuance"]` (e `["polimento"]`). Sem modelo marcado, a nuance é a própria rápida
  (`tests/integration/niveis-de-traducao.test.ts`, "sem modelo marcado para a nuance, a nuance é a
  própria rápida"). Nada foi entregue neste item.
- **D1 — o nível pedido, rebaixado no servidor** (`cd76edb`). `POST /api/ai/mt` aceita
  `nivel: 'rapida' | 'nuance'`. `nivelDaTraducaoPedida` passa sempre por `rebaixarNivel`: sem
  `traducaoNuance`, a rápida, sem erro. Sem `nivel` (a legenda ao vivo) é a rápida também para quem paga;
  `NUANCE_AO_VIVO=1` liga a nuance ao vivo. `nivel: 'polimento'` é 400. Arquivos de hoje:
  `server/ai/niveis.ts`, `src/core/nivelDeTraducao.ts`, `server/ai/nucleo/traduzirNoNivel.ts` (desde
  `4675c13`), `server/ai/mtProxy.ts` (adaptador), `server/lib/config.ts`, `.env.production.example`.
- **D2 — registro e variantes** (`519e4b5`). `registro` (`formal | informal`) e `variante`
  (`pt-BR | pt-PT | es-419 | es-ES`) no `/mt`, só com `traducaoNuance`; sem ela, o prompt e a chave do cache
  são os de antes. Arquivos: `src/lib/traducao/promptComunicativo.ts`, `server/ai/nuanceDaTraducao.ts`.
- **D3 — glossário pessoal à prova de injeção** (`612c1d9`). Migração **0042** (`glossario`), rotas
  `GET/POST /api/ai/glossario` e `DELETE /api/ai/glossario/:id`, até 500 entradas por pessoa e até 12 por
  pedido, como DADO delimitado, e nunca no cache compartilhado. Arquivos: `server/ai/glossario.ts`,
  `server/ai/rotasDoGlossario.ts`, `server/db/repositories/glossario.ts`, `server/db/repositories/conta.ts`
  (`TABELAS_DO_TITULAR`), `src/data/apiDaNuance.ts` e, em `src/components/views/captura/nuance/`,
  `FixarNoGlossario.tsx`, `NuanceDaPalavra.tsx` e `ConviteDaNuance.tsx`.
- **D4 — "Outras formas"** (`0e45844` no servidor, `7080788` na tela). `POST /api/ai/mt/alternativas`: até 3
  formas e uma nota, só com `traducaoNuance` (402 `exige_nuance`), sem cache. No celular, a folha da frase;
  no computador, um botão em cada fala final da conversa abre um diálogo com a mesma Nuance. A forma
  escolhida troca a tradução no balão. Arquivos: `server/ai/nucleo/sugerirAlternativas.ts` (desde
  `4ccadf7`), `server/ai/alternativas.ts` (adaptador), `src/lib/traducao/promptDasAlternativas.ts`,
  `src/components/views/captura/nuance/NuanceDaFrase.tsx`, `src/components/views/captura/celular/FolhaDaFrase.tsx`,
  `src/components/ChatTranscript.tsx`.
- **D5 — "Polir a tradução da sessão"** (`2b28066`, `0925269`, `9be4777`, `9a28848`, `b91e7c4`).
  `POST /api/ai/mt/polir`, um bloco de até 40 falas por pedido, no nível `polimento`; migração **0044**
  grava a polida ao lado da original. Progresso, cancelar e retomar na aba Transcrição da Análise; retomar a
  captura não apaga a polida das falas que voltam iguais. Arquivos: `server/ai/nucleo/polirLote.ts` (desde
  `070a860`), `server/ai/polimento.ts` (adaptador), `src/lib/traducao/promptDoPolimento.ts`,
  `server/db/repositories/{utterances,sessions}.ts`, `src/components/views/analise/PolirSessao.tsx`,
  `src/lib/analise/polimentoDaSessao.ts`.
- **D6 — painel "Tradução Nuance" nos Ajustes** (`bfd1bfc`). Ajustes → Idiomas: registro padrão
  (Automático, Formal, Informal), variante do português e do espanhol, e o glossário listado ("x de 500") e
  apagável. A legenda ao vivo leva ao servidor só o que foge do padrão, e só com `traducaoNuance`. Arquivos:
  `src/components/views/ajustes/PainelDaNuance.tsx`, `src/lib/preferencias.ts`,
  `src/lib/traducao/preferenciasDaNuance.ts`, `src/gateway/adapters/serverLlmMt.ts`.
- **D7 — e2e** (`c978d1e`, ajuste do toque em `bb60d50`). `tests/e2e-publico/nuance-alternativas.e2e.ts`
  (Pixel 7 emulado) e `tests/e2e-publico/nuance-polir.e2e.ts` (desktop), com a IA simulada na página.

## Non-Goals

- **A tela de Planos.** "Tradução rápida ao vivo" e "Tradução Nuance" como nomes dos planos, e a tela sem `%`
  e sem "qualidade", são do C7 da change `planos-v2` (`tests/planos-tela-v2.test.tsx`).
- **O Batch da Groq no polimento.** Ficou como ponto de extensão comentado em `server/ai/nucleo/polirLote.ts`
  ("fica para depois (plano da Fase D)").
- **A API `/v1` e o MCP** sobre estas funções: change `api-e-mcp`.
- **Decidir o teste de 14 dias nas "Outras formas"** (ver "Perguntas ao dono" em `design.md`).

## Impact

- **Rotas novas:** `POST /api/ai/mt/alternativas`, `POST /api/ai/mt/polir`, `GET /api/ai/glossario`,
  `POST /api/ai/glossario`, `DELETE /api/ai/glossario/:id` (`server/routes/ai.ts`,
  `tests/contratos/api-contrato.json`). **Rota alterada:** `POST /api/ai/mt` aceita `nivel`, `registro` e
  `variante`.
- **Migrações:** 0042 `glossario` (tabela nova, `UNIQUE (user_id, origem, destino, termo_norm)`) e 0044
  `traducao_polida` (quatro colunas nulas em `utterances`: `traducao_polida`, `polimento_modelo`,
  `polimento_versao`, `polido_em`). As duas são aditivas; a ordem no journal é 0042 → 0043 (Fase C) → 0044 →
  0045 (merge `8dfb893`).
- **Entitlement:** `traducaoNuance` (criado no C1 da `planos-v2`) passa a decidir o nível, o registro, as
  variantes, a gravação no glossário, as "Outras formas" e o polimento. Nenhuma decisão lê o nome do plano.
- **Funções de IA novas** em `FUNCOES_DE_IA` (`server/ai/funcoesDeIa.ts`): `alternativas` (500 caracteres de
  entrada, 900 tokens de saída) e `polimento` (12.000 e 1.500). Linhas novas em `IA_NIVEIS`.
- **Configuração:** `NUANCE_AO_VIVO` (desligada por padrão).
- **Telas:** folha da palavra, folha da frase, conversa no computador, aba Transcrição da Análise, Ajustes →
  Idiomas. Textos por `t()`; `public/i18n/{en,xx}.json` e `src/data/i18n/cobertura.json` regenerados.
- **LGPD:** o glossário entra em `TABELAS_DO_TITULAR`; a polida sai na exportação pela tabela `utterances`.
- **Testes:** `tests/seguranca/{modelo-por-plano-nivel,glossario-injecao,idor}.test.ts`,
  `tests/integration/{nuance-registro-e-variante,glossario,alternativas,polimento,niveis-de-traducao,nucleo-de-ia}.test.ts`,
  `tests/caracterizacao/{glossario,ia}.test.ts`, `tests/caracterizacao/__snapshots__/paridade.faltando-no-espelho.json`,
  `tests/{nuanceNasFolhas,painelDaNuance,polirSessao}.test.tsx`,
  `tests/{preferenciasDaNuance,serverLlmMt-nuance,polimentoDaSessao,promptComunicativo,promptDasAlternativas,promptDoPolimento}.test.ts`,
  `tests/e2e-publico/{_nuance,nuance-alternativas.e2e,nuance-polir.e2e}.ts` (job "E2E com AUTH_REQUIRED=1" do
  `.github/workflows/ci.yml`).
