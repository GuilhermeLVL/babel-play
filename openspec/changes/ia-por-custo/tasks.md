> Change retroativa: os itens marcados estão na `main` pelo merge `cd0aa88`. Cada um cita o commit principal e o
> teste que o cobre. Os 17 arquivos de teste abaixo rodaram verdes em `cd0aa88` (238 testes, `npx vitest run`,
> 30/09/2026). Os itens abertos são o B7, o D0 e os riscos.

## B0 — STT de uma fonte só (`0b734f8`, merge `690a623`)

- [x] 0.1 `sttGerenciadoDoEnv` (`server/lib/config.ts`) é a regra única de `GET /api/ai/stt/available` e da porta da
      transcrição. Chave vazia conta como ausente, e a `LLM_API_KEY` só serve quando o LLM é a Groq. Coberto por
      `tests/integration/stt-disponivel-coerente.test.ts` (matriz "disponível ⇔ a porta deixa seguir").
- [x] 0.2 A caracterização de `/stt/available` com a chave de um LLM que não é a Groq passa de 200 para 501, o mesmo
      veredito do `POST /api/ai/stt`. Coberto por `tests/caracterizacao/ia.test.ts`.
- [x] 0.3 `avisoDeIaSemReserva` avisa no boot de produção (evento `ia_sem_reserva`, que vai ao Sentry; ADR 0008).
      Coberto por `tests/integration/aviso-sem-reserva.test.ts`.

## B1 — Registro de provedores (`29e5586`, merge `690a623`)

- [x] 1.1 `server/ai/registroDeProvedores.ts`: `IA_PROVEDORES` ou `IA_PROVEDORES_ARQUIVO` (as duas juntas são
      recusadas), com formato, base, nome da chave, retenção, limites e modelos por função com preço. A ordem do array
      é a cascata. Coberto por `tests/integration/registro-de-provedores.test.ts` ("registro declarado").
- [x] 1.2 O registro legado reproduz a cascata anterior em 4.608 ambientes, com e sem modelos grandes. Coberto por
      `registro-de-provedores.test.ts` ("registro legado").
- [x] 1.3 Recusas:

  - Gemini pela base (Generative Language, Vertex, AI Gateway) ou pelo modelo (`gemini`, `learnlm`); Gemma passa;
  - OpenRouter sem o roteamento mínimo;
  - segredo no JSON;
  - chave que não é de IA;
  - em produção, `retencao` diferente de `"zdr"` e base sem https.

  Coberto por `registro-de-provedores.test.ts` ("o que é RECUSADO").

- [x] 1.4 Registro inválido fecha a nuvem: nenhuma perna, o evento `ia_provedores_invalido` e nunca a volta ao legado.
      Coberto por `tests/integration/mt-cascata-reserva.test.ts` ("IA_PROVEDORES inválido: a nuvem FECHA (501)").
      Em produção o boot aborta (`server.ts`); só `erroDoRegistroDeIa` tem teste (ver 9.6).
- [x] 1.5 Legado em produção com base fora da Groq/OpenRouter: aviso `ia_provedor_sem_zdr`, sem recusar. Coberto por
      `registro-de-provedores.test.ts`.
- [x] 1.6 Todo pedido ao OpenRouter, direto ou pelo AI Gateway da Cloudflare, leva `data_collection: "deny"`,
      `zdr: true` e o `ignore` do Google. O declarado acrescenta e nunca afrouxa. Coberto por `tests/llmParametros.test.ts`
      e `registro-de-provedores.test.ts` ("o pedido ao OpenRouter sai SEMPRE com retenção zero e sem o Google").
- [x] 1.7 Telemetria por fornecedor neutro (`deepinfra`, `cerebras`, `cloudflare`, além dos de antes). Rótulos em
      lista fechada. Variáveis novas no catálogo `VARIAVEIS`, em `.env.production.example` e no passo 5 do
      `docs/LANCAMENTO.md`. Coberto por `tests/integration/config-inventario.test.ts` e `registro-de-provedores.test.ts`.

## B2 — Custo por `fornecedor:modelo` (`e010aec`, merge `690a623`)

- [x] 2.1 Tabela oficial por `fornecedor:modelo` em `server/lib/orcamentoDeIa.ts`, com as linhas só-modelo como
      fallback. O preço do registro vence, e `AI_PRECOS_MODELOS` aceita as duas chaves. Coberto por
      `tests/integration/custo-por-provedor.test.ts` ("custoDeLlm").
- [x] 2.2 Cache de prompt: os tokens do cache custam o preço de cache (Groq: 50%) e, sem ele, a entrada inteira. Cache
      maior que a entrada não gera custo negativo. Coberto por `custo-por-provedor.test.ts`.
- [x] 2.3 Mínimo faturado do STT por provedor (`minimoFaturadoDoStt`); sem declaração, 10 s. Coberto por
      `custo-por-provedor.test.ts` ("custoDeStt" e "STT: o custo usa o mínimo faturado DO PROVEDOR").
