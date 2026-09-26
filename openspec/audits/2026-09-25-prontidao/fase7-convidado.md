# Fase 7 — Modo convidado

Data: 2026-09-25. Branch: `feat/modo-convidado`, a partir de `auditoria/prontidao-producao`.

Decisão do dono: dá para usar o app sem login. A pessoa conhece e testa no modo gratuito, e só
depois oferecemos conta e planos. Esta fase entrega o convidado. A oferta visual (banner, modal,
comparação, aviso de cota, frequência) fica com a Fase 8. Aqui só se dispara o evento
`babel:oferta`, que a Fase 8 consome.

## 1. Desenho

### 1.1 Três estados, e o que muda entre eles

| Estado | Identidade no cliente | Dados | Servidor | Quando acontece |
|---|---|---|---|---|
| Sem conta (hoje) | `anonimo` | IndexedDB (`src/data/efemero`) | não sabe que a pessoa existe | padrão |
| Convidado com nuvem | `anonimo` (sessão anônima do Supabase não é conta) | IndexedDB | usuário anônimo, plano `convidado` | flags `modo_convidado` e `nuvem_convidado` ligadas e primeiro uso de IA de nuvem |
| Conta | `conta` | servidor | plano da assinatura (ou `free`) | login, cadastro ou conversão |

O app continua 100% local por padrão. A identidade no servidor (usuário anônimo do Supabase,
`signInAnonymously`) só nasce quando as duas flags estão ligadas e a pessoa tenta usar a IA de nuvem
(`/api/ai/stt/available`, `/api/ai/stt`, `/api/ai/mt`, `/api/tutor/chat`). Não nasce no primeiro
acesso. A sonda de disponibilidade do STT conta como uso, porque ela só roda quando a captura abre.

### 1.2 Cliente

- `src/lib/convidado.ts`. Decide se a rota é de nuvem e se as duas flags estão ligadas. Cria a
  sessão anônima uma vez, com chamadas simultâneas dividindo a mesma criação, e com o Turnstile
  quando há chave. Também lê a resposta para disparar `convidado_para_conta` pelo canal da Fase 8.
- `src/data/funil.ts`. Com identidade `anonimo`, só as rotas de nuvem saem para a rede, e só com a
  sessão anônima. O resto continua no servidor em memória.
- `src/lib/estado/useSessaoSupabase.ts`. A sessão anônima não é conta: a identidade continua
  `anonimo` e `session` fica `null`. A conversão chega como `USER_UPDATED` com
  `is_anonymous: false`, a identidade vira `conta` e o `ModalDeMigracao` sobe os dados locais.
- `src/lib/auth.ts`. Com sessão anônima, o cadastro por e-mail usa `updateUser({ email })`, e o
  login social usa `linkIdentity`. Nos dois casos o `sub` é o mesmo. Se o Google já for de outra
  conta, cai no login normal.
- `src/lib/turnstile.ts`. O script oficial do Cloudflare só é carregado quando
  `VITE_TURNSTILE_SITE_KEY` existe. O widget é o gerenciado, com `interaction-only`.
- `src/lib/flagsCache.ts`. A leitura síncrona das flags saiu de `lib/flags.ts` para uma folha. Sem
  isso, `funil → convidado → flags → funil` seria um ciclo, e `morto:ciclos` barra ciclos.
- UI: `MenuDaConta.tsx`. Com `modo_convidado` ligado, o botão da conta ganha um anel tracejado e o
  rótulo "Você está usando como convidado". O menu diz o que fica no aparelho (5 gravações e 80
  palavras, de `TETO_ANONIMO`) e o que pede conta: loja, ranking, importação e sincronização. As
  telas de `exigeConta` continuam com o `CartaoDeConvite`. Com a flag desligada, nada muda.

### 1.3 Servidor

