## Context

Retrato de `cd0aa88` (30/09/2026). Estas decisões já estão no código. O texto registra o porquê de cada uma, com o
arquivo que a implementa. O que ainda depende de dinheiro e de medição (B7) está em "Risks" e em "Perguntas ao dono".

Duas restrições atravessam tudo:

- **O app atende menores.** Não há Gemini, em nenhuma forma, e todo salto de nuvem declara retenção zero
  (`registroDeProvedores.ts`, "AS RECUSAS"; `parametrosDoProvedor.ts`, "RETENÇÃO").
- **O custo decide o plano.** O teto mensal do Premium é o empate de custo na pilha de hoje (40 h). As 60 h só vêm
  depois de o B7 medir a cascata barata (`src/core/planos.ts`, `openspec/changes/planos-v2/design.md`).

## Goals / Non-Goals

**Goals:**

- vários provedores declarados num lugar só, sem segredo e com a mesma cascata de antes quando nada é declarado;
- o custo de cada chamada pelo preço de quem de fato respondeu;
- o nível do modelo pela capacidade do plano;
- a degradação antes do corte duro;
- o STT mais barato para cada áudio;
- uma bancada que prove a troca antes de ela acontecer, sem passar de US$ 3 por execução.

**Non-Goals:** trocar os padrões de produção (B7, aberto) e decidir o teto de 60 h (`planos-v2`). A voz natural (E4)
e a API/MCP (Fase F) apenas reusam este registro.

## Decisions

### 1. Um registro declarativo, e o legado derivado dele (B1)

- **Um JSON sem segredo** (`IA_PROVEDORES` ou `IA_PROVEDORES_ARQUIVO`, nunca os dois). `chave` e `conta` são NOMES de
  variáveis, conferidos por padrão (`*_API_KEY | *_API_TOKEN`, `*_ACCOUNT_ID`). `ASAAS_API_KEY` e `RESEND_API_KEY`
  são recusadas, e campo com cara de segredo (`apiKey`, `token`…) derruba o registro inteiro. O valor é lido do
  ambiente na hora da chamada. Provedor sem a chave no ambiente não vira perna.
- **A ordem do array é a cascata.** Uma variável por dimensão (provedor, preço, mínimo, retenção) repetiria o
  espalhamento que o achado A31 já tinha consertado (cabeçalho do arquivo).
- **O legado tem o mesmo formato.** `registroLegado` monta o registro a partir das `LLM_*`/`GROQ_*`/`LLM_RESERVA_*`/
  `OPENROUTER_API_KEY`/`STT_*`. O teste de equivalência compara com uma cópia literal do `provedores.ts` anterior em
  4.608 ambientes. A única diferença, de propósito, é aparar a chave com espaço em volta.
- **Inválido fecha a nuvem, não volta ao legado.** Voltar em silêncio mandaria o tráfego para onde o operador acabou
  de decidir não mandar. Em produção o boot aborta (`server.ts`). Fora dela, nenhuma perna e um
  `ia_provedores_invalido` por erro distinto.
- **Retenção zero é declarada, não medida.** No registro declarado em produção, `retencao` diferente de `"zdr"` é
  recusada. No legado, uma base fora da Groq/OpenRouter só gera o aviso `ia_provedor_sem_zdr`: recusar mudaria quem
  já opera assim. A sonda do B5 mostra os cabeçalhos e campos de retenção ao lado do que foi declarado, e o
  `LANCAMENTO.md` pede para conferir no painel de cada provedor antes de declarar.
- **OpenRouter endurecido no pedido.** `roteamentoEndurecido` reimpõe `data_collection: "deny"`, `zdr: true` e o
  `ignore` dos dois provedores do Google, e tira `google*` de `only`/`order`. O mesmo vale pelo AI Gateway da
  Cloudflare (`ehBaseDoOpenRouter`). O declarado acrescenta, nunca afrouxa.

### 2. Preço por `fornecedor:modelo`, na perna que respondeu (B2)

- **A ordem de precedência** (`precoDe`): o preço declarado no registro; `AI_PRECOS_MODELOS` por `fornecedor:modelo`
  e por modelo; a tabela oficial nas mesmas duas chaves; e por fim o preço conservador (LLM US$ 1/3 por 1M, STT
  US$ 0,111/h, mínimo de 10 s).