- [x] 2.4 O custo é calculado uma vez, na perna que respondeu (`server/ai/cascata.ts`), e vai ao orçamento, à métrica
      e ao Langfuse. `ia_provedor_custo_usd_total` e `ia_provedor_latencia_ms` ganham `fornecedor` e `modelo`; o que
      está fora do registro vira `outro`. Coberto por `custo-por-provedor.test.ts` ("o orçamento soma o preço de QUEM
      RESPONDEU").

## B3 — Níveis por plano × função (`5f1278c`, merge `de3fd39`)

- [x] 3.1 Contrato `rapida | nuance | polimento`, `niveisAtendidos` e `rebaixarNivel` em `src/core/nivelDeTraducao.ts`.
      Coberto por `tests/nivelDeTraducao.test.ts`.
- [x] 3.2 Entitlement `traducaoNuance` em `src/core/planos.ts`. Coberto pelo snapshot
      `tests/caracterizacao/__snapshots__/get.me.entitlements.json`.
- [x] 3.3 `IA_NIVEIS` e `cascataDoPlano` em `server/ai/niveis.ts`, pela capacidade e nunca pelo nome do plano. No B3
      a tabela tinha tradução, tutor e corretor. A linha `polimento` veio no D5 (`2b28066`) e a de `alternativas` no
      D4 (`0e45844`). Coberto por `tests/integration/niveis-de-traducao.test.ts`.
- [x] 3.4 Campo `niveis` por modelo no registro. `grande` é sinônimo de `["nuance"]`; os dois juntos, ou `niveis` só
      em STT, são recusados. O legado não muda. Coberto por `niveis-de-traducao.test.ts`.
- [x] 3.5 O cache de tradução grava sob o modelo que respondeu. Coberto por `tests/integration/niveis-na-rota.test.ts`
      ("o cache grava sob o modelo que DE FATO respondeu") e `tests/integration/cache-de-traducao.test.ts`.

## B4 — Admissão pelos limites e degradação suave (`56fa286`, merge `de3fd39`)

- [x] 4.1 Os limites do modelo são o balde dele; os do provedor, um balde da conta. Sem limite declarado valem as
      `IA_ADMISSAO_*`. Entram o balde `tpm` (recusa `tokens_minuto`) e `fracaoDoBalde`. Coberto por
      `tests/integration/admissao-por-provedor.test.ts`.
- [x] 4.2 `server/ai/politicaDeCusto.ts`, com os degraus de 70% e 90% por nível. A fração é a maior entre o mês e o
      dia, e o degrau mais barato é escolhido pelo preço de `fornecedor:modelo`. Coberto por
      `tests/integration/politica-de-custo.test.ts` ("decidirCusto (pura)").
- [x] 4.3 Degradado, `max_tokens` × 0,75 só em modelo sem raciocínio (`ehModeloDeRaciocinio`, em
      `server/ai/cascata.ts` → `maxTokensDaPerna`). Coberto por `politica-de-custo.test.ts` ("90% e o barato fora…").
- [x] 4.4 Aplicada na tradução e no tutor, com o orçamento forçado a 50, 70, 90 e 100% (mês e dia). Métrica
      `ia_degradacao_de_custo_total{motivo,nivel}`. Coberto por `politica-de-custo.test.ts` ("a degradação na rota,
      com o orçamento forçado").

## B5 — Bancada de nuvem (merge `961b725`, base `6d64988`)

A change `bancada-multi-modelo` é a predecessora (`medir-traducao-llm.mjs`) e não cobre este item. As tarefas 3.4 e
5.3 dela continuam abertas lá.

- [x] 5.1 `parametrosDoProvedor` num módulo puro (`883e062`), para a bancada mandar o pedido da produção. Coberto por
      `tests/llmParametros.test.ts`.
- [x] 5.2 Livro-caixa que reserva o pior caso antes da chamada (`d38582c`). Coberto por
      `tests/eval/bancada-livro-caixa.test.ts`.
- [x] 5.3 `nuvem.mjs` com DeepInfra, Cerebras e Cloudflare no `mt.mjs`/`stt.mjs`: o pedido da produção, a retenção
      com fonte e data e nunca o Gemini (`b9b907b`). Coberto por `tests/eval/bancada-nuvem.test.ts`, com a deriva
      contra a produção ajustada ao B6 em `7ad08e8`.
- [x] 5.4 `decisao.mjs`: a regra de troca em código, com margem declarada e o gold de conversa (`5647c4d`). Coberto por
      `tests/eval/bancada-decisao.test.ts`.
- [x] 5.5 `sondar-contratos.mjs`: um pedido mínimo por provedor × modelo; violação sai com código 1 (`f5cdc83`).
      Coberto por `tests/eval/bancada-sonda.test.ts`.
- [x] 5.6 Teto ou cota interrompem sem jogar fora os casos já respondidos (`854f650`, em `mt.mjs`/`stt.mjs`, sem teste
      próprio).
- [x] 5.7 `.github/workflows/bancada-nuvem.yml` (`57214fc`): só `workflow_dispatch`, `BANCADA_TETO_USD=3`, segredos só
      nas etapas que chamam provedor e sem cancelar execução paga.
- [x] 5.8 `docs/auditoria/eval/bancada-nuvem.md` (`bb2fb8b`): como rodar e ler, candidatos, os segredos que o dono cria
      e a estimativa de ~US$ 1 pela tabela.

## B6 — Cascata do STT pelo custo efetivo (`0d9748a`, merge `de3fd39`)

- [x] 6.1 `server/ai/cascataDeStt.ts`: `ordenarPorCustoEfetivo` com o preço e o mínimo de cada perna; empate fica com
      a ordem do registro. Coberto por `tests/integration/cascata-de-stt.test.ts` ("custo efetivo").
- [x] 6.2 Dois formatos: o multipart da OpenAI (com o recuo `verbose_json` → `json`) e o Workers AI em
      `/ai/run/<modelo>` com base64, com a resposta normalizada e a mesma triagem. Coberto por
      `cascata-de-stt.test.ts` ("os dois formatos" e "Cloudflare: os segmentos passam pela MESMA triagem").
- [x] 6.3 429, 5xx, timeout e rede passam adiante. O 5xx só se repete na última perna, o disjuntor é por perna e a
      perna da porta não chamada devolve o pedido. Coberto por `cascata-de-stt.test.ts` ("POST /api/ai/stt — a
      cascata").
- [x] 6.4 O registro anuncia a Cloudflare como STT de nuvem (`endpointDaTranscricao`, `sttGerenciado`). Coberto por
      `cascata-de-stt.test.ts` e `registro-de-provedores.test.ts`.

## B7 — Trocar os padrões pelos vencedores (ABERTO)

Depende das chaves do dono e de uma execução da bancada (teto de US$ 3).

- [ ] 7.1 O dono cria os segredos do Actions listados em `bancada-nuvem.md` (os nomes; nunca o valor num arquivo).
- [ ] 7.2 Rodar a sonda de contrato e a bancada completa (`limite` 0), e guardar o artefato `bancada-nuvem` com a
      decisão e o livro-caixa.
- [ ] 7.3 Escolher os vencedores. É decisão do dono, ver "Perguntas ao dono" em `design.md`.
- [ ] 7.4 Se um vencedor usa ajuste `@esforço` (`foraDaProducao`), levar o parâmetro para `parametrosDoProvedor` antes
      da troca (`decisao.mjs`, aviso do ajuste).
- [ ] 7.5 Escrever o `IA_PROVEDORES` de produção:
  - `niveis` em cada modelo de tradução e tutor;
  - `preco` de toda perna nova (sem ele vale o conservador, ver `design.md`, Risks);
  - `minimoFaturadoS: 0` só em quem comprovadamente cobra por segundo (`bancada-nuvem.md`: "não publicado");
  - `limites` da conta de cada provedor;
  - `retencao: "zdr"` conferida no painel.
- [ ] 7.6 Atualizar `fly.toml` (`[env]`, se for a decisão) e `.env.production.example`, trocando o exemplo pelos
      padrões novos.
- [ ] 7.7 Atualizar `docs/lgpd/operadores.md` e `public/privacidade.html` com os provedores que passam a receber áudio
      ou texto. Isto cobre também a 5.3 de `bancada-multi-modelo`.
- [ ] 7.8 ADR 0010 (número reservado): a troca de provedores com o custo medido.
- [ ] 7.9 Refazer a conta do custo (`scripts/custo/modelo.mjs`) com o custo medido e levar ao dono a decisão das 60 h
      (`planos-v2`).

## D0 — Depende da bancada (ABERTO)

- [ ] 8.1 O D0 da Fase D escolhe o modelo de `niveis: ["nuance"]` e o de `["polimento"]` pela bancada. Os itens dele
      estão em `openspec/changes/traducao-nuance/tasks.md` (0.1–0.3) e não são repetidos aqui. A marcação dos `niveis`
      é o mesmo passo da 7.5: B7 e D0 saem da mesma execução da bancada.

## Riscos a verificar (ABERTOS)

- [ ] 9.1 Ogg Opus no STT da Cloudflare: provar com áudio real antes de pôr a perna em produção. A sonda e a bancada
      mandam WAV.
- [ ] 9.2 Lista heurística de modelos "com raciocínio": o PR #57 (`fix/raciocinio-observado`) confirma via
      `reasoning_tokens`. Está aberto, pendente de merge.
- [ ] 9.3 O "restam X" do alívio usa o preço do STT legado: o PR #52 (`fix/alivio-preco-da-cascata`) usa a perna que a
      cascata chama. Está aberto, pendente de merge.
- [ ] 9.4 Cloudflare + gpt-oss: confirmar pela sonda se o `reasoning_effort` é aceito.
- [ ] 9.5 Documentação desatualizada:
  - `docs/auditoria/eval/bancada-nuvem.md` diz que o `ignore` do Google "ainda não está na produção", mas o B1 o pôs;
  - `src/core/nivelDeTraducao.ts` diz que o `polimento` está "ainda sem rota", mas o D5 a criou;
  - `.env.production.example` cita só `provider.zdr=true` para o OpenRouter e "o plano Pro" no `LLM_MODEL_GRANDE`.
- [ ] 9.6 Teste de processo para o boot que aborta com `IA_PROVEDORES` inválido em produção.