- `server/lib/contextoDeConvidado.ts`. O `authMiddleware` lê `is_anonymous` do token já verificado
  (`req.convidado`) e abre um contexto assíncrono (`AsyncLocalStorage`) para o resto do request. O
  `getPlanForUser(userId)` consulta esse contexto e devolve `convidado`. Se o contexto se perder, o
  resultado é `free`, que não tem nuvem. Nunca cai num plano pago.
- `src/core/planos.ts`. `PLANO_CONVIDADO` fica fora de `PLAN_MATRIX`: não é plano de assinatura, e
  não entra no admin, no webhook nem na venda. `PlanoEfetivo = PlanoDeAssinatura | 'convidado'`.
  `definicaoDoPlano()` é usada pelas cotas (`usageQuota.ts`, `storageQuota.ts`).
- `server/lib/convidado.ts`. Contém `abrirPortaGratuita()`, chamada no STT, na tradução e no tutor
  antes do entitlement, e o middleware `exigirContaParaEscrever`.
- `server/lib/limpezaDeConvidados.ts`. É o job diário de expiração (ver §4).
- Migração `0033_convidados.sql` (a `0032` fica reservada para `versoes_de_dados`, de outra frente; ver §8). Cria a tabela `convidados` (`user_id`, `ip_hash`, `criado_em`,
  `visto_em`), que está em `TABELAS_DO_TITULAR`. Tem comentário `REVERSAO:`.

## 2. Limites

A cota do convidado segue a proposta da Fase 3 (`fase3-custo.md` §4 e `P.proposta.convidado` em
`scripts/custo/modelo.mjs`). O modelo de custo já tinha esses números, então `modelo.mjs` não
mudou.

| Limite | Valor | Onde |
|---|---|---|
| STT de nuvem | 600 s/mês (10 min) | `PLANO_CONVIDADO.quotas.sttSegundosMes` |
| Tokens de LLM (tradução + tutor) | 40.000/mês | `PLANO_CONVIDADO.quotas.tokensMes` |
| Chamadas gerenciadas | 220/mês | `PLANO_CONVIDADO.quotas.chamadasMes` |
| Mensagens de tutor | 5/mês | `LIMITES_DO_CONVIDADO.tutorMensagensMes` |
| Gasto estimado por convidado | US$ 0,02/mês | `LIMITES_DO_CONVIDADO.tetoUsdMes` |
| Armazenamento no servidor | 0 (tudo no aparelho) | `PLANO_CONVIDADO.quotas.armazenamentoMb` |
| Convidados novos por IP/dia | 3 | `CONVIDADOS_POR_IP_DIA` |
| Gasto por IP/dia (todos os convidados do IP) | US$ 0,04 | `CONVIDADO_IP_USD_DIA` |
| Mensagens de tutor por IP/dia | 10 | `CONVIDADO_IP_TUTOR_DIA` |
| Pool global diário (convidado + free) | `max(US$ 0,50; 5% da receita líquida ÷ 30)` | `POOL_GRATUITO_PISO_USD_DIA`, `POOL_GRATUITO_FRACAO_RECEITA` |
| Reserva dos pagantes | a nuvem gratuita fecha com o orçamento do mês em 80% | `RESERVA_DOS_PAGANTES` |

A conta de custo do convidado no teto é esta. STT: 600 s × 1,08 × US$ 0,04/h = US$ 0,0072.
Tradução: 40k tokens, típico 80% entrada, dá US$ 0,0096. O típico no teto fica em US$ 0,017, abaixo
de US$ 0,02. O pior caso (tudo saída) passaria de US$ 0,02, e é por isso que o teto em dólar é
conferido à parte: ele fecha a nuvem antes. A receita do pool vem das assinaturas `active`, calculada
por preço − R$ 1,09 − 6% e dividida por R$ 5,60/US$, com cache de 10 minutos.

### Ordem das travas (`abrirPortaGratuita`)

