> **Change retroativa.** Documenta a Fase B ("IA por custo") do plano aprovado `functional-doodling-crane`, que já
> está na `main` pelo merge `cd0aa88` (`perf/gratis-leve`). Os itens B0–B6 estão no código; o **B7** (trocar os
> padrões pelos vencedores da bancada) está **aberto**. Tudo aqui foi conferido no código, nos commits
> (`git log cd0aa88^1..cd0aa88^2`) e nos testes. As branches da fase:
> `feat/b-registro-de-provedores` (merge `690a623`, B0–B2), `feat/b5-bancada-provedores` (merge `961b725`, B5, sobre a
> base `feat/bancada-etapa5`, merge `6d64988`) e `feat/b3-niveis-e-cascata` (merge `de3fd39`, B3, B4 e B6).

## Why

Antes da Fase B, a IA de nuvem era montada para um provedor só e contada com uma régua errada:

- **O provedor era uma cadeia de variáveis** (`LLM_API_KEY || GROQ_API_KEY`, `LLM_RESERVA_*`, o atalho
  `OPENROUTER_API_KEY`, `STT_*`). Um terceiro provedor, o preço por provedor, o mínimo faturado do STT e a retenção
  declarada não cabiam nela (cabeçalho de `server/ai/registroDeProvedores.ts`).
- **O custo era por modelo, com o preço da Groq.** O mesmo `openai/gpt-oss-120b` custa US$ 0,15/0,60 por 1M de tokens
  na Groq e US$ 0,037/0,17 na DeepInfra (tabela em `server/lib/orcamentoDeIa.ts`). Com a cascata barata, o orçamento
  superestimaria o gasto e fecharia a nuvem antes da hora. O cache de prompt era ignorado, e o mínimo de 10 s por
  pedido de STT valia para qualquer provedor (commit `e010aec`).
- **O STT tinha uma perna só.** Um 429 ou uma queda mandava toda fala para o aparelho (cabeçalho de
  `server/ai/cascataDeStt.ts`).
- **O orçamento só tinha o corte duro a 100%.** Até lá, quem paga começava sempre no modelo mais caro, e a nuvem
  gastava os últimos dólares do mês no ritmo mais caro (cabeçalho de `server/ai/politicaDeCusto.ts`).
- **A disponibilidade do STT discordava da transcrição.** Com só `LLM_API_KEY` (o `.env.production.example`),
  `GET /api/ai/stt/available` respondia 200 e toda transcrição voltava 501 (commit `0b734f8`).

O dinheiro decide o plano: na pilha de hoje o Premium empata com ~40 h/mês, e as 60 h do uso justo só cabem com a
cascata barata medida (`openspec/changes/planos-v2/design.md`, "O custo decide o teto"). E o app atende menores: toda
troca de provedor precisa de retenção zero e nunca pode chegar ao Gemini.

## What Changes

- **B0 — STT de uma fonte só** (`0b734f8`). `sttGerenciadoDoEnv` (`server/lib/config.ts`) é a regra única da
  disponibilidade e da porta da transcrição: chave vazia conta como ausente, e a `LLM_API_KEY` só serve ao STT quando o
  LLM é a Groq. No mesmo commit, `avisoDeIaSemReserva` (`server/ai/provedores.ts`) avisa no boot de produção quando a
  IA não tem reserva (evento `ia_sem_reserva`, ADR 0008).
- **B1 — registro declarativo de provedores** (`29e5586`). `server/ai/registroDeProvedores.ts` lê `IA_PROVEDORES` (ou
  `IA_PROVEDORES_ARQUIVO`): um JSON sem segredo com formato (`openai | cloudflare`), base, o NOME da variável da chave,
  retenção, limites e modelos por função com preço. A ordem do array é a ordem da cascata. Sem ele, `registroLegado`
  reproduz a cascata de antes. O registro recusa o Gemini em qualquer forma (base ou modelo; Gemma passa), o
  OpenRouter sem o roteamento mínimo e o segredo dentro do JSON. Em produção recusa também o provedor sem
  `retencao: "zdr"` e a base sem https, e o boot aborta (`server.ts`). Todo pedido ao OpenRouter sai com
  `provider: { data_collection: "deny", zdr: true, ignore: ["google-ai-studio", "google-vertex"] }`
  (`server/ai/parametrosDoProvedor.ts`, `server/ai/llmClient.ts`).
