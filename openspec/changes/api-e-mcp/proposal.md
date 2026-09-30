## Why

O plano aprovado (`functional-doodling-crane`, Fase F) prevê, mais tarde, uma **API com chave** e um **servidor
MCP remoto** sobre as funções de IA do Babel Play — traduzir no nível do plano, sugerir outras formas, polir
uma sessão, ler em voz natural e transcrever. Hoje nada disso existe, e a Fase F NÃO o implementa: ela
entrega os **ganchos**, para que a API e o MCP, quando vierem, chamem exatamente o mesmo código que o app.

O risco que motiva a change é concreto: até a Fase F a regra de cada função (entitlement, flag,
configuração, cache, portão do orçamento, admissão, cota do mês e do dia, cascata de provedores, custo)
estava escrita DENTRO dos handlers do Express, recusando com `res.status(...)`. Uma API feita por cópia
divergiria na primeira mudança de cobrança ou de retenção — e o app atende menores.

## What Changes

**Entregue na Fase F (ganchos, sem API):**

- `server/ai/nucleo/`: `traduzirNoNivel`, `sugerirAlternativas`, `polirLote`, `sintetizarVoz`,
  `admitirTranscricao` + `transcrever`. Recebem um `ContextoDeIa` (quem pede, já resolvido) e o pedido
  validado (`lerPedido…`), e devolvem o resultado ou uma `RecusaDeIa` (`status`, `code`, `retryAfterS`,
  corpo). Nenhum `req`/`res`; uma regra de lint impede o Express de voltar.
- As rotas `/api/ai/{mt,mt/alternativas,mt/polir,tts,stt}` viraram adaptadores finos, com os mesmos
  status, códigos, cabeçalhos, métricas, logs e custo.
- A regra "fora do app, só adulto" já mora no núcleo (`canal` + `perfilProtegido` → 403 `perfil_protegido`).
- ADR 0012.

**Desenhado aqui, para uma change futura (com tasks próprias):**

- **Chaves de API**: tabela nova com o HASH da chave (nunca a chave), escopos por função, revogação e
  último uso; namespace **`/v1`**, autenticado por `Authorization: Bearer`.
- **Medição** por chave em `usage_counters` (`user_id = api:<keyId>`) e limite de taxa por chave no
  `rateLimitStore` (balde `ratelimit:api`), além da cota do plano do dono.
- **Servidor MCP remoto** (transporte HTTP) com **OAuth 2.1 + PKCE**, ferramentas que são as mesmas
  funções do núcleo, com os mesmos escopos.
- **Só para adultos**, com as mesmas regras de **retenção zero** do app e **nunca a API do Gemini**.

## Non-Goals

- Implementar a API, a tabela de chaves, a tela de chaves, o servidor MCP ou o fluxo OAuth — tudo isso
  é da change que vier depois desta, com tasks e testes próprios.
- Preço da API, plano que a inclui e tetos por chave: são decisões do dono (perguntas abertas no
  `design.md`).
- Expor o tutor pela API: ele continua preso ao Express (`server/routes/tutor.ts`) e fora da Fase F.
- Mudar qualquer comportamento do app: a Fase F é refactor; os testes de rota, de caracterização, de
  segurança e o contrato da API ficaram iguais.

## Impact

Entregue: `server/ai/nucleo/*` (novo), `server/ai/{mtProxy,alternativas,polimento,ttsProxy,sttProxy}.ts`
(adaptadores), `server/ai/{reservaDeNuvem,respostaDoNucleo}.ts`, `server/validation.ts` (`parseOuMotivo`),
`eslint.config.js`, `tests/integration/nucleo-de-ia.test.ts`, `docs/adr/0012-*`.

Futuro (desenho): migração nova (`chaves_de_api`), `server/http/app.ts` (montagem do `/v1` e do `/mcp`),
um middleware de chave, `server/lib/flags.ts` (avaliar flag por `userId`, sem `req`), `docs/lgpd/*`
(a API como tratamento), `tests/contratos/api-contrato.json` (o `/v1` no contrato), `.env*.example`.