1. Flag `nuvem_convidado`. Desligada, a resposta é 403 `exige_conta`, e `stt/available` responde 501.
2. Registro e limite de criação por IP/dia. O convidado é registrado com o IP pseudonimizado do
   dia. Só os N primeiros ids distintos daquele IP no dia passam. Os outros recebem 429
   `limite_de_convidados` com `Retry-After` até a virada do dia. A decisão é estável: os três
   primeiros continuam aceitos e o quarto continua recusado.
3. Pool global do dia e reserva dos pagantes. Esgotado, a resposta é 503 `pool_gratuito_esgotado`,
   e o cliente cai no motor local.
4. Tetos do convidado:
   - US$ por id no mês e US$ por IP no dia, conferidos antes e somados depois, como o orçamento
     global;
   - mensagens de tutor, reservadas atomicamente por id e por IP e devolvidas se nada foi entregue;
   - segundos, tokens e chamadas, pelas cotas normais de `usageQuota.ts`.

   Estourado, a resposta é 402 `quota_exceeded` com `detalhes.escopo` igual a `convidado` ou `ip`.

Toda falha de contador responde 503 `contador_indisponivel`: a trava falha fechada. O `free` logado
só passa pela trava 3, porque hoje não tem nuvem (o entitlement recusa). O pool já o inclui para
quando tiver.

### Escrita exige conta

`exigirContaParaEscrever` é montado logo depois do `authMiddleware` e usa lista de permissão. O
convidado só escreve nas rotas de nuvem (`POST /api/ai/stt`, `/api/ai/mt`, `/api/tutor/chat`,
`/api/gemini/chat`) e em `DELETE /api/me`, porque o direito do titular nunca trava. Qualquer outro
método que não seja leitura responde 403 `exige_conta`: sessão, upload de áudio, import, loja no
servidor, cobrança, ajustes. Rota nova já nasce fechada para o convidado. O ranking fica antes do
auth e já exige adulto declarado. `GET /api/me/entitlements` não provisiona linha em `users` para o
convidado.

## 3. Antiabuso

| Vetor | Defesa |
|---|---|
| Criar anônimos em laço (script) | Turnstile no `signInAnonymously` (quando configurado) e o limite de 30/h por IP do próprio Supabase. Do nosso lado, só N ids novos por IP/dia chegam à nuvem |
| Limpar cookies para ganhar cota nova | O teto por IP/dia (US$ e tutor) soma todos os convidados do IP |
| Trocar de IPv6 dentro da mesma rede | `ipKeyGenerator` agrupa por prefixo (o mesmo do rate-limit) |
| Muitos IPs (botnet) | Pool global diário em US$ e reserva de 20% do orçamento do mês para pagantes. O dano máximo por dia é o pool |
| Rajada simultânea no limiar | As mensagens de tutor e as cotas de segundos e tokens reservam de forma atômica. O gasto em US$ é conferido antes e somado depois (pode passar alguns centavos), com o pool e o orçamento global por fora |
| Forjar `is_anonymous: false` | A claim vem do JWT assinado pelo Supabase. Mudar a claim invalida a assinatura |
| Convidado escrevendo no servidor | `exige_conta` com lista de permissão |

O IP é pseudonimizado: `HMAC-SHA256(chave do servidor, "…:dia:ip")`, truncado. Não dá para voltar
ao IP, e o mesmo IP em dias diferentes não se liga.

## 4. Expiração e limpeza

`agendarLimpezaDeConvidados` roda no processo primário, uma vez por dia (a primeira 7 min depois do
boot), e só no modo público. Pega em lotes de 100 (no máximo 20 lotes por passada) os convidados sem
nuvem há 30 dias:

- **Com a Admin API do Supabase** (`SUPABASE_SERVICE_ROLE_KEY`), `GET /auth/v1/admin/users/:id`
  com timeout de 5 s decide o caso:
  - ainda anônimo: apaga no Supabase (`DELETE`), apaga os contadores e o registro;
  - virou conta: apaga só o registro, e os contadores ficam, porque são da conta;
  - 404: apaga os contadores e o registro;
  - falha na Admin API: fica para o dia seguinte. Um lote sem progresso encerra a passada.