- **B2 — custo por `fornecedor:modelo`** (`e010aec`). `server/lib/orcamentoDeIa.ts`: tabela oficial por
  `fornecedor:modelo`, com as linhas só-modelo como fallback. O preço declarado no registro vence, e
  `AI_PRECOS_MODELOS` aceita as duas chaves. Tokens do cache de prompt custam o preço de cache e, sem ele, a entrada
  inteira. O mínimo faturado do STT passa a ser do provedor. O custo sai uma vez, na perna que de fato respondeu
  (`server/ai/cascata.ts`), e vai igual ao orçamento, à métrica (`ia_provedor_custo_usd_total` e
  `ia_provedor_latencia_ms`, agora com os rótulos `fornecedor` e `modelo`) e ao Langfuse.
- **B3 — níveis por plano × função** (`5f1278c`). O contrato `rapida | nuance | polimento` e a escada entre eles
  (`src/core/nivelDeTraducao.ts`), o entitlement `traducaoNuance` (`src/core/planos.ts`) e a tabela `IA_NIVEIS`
  (`server/ai/niveis.ts`). No B3 a tabela tinha três funções (tradução, tutor e corretor), todas `rapida` sem a
  capacidade e `nuance` com ela. A linha `polimento` entrou depois, no D5 (`2b28066`). O campo `niveis` de cada modelo
  no registro diz a quem ele serve. No mesmo commit, o cache de tradução passa a gravar sob o modelo que respondeu.
- **B4 — admissão pelos limites do registro e degradação suave** (`56fa286`). `server/ai/admissao.ts`: os `limites`
  do modelo são o balde dele, e os do provedor são um balde só para a conta. Entra o balde de tokens por minuto
  (`tpm`). `server/ai/politicaDeCusto.ts`:
  - a 70% do orçamento (mês ou dia, o maior), o nível pago começa no degrau mais barato, e só quando o primeiro balde
    está abaixo de 20%;
  - a 90%, todos os níveis começam no degrau mais barato;
  - degradado, o `max_tokens` cai para 75%, só em modelo sem raciocínio;
  - a métrica é `ia_degradacao_de_custo_total{motivo,nivel}`.
- **B5 — bancada de nuvem** (`883e062`, `d38582c`, `b9b907b`, `5647c4d`, `f5cdc83`, `854f650`, `57214fc`,
  `bb2fb8b`, `d0a4d0c`). Os arquivos são `scripts/eval-fala/bancada/{nuvem,livroCaixa,decisao,sondar-contratos}.mjs` e
  as mudanças em `mt.mjs`/`stt.mjs`/`resumo.mjs`/`comum.mjs`. Completam o item o workflow
  `.github/workflows/bancada-nuvem.yml` (só manual, teto de US$ 3), o doc `docs/auditoria/eval/bancada-nuvem.md` e o
  `parametrosDoProvedor` extraído num módulo puro, para a bancada mandar o mesmo pedido da produção.
- **B6 — cascata do STT pelo custo efetivo** (`0d9748a`, mais `7ad08e8` no teste de deriva). `server/ai/cascataDeStt.ts`
  ordena as pernas de STT pelo custo deste áudio, com o mínimo faturado de cada uma, e fala os dois formatos: o
  multipart da OpenAI e o Workers AI da Cloudflare, com o áudio em base64 em `/ai/run/<modelo>`. Uma perna que falha
  passa para a próxima, e o disjuntor é por perna.