- **Errar para mais, de propósito.** Sem preço de cache, o cache custa a entrada inteira. Sem mínimo declarado, vale
  10 s. Sem preço nenhum, vale o conservador. Um modelo novo nunca fica invisível ao orçamento.
- **Uma conta só.** `percorrerCascata` calcula `custoUsd` uma vez sobre a perna que entregou, e o mesmo número vai ao
  orçamento, à métrica e ao Langfuse. O rótulo de métrica fora do registro vira `outro`, para a cardinalidade não
  crescer.

### 3. Nível pela capacidade; a escada desce, nunca sobe (B3)

- **O entitlement decide, não o nome do plano.** `rebaixarNivel` lê `traducaoNuance`. Um `plan === 'pro'` teria
  virado, no rename da Fase C, um pagante recebendo o modelo do Grátis sem erro (`src/core/nivelDeTraducao.ts`).
- **A escada.** `niveisAtendidos`: polimento → nuance → rápida. A rápida é só rápida. Quem não paga nunca chega a um
  modelo marcado só para a nuance, nem como reserva. Dentro de cada nível vale a ordem do registro.
- **`grande: true`**, o provisório do B1, é sinônimo de `niveis: ["nuance"]`. Os dois juntos são recusados, e
  `niveis` num modelo só de STT também. No legado, o `LLM_MODEL_GRANDE` continua sendo o modelo de quem tem
  `largerModels`.
- **O cache de tradução grava sob o modelo que respondeu.** Antes, com o primário fora, a tradução da reserva ficava
  30 dias na chave do modelo caro (`5f1278c`).

### 4. Degradação 70/90 pelo preço, não pela posição (B4)

- **A fração é a maior entre o mês e o dia**, lida nas mesmas consultas do `portaoDaNuvem`, sem ida extra ao banco.
- **Os limiares por nível** (`LIMIARES_POR_NIVEL`):
  - a rápida só tem o degrau dos 90%, porque ela já é o barato;
  - nuance e polimento têm os dois;
  - aos 70%, a descida só acontece com o primeiro balde abaixo de 20% (`fracaoDoBalde`): é a demanda dizendo que o
    caro vai recusar de qualquer jeito.
- **O degrau mais barato é escolhido pelo preço de `fornecedor:modelo` para este pedido** (tokens de entrada
  estimados e o `max_tokens` como saída), com empate para quem vem antes. O operador ordena a cascata por
  preferência, não necessariamente por preço. O resto da cascata segue atrás, na ordem dela.
- **`max_tokens` × 0,75 só em modelo sem raciocínio** (`ehModeloDeRaciocinio`, lista por nome). Num modelo que pensa,
  o raciocínio sai do mesmo teto, e cortar devolveria resposta vazia. Na dúvida a lista diz "pensa": errar para esse
  lado só deixa de economizar.
- **O corte duro continua no portão** (503 a 100%). A política só reordena o que o portão deixou passar.

### 5. STT pelo custo efetivo de cada áudio (B6)

- A ordem das pernas é recalculada por pedido (`ordenarPorCustoEfetivo`): a duração é arredondada para cima e elevada
  ao mínimo faturado de cada perna, pelo preço dela. Uma fala de 3 s vai primeiro para quem cobra por segundo. Em
  30 s, o preço por hora volta a mandar. No empate vale a ordem do registro.
- **A admissão acontece em dois tempos.** A porta admite a primeira perna com saldo (a duração ainda não é conhecida).
  As outras são admitidas no balde delas na hora da chamada, e a da porta que não foi chamada devolve o pedido.
- **Falha passa adiante** (429, 5xx, timeout, rede e também 4xx). A retentativa do 5xx fica só na última perna. O
  disjuntor é por perna (base + modelo).
- **A Cloudflare fala outro formato:** `POST …/ai/run/<modelo>` com um JSON de `audio` (base64), `task`, `language`
  e `initial_prompt`, sem `temperature`. A resposta é normalizada para a forma do `verbose_json` e passa pela mesma
  triagem de segmentos. Cada segmento do modelo no caminho é conferido, para `@cf/../../x` não subir de rota.

### 6. A bancada manda o pedido da produção e para antes do teto (B5)

- **O mesmo pedido da produção.** `nuvem.mjs` importa `promptComunicativo`, `maxTokensDaTraducao` e
  `parametrosDoProvedor` em vez de copiá-los. Por isso o `parametrosDoProvedor` virou um módulo sem imports
  (`883e062`). O sufixo `@esforço` é um ajuste fora da produção: o bruto marca `foraDaProducao` e a decisão avisa.