- **Sem a Admin API**, apaga o registro e só os contadores de meses anteriores, porque o mês
  corrente pode já ser de uma conta convertida. O usuário anônimo fica no Supabase (pendência do
  dono, abaixo).
- Poda os contadores diários (por IP e o pool) de mais de 2 dias.

Os testes (`tests/integration/limpeza-de-convidados.test.ts`) usam relógio e Admin API falsos.

## 5. Conversão sem duplicar

- `updateUser({ email })` e `linkIdentity` mantêm o `sub`. O próximo token vem sem `is_anonymous`, e
  o mesmo id passa a resolver pelo caminho normal (assinatura, senão `free`). O `gasto_micro_usd`, o
  `managed_calls` e os demais contadores seguem com a pessoa. Isso está testado em
  `modo-convidado.test.ts`, no bloco "conversão".
- Os dados locais sobem pelo `ModalDeMigracao` (`src/data/migracao.ts`), disparado na transição
  `anonimo → conta`. Nada é duplicado, por dois motivos. O convidado nunca gravou sessão no servidor
  (403 `exige_conta`), então não há o que colidir. E cada sessão sobe com `origemLocalId`, e o
  servidor é idempotente por ele, então repetir a migração é seguro.
- O Supabase só aceita senha depois de confirmar o e-mail. Por isso o cadastro por e-mail a partir
  do convidado envia só o e-mail, e a tela avisa que a senha é definida depois (Ajustes → Conta ou
  "esqueci a senha"). Não guardamos a senha digitada no aparelho.
- Se a pessoa entrar numa conta que já existe, o anônimo fica órfão. A limpeza de 30 dias o leva, e
  os dados locais sobem pela migração.

## 6. LGPD

- **Menores (art. 14).** O convidado não passa pela aferição de idade. Por isso a nuvem para o
  convidado nasce desligada (`nuvem_convidado`), e ele fica no perfil protegido: o tutor recebe a
  instrução de segurança de menores (`ehMenor` é verdadeiro para quem não declarou idade), não
  publica no ranking e não compra.
- **Minimização.** O servidor guarda só o id anônimo, o IP pseudonimizado do dia, a data de
  criação, o último uso e os contadores. Nenhum conteúdo. A tabela `convidados` está em
  `TABELAS_DO_TITULAR` (exportação e exclusão).
- **Retenção.** 30 dias depois do último uso, tudo é apagado (§4).
- **Transparência.** `public/privacidade.html` ganhou a seção "Modo convidado". Ela descreve o
  identificador anônimo, o IP pseudonimizado diário, o perfil protegido, a retenção de 30 dias e a
  conversão com o mesmo identificador.

## 7. Custo e escala

Os números são os da Fase 3 (T2 e T6), sem mudança no modelo. Com 1 convidado por cadastrado e a
proposta ligada, a IA de convidado + free custa R$ 167/mês com 1.000 cadastrados, e a demanda média
fica em US$ 1,03/dia contra um pool de US$ 2,17/dia. O pool diário é o teto duro do dia: no pior
caso de abuso distribuído, o gasto gratuito do mês fica em 30 × pool, e a reserva de 80% do
orçamento global protege os pagantes antes disso. Enquanto a Groq estiver na camada grátis, a cota
do convidado é zero de fato, porque `nuvem_convidado` está desligada (T4 da Fase 3: a capacidade de
hoje não atende nem os pagantes).

A escala no servidor é de uma escrita por chamada de nuvem do convidado (o upsert em `convidados`)
e de algumas leituras de contador. O limite de criação faz uma consulta indexada
(`idx_convidados_ip_criado`). A limpeza é em lotes, com teto.

## 8. Pendências do dono

1. **Supabase → Authentication → Providers:**
   - ligar **Anonymous sign-ins**;
   - ligar **Manual linking**, sem o qual `linkIdentity` não funciona;
   - conferir o template de e-mail de **Change email address**, que é o que o convidado recebe ao
     criar conta.
