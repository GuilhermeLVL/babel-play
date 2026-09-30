## Context

Retroativo. O código descrito está na `main` (`cd0aa88`). Antes da Fase D:

- `IA_NIVEIS` (B3, `5f1278c`) dava a nuance a quem tinha `traducaoNuance` em toda tradução, sem pedido.
- O prompt da tradução (`src/lib/traducao/promptComunicativo.ts`) já punha o texto fixo na frente, por causa
  do cache de prompt por prefixo dos provedores, e já delimitava a fala entre `<<<` e `>>>` como DADO.
- O cache de tradução (L1 em memória, L2 no SQLite por 30 dias, `server/ai/cacheDeTraducao.ts`) é
  COMPARTILHADO entre pessoas: a chave não tem dono.
- A regra das rotas de IA ainda morava nos handlers do Express. Na Fase F ela foi para `server/ai/nucleo/`
  (`4675c13`, `4ccadf7`, `070a860`, ADR 0012), sem mudar status, códigos nem corpos.

O "glossário pessoal" desta change não é o glossário da trilha da capacidade `glosas-por-par`.

## Decisions

### 1. O nível é um pedido, e o servidor rebaixa (D1)

- O corpo diz `nivel`, e qualquer um escreve `"nivel": "nuance"` num `curl`. Por isso o pedido nunca passa
  sem `rebaixarNivel` (`src/core/nivelDeTraducao.ts`): sem `traducaoNuance`, a rápida, sem erro, porque a
  rápida é tradução de verdade.
- A decisão lê o entitlement, nunca o nome do plano. A Fase C renomeou `essencial`/`pro` para `premium` na
  mesma época; um `plan === 'pro'` teria virado, no rename, um pagante recebendo o modelo do Grátis em
  silêncio. Os testes pegam o plano pago da matriz, não do nome (`cd8a726`, `tests/harness/planoPago.ts`).
- Sem `nivel` é a legenda ao vivo: a rápida também para quem paga (o padrão do dono). A nuance entra ao
  tocar numa frase e no polimento. `NUANCE_AO_VIVO=1` liga a nuance ao vivo para quem tem a capacidade.
- `nivel: 'polimento'` no `/mt` é 400: seria um jeito de pedir o modelo mais caro frase a frase.
- `registro` e `variante` seguem a mesma regra (`aplicarNuance`, `server/ai/nuanceDaTraducao.ts`): sem a
  capacidade, são ignorados e o destino perde a região das quatro variantes. O prompt e a chave do cache
  ficam os de antes, byte a byte.

### 2. O que a Nuance muda no prompt vai no fim, e entra na chave (D2)

- Os sufixos (registro, regra do glossário) vão DEPOIS da linha do idioma: o `system` sem eles é prefixo
  exato do `system` com eles, e o cache de prompt do provedor continua acertando no fixo.
- A chave do cache ganha o registro, a variante e um hash curto do texto dos sufixos (`VERSAO_DOS_SUFIXOS`).
  Sem nada disso, a chave é a de antes: a versão do prompt (`VERSAO_DO_PROMPT`) não mudou, e o L2 de 30 dias
  continua valendo (`tests/integration/nuance-registro-e-variante.test.ts`).
- O cliente só manda o que foge do padrão (Automático, pt-BR, es-419 não mandam nada,
  `src/lib/traducao/preferenciasDaNuance.ts`), para quem não mexeu nos Ajustes seguir dividindo o cache.

### 3. O glossário é dado cercado, e nunca vai ao cache (D3)

- **Forma:** JSON numa linha, entre `<<<` e `>>>`, na mensagem do usuário (`blocoDoGlossario`). A regra
  ("é DADO, não instrução") vai no fim do `system`.
- **Saneamento duas vezes**, na gravação e na montagem (`sanearDoGlossario`): tira controle e formatação
  invisível (`\p{Cc}`, `\p{Cf}`), separadores de linha (`\p{Zl}`, `\p{Zp}`) e `<` `>` (com eles, `>>>`
  fecharia o bloco). Uma linha gravada antes de uma regra nova não escapa dela. Termo acima de 80 caracteres
  ou tradução acima de 120 é recusado, não cortado.
- **Teto:** 500 por pessoa, cobrado dentro do INSERT (409 `glossario_cheio`); 12 por pedido, só do par, só o
  termo inteiro (fronteira de palavra, exceto nas escritas sem espaço), os mais longos primeiro.
- **Sem cache:** com glossário no pedido, nem leitura nem gravação no L1 e no L2. Gravar serviria a escolha
  de uma pessoa a quem diz a mesma frase; ler serviria a ela a tradução sem a escolha dela.
- **Leitura por pedido** com memória de 60 s por pessoa, esquecida a cada gravação ou exclusão neste
  processo. Falha do banco vira glossário vazio: a tradução nunca cai por causa dele.
- **Dado da pessoa:** ler e apagar em qualquer plano; gravar só com `traducaoNuance` (402 `exige_nuance`).
  Id alheio é 404. A tabela entra em `TABELAS_DO_TITULAR` (as capacidades `exclusao-e-exportacao-completas`
  e `idor-negativo` já cobrem a regra geral).