- **O teto vale antes da chamada.** `livroCaixa.mjs` reserva o pior caso antes de cada tentativa (o `max_tokens`
  inteiro, 1 token por caractere mais 256 e o mínimo do STT) e recusa quando o gasto somado às reservas em voo passaria
  do teto.
- **A regra de troca está em código** (`decisao.mjs`). O veredito é o pior corpus. O gold de conversa não pode piorar.
  Custo desconhecido não aprova. "Aprovado" quer dizer que a regra permite a troca; quem troca é o dono.

## Risks / Trade-offs

- **Ogg Opus no STT da Cloudflare, não provado.** O cliente manda cada fala em Ogg Opus desde 28/09
  (`server/lib/duracaoDeAudio.ts`), e a perna da Cloudflare repassa esse áudio em base64. O schema conferido diz que
  `audio` aceita base64, mas a bancada e a sonda mandam **WAV 16 kHz** (`stt.mjs`, `sondar-contratos.mjs`), e os testes
  do B6 usam respostas simuladas. Nenhuma medição mostra o Workers AI decodificando Ogg Opus.
- **"Com raciocínio" por lista de nomes.** Um modelo que pensa e não está na lista teria o `max_tokens` cortado a 75%
  e poderia responder vazio. O PR #57 (aberto) faz o provedor confirmar via `completion_tokens_details.reasoning_tokens`
  e amplia a lista.
- **O "restam X" do alívio usa o preço do STT legado.** `custoPorSegundoDeFala` (`server/lib/nuvemDeAlivio.ts`) chama
  `custoDeStt(modeloDoSttGerenciado(), …)` sem fornecedor, ou seja, o `STT_MODEL` e não a perna que a cascata chama. O
  gasto registrado depois já é o da perna real; só a estimativa exibida erra. O PR #52 (aberto) corrige.
- **Novas pernas sem preço declarado vão para o fim.** A tabela oficial não tem o STT da DeepInfra nem o da Cloudflare,
  nem o LLM da Cerebras e da Cloudflare. Sem `preco` no registro, essas pernas custam o conservador (STT US$ 0,111/h
  com 10 s), e a cascata do B6 e o degrau barato do B4 as poriam atrás da Groq. No B7, o preço tem de ir junto no
  registro.
- **Cloudflare + gpt-oss:** o `reasoning_effort` que a produção manda não está documentado no endpoint
  OpenAI-compatible do Workers AI (`bancada-nuvem.md`, "Limites conhecidos"). A sonda diz se ele é aceito.
- **Estado por processo.** Baldes, disjuntores e memória do registro são do processo, como a admissão do ADR 0007.
- **O `process.exit(1)` do boot com registro inválido não tem teste de processo.** `erroDoRegistroDeIa` tem.

## Perguntas ao dono

1. **Quais vencedores entram no B7?** A regra da bancada diz o que pode trocar, mas a escolha é do dono: o modelo da
   rápida (a legenda ao vivo) e a ordem das pernas de STT. O modelo da nuance e o do polimento são a pergunta 1 de
   `traducao-nuance/design.md` (D0) e saem da mesma execução.
2. **Onde mora o `IA_PROVEDORES` em produção?** No `fly.toml [env]` (versionado e revisável; o JSON não tem segredo)
   ou em `fly secrets`? O `.env.production.example` diz "uma linha no secret".
3. **A Cloudflare entra como perna de STT antes de provar o Ogg Opus com áudio real?** Ou fica só no LLM até uma
   sonda com Ogg?
4. **Depois do B7, o teto mensal do Premium sobe de 40 h para 60 h** (`PREMIUM_MONTHLY_STT_SECONDS`, `planos-v2`)?
5. **Quem confere a retenção zero no painel de cada provedor novo** (DeepInfra no STT/MT, Cerebras, Workers AI) e
   atualiza `docs/lgpd/operadores.md` e a política de privacidade antes da troca? Hoje a DeepInfra aparece lá só para a
   voz, a Cloudflare só para DNS, WAF e R2, e a Cerebras não aparece.
6. **O PR #57 e o PR #52 entram antes do B7?** Os dois mudam a conta que o B7 usa: o corte de saída e o "restam X".