- **B7 — aberto.** Depende de o dono criar as chaves e rodar a bancada (teto de US$ 3). Trocar os padrões pelos
  vencedores:

  - no `IA_PROVEDORES`: `niveis`, preço, `minimoFaturadoS: 0` em quem cobra por segundo, `limites` e retenção;
  - atualizar `fly.toml`/`.env.production.example`, `docs/lgpd/operadores.md` e o ADR 0010, que está reservado para
    esta troca (`docs/adr/0011-*` e `0012-*`, nota do número).

  O D0 da Fase D (escolher o modelo da nuance e do polimento, `openspec/changes/traducao-nuance/`) também depende da
  bancada e sai da mesma execução.

**Fora do escopo:** a bancada multi-modelo anterior (`openspec/changes/bancada-multi-modelo/`, o
`medir-traducao-llm.mjs`, capacidade `avaliacao-multi-modelo`). Ela é a predecessora e **não** cobre o B5, que é outra
ferramenta (`scripts/eval-fala/bancada/`). Também ficam de fora a voz natural (formato `google-tts` e funções `tts`
do registro, Fase E), a Tradução Nuance no cliente (Fase D) e o núcleo sem Express (Fase F, `api-e-mcp`). Todos usam
o registro deste B1.

## Impact

- **Código (hoje na `main`):** `server/ai/{registroDeProvedores,parametrosDoProvedor,provedores,niveis,politicaDeCusto,cascataDeStt,cascata,admissao,llmClient,cacheDeTraducao,telemetriaDeIa,sttProxy}.ts`,
  `server/lib/{orcamentoDeIa,config,duracaoDeAudio,entitlements}.ts`, `server/http/metricas.ts`,
  `server/routes/tutor.ts`, `server.ts`, `src/core/{nivelDeTraducao,planos}.ts`. Na Fase F, a lógica que o B3/B4 pôs
  em `mtProxy.ts` mudou para `server/ai/nucleo/{traduzirNoNivel,sugerirAlternativas,polirLote,transcrever}.ts`
  (`openspec/changes/api-e-mcp/`).
- **Bancada:** `scripts/eval-fala/bancada/*`, `.github/workflows/bancada-nuvem.yml`, `docs/auditoria/eval/bancada-nuvem.md`.
- **Configuração:** `IA_PROVEDORES`, `IA_PROVEDORES_ARQUIVO`, `DEEPINFRA_API_KEY`, `CEREBRAS_API_KEY`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (só lidas se o registro as nomear) e `AI_PRECOS_MODELOS` com chave
  `fornecedor:modelo`. Estão documentadas em `.env.production.example` e `docs/LANCAMENTO.md` (passo 5). **Os padrões de
  produção não mudaram:** sem `IA_PROVEDORES`, vale o legado (Groq + OpenRouter).
- **Métricas e eventos:** rótulos `fornecedor`/`modelo` em `ia_provedor_custo_usd_total` e `ia_provedor_latencia_ms`,
  além de `ia_degradacao_de_custo_total`. Eventos novos: `ia_provedores_invalido`, `ia_provedor_sem_zdr` e
  `ia_sem_reserva`.
- **Testes:** 17 arquivos, 238 testes, verdes em `cd0aa88`. A lista está em `tasks.md`.
- **Specs:** duas capacidades novas, `provedores-de-ia` (B0–B4, B6) e `bancada-de-provedores` (B5). Nenhuma
  capacidade de `openspec/specs/` cobre o assunto. `planos-no-servidor` (o `LLM_MODEL_GRANDE` para quem tem
  `largerModels`) continua valendo sem `IA_PROVEDORES`. O entitlement `traducaoNuance` é da `matriz-de-planos`, via
  `planos-v2`.
- **Depende desta change:** o teto de 60 h do Premium (`planos-v2`, Non-Goals: "só depois do B7") e o D0 da Fase D
  (`traducao-nuance`, tasks 0.1–0.3).