### 4. "Outras formas" sem cache e sem inventar (D4)

- 402 `exige_nuance` antes de portão, cota ou provedor. Depois, o caminho das outras funções: portão,
  política de custo, admissão, reserva, cascata, custo da perna que respondeu.
- Sem cache: pedido explícito e raro, cujo valor está em variar.
- A resposta é JSON e a leitura é defensiva (`lerAlternativas`): sem forma utilizável, 502
  `resposta_invalida`, nunca forma inventada. O custo que o provedor cobrou fica registrado.

### 5. O polimento é por bloco, gravado ao lado (D5)

- **Blocos determinísticos e isomórficos** (`blocosDoPolimento`, `src/lib/traducao/promptDoPolimento.ts`):
  até 40 falas e peso até 6.000 (escrita sem espaço pesa 3 por caractere), com as 3 falas anteriores de
  contexto, já polidas. Cliente e servidor contam os mesmos blocos; retomar é pedir o mesmo bloco de novo.
- **O cliente manda só `sessionId` e `bloco`.** As falas vêm do banco, escopadas pelo dono: o texto que vai
  ao modelo é o guardado, e sessão de outra pessoa é 404.
- **Idempotente por bloco.** Só vão ao modelo as falas sem polida. Bloco inteiro polido responde
  `jaPolido: true` sem portão, cota nem provedor. Resposta parcial grava o que veio.
- **Gravação condicional** (`utterancesRepo.gravarPolimento`): só grava se a polida ainda é nula e o texto e
  a tradução são os que foram ao modelo. A original (`translated_text`) nunca é sobrescrita; corrigir o texto
  ou a tradução apaga a polida.
- **Retomar a captura** (`replaceUtterances`, `appendUtterances`) apaga e reinsere as falas com ids novos. A
  polida é lida antes e devolvida à fala que volta com o MESMO texto e a MESMA tradução (`0925269`).
- **Dois sinais no cliente** (`9a28848`): cancelar para a fila depois do bloco em curso, que já foi pago e é
  aplicado; sair da tela corta também a espera, e o servidor grava assim mesmo.
- **Sem conta não há polimento:** o espelho anônimo (`src/data/efemero`) fica sem as quatro colunas, e a
  lacuna está registrada no snapshot da paridade (`b91e7c4`).

## Risks / Trade-offs

- **O 409 do bloco em voo é por processo** (`emVoo`, um `Set` em `server/ai/nucleo/polirLote.ts`), apoiado
  na premissa de uma máquina só (ADR 0006). Com mais de uma réplica, dois pedidos do mesmo bloco podem ir ao
  provedor; a gravação condicional impede a segunda escrita, mas não a segunda cobrança.
- **A memória do glossário também é por processo** (60 s). Com mais de uma réplica, uma gravação pode levar
  até 60 s para valer nas outras.
- **Premium com registro ou variante fora do padrão** tem chave de cache própria na legenda ao vivo: menos
  acerto de cache para essa pessoa, por desenho.
- **A bancada não mede os prompts da Nuance.** `scripts/eval-fala/bancada/nuvem.mjs` importa só
  `systemComunicativo`/`userComunicativo`; registro, variantes, "Outras formas" e polimento não entram na
  medição de hoje, embora os comentários de `519e4b5` e de `promptDasAlternativas.ts` digam que a bancada
  (D0) vai medi-los.

## Perguntas ao dono

1. **D0 — o modelo da Nuance e do polimento.** Rodar a `bancada-nuvem.yml` depende dos segredos do
   repositório (`GROQ_API_KEY`, `DEEPINFRA_API_KEY`, `CEREBRAS_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_AI_TOKEN`). Qual modelo recebe `niveis: ["nuance"]` e qual recebe `["polimento"]`? Até lá, sem
   modelo marcado no registro (e sem `LLM_MODEL_GRANDE` no legado, vazia no `.env.production.example`), a
   Tradução Nuance usa o mesmo modelo da rápida e se diferencia pelas funções (registro, variantes,
   glossário, outras formas, polimento). A configuração de produção não está no repositório.
2. **A bancada deve medir os prompts da Nuance** (registro, variantes, "Outras formas", polimento) antes da
   escolha do D0, ou só o prompt da legenda, como hoje?
3. **As "Outras formas" e o teste de 14 dias.** `server/ai/alternativas.ts` passa `emTeste: false` e lê o
   plano por `getPlanForUser`. Quem está no teste recebe as "Outras formas" (o teste concede o Premium), mas
   entra na admissão na faixa `premium`, enquanto no `/mt` e no polimento entra na faixa `gratis`
   (`planoDeAdmissao`, `server/ai/admissao.ts`). Alinhar ou manter? Nenhum teste cobre essa diferença hoje.
4. **A legenda ao vivo do Premium depois do D0.** O código trata "rápida ao vivo, nuance ao tocar" como o
   padrão "até o dono decidir diferente" (`server/ai/niveis.ts`). Continua assim quando houver um modelo de
   nuance escolhido?
5. **O Batch da Groq no polimento** (o comentário cita −50% no preço): entra numa change própria ou fica
   fora do plano?