2. **Supabase → Authentication → Rate limits:** conferir o limite de anônimos por IP. O padrão é
   30/h.
3. **Cloudflare Turnstile:**
   - criar o site (widget gerenciado);
   - pôr a chave **secreta** no Supabase (Authentication → Attack Protection → Captcha, provedor
     Turnstile);
   - pôr a chave **pública** em `VITE_TURNSTILE_SITE_KEY` (GitHub Environment → Variables). O
     Dockerfile e o `implantar-ambiente.yml` já a repassam.

   Sem a chave, o captcha fica desligado. Com o captcha ligado no Supabase e sem a chave no build,
   o `signInAnonymously` falha e o convidado segue local.
4. **`SUPABASE_SERVICE_ROLE_KEY`** no servidor, para a limpeza apagar os anônimos. Sem ela, rodar
   periodicamente no SQL Editor do Supabase:
   `delete from auth.users where is_anonymous is true and created_at < now() - interval '30 days';`
5. **Flags**, nesta ordem: ligar `modo_convidado` (só UI e ofertas). Depois do upgrade da Groq e da
   decisão sobre menores, ligar `nuvem_convidado`. A regra semeada (`{"planos":["convidado"]}`) já
   restringe a flag ao convidado.
6. **Integração da migração:** a `0033_convidados` foi numerada depois da `0032_versoes_de_dados`,
   que está sendo feita em outra frente e ainda não chegou a esta branch. No merge, conferir o
   `_journal.json` (entradas 32 e 33 em ordem de `when`) e regenerar o snapshot com
   `npx tsx scripts/migracoes/snapshot-do-schema.ts`, porque o `0033_snapshot.json` desta branch
   aponta para o `0031`.
7. **Fase 8 (já integrada nesta branch):** o `HostDeOfertas` consome `babel:oferta`. O funil
   dispara `convidado_para_conta` (teto local, 403 `exige_conta`, 429 `limite_de_convidados`) pelo
   `dispararOferta` de `lib/ofertas/eventos.ts`, com `motivo` e `rota` no `contexto`. O 402
   `quota_exceeded` do convidado vira `fim_de_cota` pelos próprios adaptadores de nuvem
   (`sinalizarRecusa*`), e por isso o funil não o repete. Falta ao dono ligar `oferta_planos` com o
   gatilho `criar_conta` (já semeado para `planos: ["convidado"]`).

## 9. Testes

- `tests/caracterizacao/modo-convidado.test.ts` (HTTP, montagem de produção) cobre:
  - JWT anônimo → `convidado`, e a conversão → `free` com o mesmo id e os contadores preservados;
  - com a flag desligada, 403 `exige_conta` na tradução, no STT e no tutor, e 501 em
    `stt/available`;
  - com a flag ligada, a porta passa;
  - escritas → 403 `exige_conta`, `DELETE /api/me` livre e conta real sem efeito;
  - limite de criação por IP (estável);
  - teto por IP que sobrevive a um id novo;
  - teto em US$ do convidado;
  - pool do dia e reserva dos pagantes;
  - tutor: cota de 5 e devolução quando nada foi entregue.
- `tests/integration/limpeza-de-convidados.test.ts` cobre:
  - limpeza com Admin API (anônimo, convertido, fora do ar) e sem ela;
  - poda dos contadores diários;
  - CSP do Turnstile.
- `tests/modo-convidado-cliente.test.ts` cobre:
  - `signInAnonymously` só com as duas flags e só em rota de nuvem, uma vez para chamadas
    simultâneas, sem `captchaToken` quando não há chave;
  - `babel:oferta` (`convidado_para_conta`) em 429, 403 e no teto local (507), sem duplicar o 402
    que o adaptador já sinaliza, e nenhum evento com o modo desligado;
  - `updateUser` e `linkIdentity` na conversão.
- `tests/sessao-anonima-nao-e-conta.test.ts` cobre: sessão anônima → `anonimo`, e `USER_UPDATED`
  não anônimo → `conta`.
