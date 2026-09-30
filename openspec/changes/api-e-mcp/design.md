## Context

Depois da Fase F (branch `feat/f-nucleo-sem-express`, 30/09/2026):

- **O núcleo existe e não conhece o Express** (`server/ai/nucleo/`, ADR 0012). Cada função recebe um
  `ContextoDeIa` e o pedido validado, e devolve o resultado ou a `RecusaDeIa`:

  | Função (arquivo)                                        | Pedido (de `lerPedido…`)                                                    | Sucesso                                                    |
  | ------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
  | `traduzirNoNivel` (`traduzirNoNivel.ts`)                | `text, src?, tgt, falada?, contexto?, nivel?, registro?, variante?`         | `{ texto, modelo, doCache }`                               |
  | `sugerirAlternativas` (`sugerirAlternativas.ts`)        | `text, src?, tgt, traducaoAtual?, contexto?, registro?, variante?`          | `{ opcoes, nota, modelo }`                                 |
  | `polirLote` (`polirLote.ts`)                            | `sessionId, bloco, registro?, variantes?`                                   | `{ bloco, blocos, polidas, pendentes, jaPolido, modelo? }` |
  | `sintetizarVoz` (`sintetizarVoz.ts`)                    | `texto, idioma, voz?, velocidade?`                                          | `{ bytes, tipo, modelo, doCache }`                         |
  | `admitirTranscricao` + `transcrever` (`transcrever.ts`) | porta: o contexto; depois `audio, credencialId?, modelo?, idioma?, prompt?` | `{ texto, idioma }`                                        |

- **O contexto** (`nucleo/contexto.ts`): `userId`, `requestId`, `rastro`, `entitlements` já resolvidos,
  `emTeste`, `modo` (`plano | alivio`), `canal` (`app | api | mcp`), `perfilProtegido`, `registrarCusto?`,
  `flagLigada?`. Fora do app, `recusaDeQuemPede` só deixa passar `perfilProtegido === false`.
- **A cota é do dono** (`server/lib/usageQuota.ts`): reserva chamada, tokens, segundos e caracteres no mês e
  no dia local, em `usage_counters` (`unique(user_id, metric, window)`), e falha FECHADA
  (`ContadorIndisponivel` → 503).
- **O limite de taxa** é por tenant e no banco (`server/lib/rateLimitStore.ts`, `createDbRateLimitStore`
  com uma métrica por limitador: `ratelimit:caro`, `ratelimit:escrita`…).
- **A retenção zero** é do registro (`server/ai/registroDeProvedores.ts`): em produção todo provedor
  declara `retencao: 'zdr'` e o boot aborta sem isso; o Gemini é recusado em qualquer forma (`ehGemini`).
- **A identidade** do app é o JWT do Supabase (`authMiddleware` → `req.userId`); a idade é
  `ehAdultoDeclarado(userId)` (`server/lib/idade.ts`).

## Goals / Non-Goals

**Goals:** uma API `/v1` e um servidor MCP que chamem o núcleo sem copiar regra; chave que nunca fica
guardada em claro e que se revoga na hora; medição e limite POR CHAVE, além da cota do plano; só adultos;
retenção zero e nunca Gemini, como no app.

**Non-Goals:** implementar agora (esta change é proposta + desenho); preço e plano da API; o tutor na API;
BYOK na API (quem usa a API usa a chave do dono do serviço, pela cota do plano).

## Decisions

### 1. O adaptador `/v1` monta o mesmo contexto que o app

```
Authorization: Bearer bp_<prefixo>_<segredo>
  → chave válida, não revogada, com o escopo da função
  → dono = chave.userId; resolverPlano(dono) → entitlements, emTeste
  → perfilProtegido = !(await ehAdultoDeclarado(dono)).adulto
  → ctx = { userId: dono, canal: 'api', modo: 'plano', registrarCusto: medidor(keyId), flagLigada: flagPara(dono), … }
  → lerPedido…(corpo) → núcleo → RecusaDeIa vira status + corpo + Retry-After, como no app
```

Sem porta gratuita: a API não tem convidado nem nuvem de alívio (`modo` é sempre `plano`). As flags hoje
são avaliadas a partir do request (`contextoDoRequest(req)`); a implementação acrescenta a avaliação por
`userId` (sem cabeçalho de instalação/versão) — é o único gancho que falta no núcleo, e ele já recebe a
flag por função (`flagLigada`). O `route` dos logs, hoje o da rota do app, passa a vir do contexto.

Rotas (substantivos, uma por função): `POST /v1/traducoes`, `POST /v1/traducoes/alternativas`,
`POST /v1/voz`, `POST /v1/transcricoes` (corpo = o áudio, como no app; o `admitirTranscricao` roda antes
de ler o corpo). `POST /v1/sessoes/:id/polimento` fica para uma segunda leva: ele opera sobre sessões
guardadas pela conta, e a API ainda não tem como criá-las.

O `/v1` monta ANTES do `authMiddleware` do Supabase, com o seu próprio middleware de chave, sem CORS
(é servidor-a-servidor) e com `Cache-Control: no-store`. O contrato (`tests/contratos/api-contrato.json`)
passa a incluir o `/v1`: rota removida só com depreciação.

### 2. Chaves de API: hash, escopos, revogação

Tabela nova `chaves_de_api` (migração própria): `id` (`key_…`), `user_id`, `nome`, `prefixo` (os 8
primeiros caracteres visíveis, para a tela e para a busca), `hash`, `escopos` (JSON), `criada_em`,
`ultimo_uso_em`, `revogada_em`, `expira_em` (opcional).

- **O segredo aparece UMA vez**, na criação. Guarda-se `HMAC-SHA-256(CHAVE_DE_HASH, segredo)` — a chave
  do servidor que já pseudonimiza o IP do convidado. HMAC e não bcrypt: o segredo é aleatório de 256 bits
  (não há dicionário a atacar) e a conferência roda em todo pedido; comparação em tempo constante, busca
  pelo `prefixo`.
- **Escopos, um por função do núcleo:** `traducao`, `alternativas`, `voz`, `transcricao` (e `polimento`
  quando existir). Chave sem o escopo: 403 `escopo_insuficiente`, antes do núcleo.
- **Revogação imediata:** `revogada_em` é conferida em todo pedido (uma leitura por chave, SQLite local —
  ADR 0006); cache em memória só se a medição pedir, e com TTL curto.
- **Quem cria:** conta com e-mail (nunca o convidado anônimo), **adulto declarado**, com o entitlement da
  API no plano (a decidir, abaixo). Teto de chaves ativas por conta (5). Apagar a conta apaga as chaves
  (LGPD, `DELETE /api/me`).

### 3. Medição: `usage_counters` `api:<keyId>` e `rateLimitStore`

- **A cota que vale é a do plano do dono**: a API reserva e estorna pelas mesmas funções do app
  (`reservarLlm`, segundos, caracteres), no mesmo `userId`. Quem paga um plano não ganha uma segunda
  franquia por ter uma chave.
- **Por chave, ao lado:** o `registrarCusto` do contexto soma o custo entregue em
  `usage_counters(user_id = 'api:<keyId>', metric = 'gasto_micro_usd', window = mês | dia)`, e o adaptador
  conta chamadas no mesmo `user_id`. É o que a tela de chaves mostra e o que um teto POR CHAVE (menor que
  o do plano) confere — uma chave vazada gasta no máximo o teto dela.
- **Limite de taxa por chave:** `createDbRateLimitStore('ratelimit:api')`, chaveado por `keyId` (nem IP,
  nem usuário): um script em laço numa chave não derruba o app da mesma pessoa, que continua no
  `ratelimit:caro`. A admissão por provedor (ADR 0007) vale igual — é do núcleo.

### 4. Servidor MCP remoto com OAuth 2.1 + PKCE

- **Transporte HTTP do MCP** em `/mcp`, no mesmo processo (ADR 0006: uma máquina).
- **Ferramentas = funções do núcleo**, com os mesmos escopos: `traduzir`, `sugerir_alternativas`,
  `sintetizar_voz`, `transcrever` (áudio em base64, com o mesmo teto por pedido do STT). A `RecusaDeIa`
  vira resultado de ferramenta com erro (`isError`), com `code` e `retryAfterS` no conteúdo estruturado —
  o cliente MCP decide esperar ou desistir.
- **Autorização pela especificação do MCP:** o `/mcp` é um servidor de recurso OAuth 2.1; o cliente usa
  o fluxo de código de autorização com **PKCE (S256) obrigatório**; o recurso publica os metadados de
  recurso protegido (RFC 9728) e o token é emitido PARA ele (indicador de recurso, RFC 8707) — token de
  outro público é recusado. Tokens de acesso curtos, renovação revogável, escopos = os das chaves.
- **Quem autoriza:** a tela de consentimento exige sessão do app, adulto declarado e mostra os escopos. O
  servidor de autorização (o do Supabase, se oferecer o fluxo de servidor OAuth, ou um nosso mínimo) é
  decisão da implementação; o recurso só confia no emissor configurado.
- Cada chamada monta o contexto como a `/v1`, com `canal: 'mcp'` — o núcleo recusa o perfil protegido
  mesmo que um token antigo sobreviva a uma mudança de idade declarada.

### 5. Só adultos, retenção zero, nunca Gemini

- **Adulto em três pontos:** na criação da chave / no consentimento OAuth, em cada pedido (o adaptador
  lê `ehAdultoDeclarado` do dono) e no núcleo (`recusaDeQuemPede`, que não depende de o adaptador lembrar).
- **Retenção zero:** a API usa o MESMO registro de provedores — em produção só `retencao: 'zdr'`. O
  rastro da API não guarda conteúdo (entrada/saída) mesmo com a telemetria permitindo: o texto de um
  integrador é dado de terceiro que não passou pela nossa tela de consentimento. O cache L2 da tradução
  segue a regra de sempre (frase curta, sem quem pediu); as polidas e os áudios não mudam de lugar.
- **Nunca a API do Gemini**: nenhuma rota nova chama provedor fora do registro, e o registro recusa o
  Gemini em qualquer forma (`ehGemini`) — nem como reserva.

## Risks / Trade-offs

- **Chave vazada** gasta a cota do dono até ser revogada → teto por chave, revogação imediata, prefixo
  visível para o dono achar a chave, `ultimo_uso_em` na tela.
- **Conferir a chave em todo pedido** custa uma leitura → SQLite local, índice pelo prefixo; medir antes
  de pôr cache.
- **Flags sem request**: na API não há instalação nem versão do cliente → as regras de flag por instalação
  não se aplicam à API; flag que dependa disso fica desligada para a API (fail-closed).
- **Duas franquias confundem** → não há duas: a do plano é a única; a da chave é um recorte dela.
- **O MCP é especificação recente** → o transporte e a autorização seguem a revisão vigente na
  implementação; o núcleo não muda com ela.

## Migration Plan

Nada nesta change. Na implementação: migração `chaves_de_api`; montagem do `/v1` e do `/mcp` atrás de uma
flag (`api_publica`, nasce desligada, como a `voz_natural`); registro na LGPD (`docs/lgpd/ropa.csv`: a API
como tratamento, finalidade e base legal); rollback = desligar a flag e revogar as chaves.

## Open Questions (do dono)

- Que plano inclui a API (entitlement novo na matriz, `src/core/planos.ts`) e se ela tem preço à parte.
- O teto padrão por chave (US$/mês ou chamadas/dia) e o limite de taxa (pedidos/min).
- Se o `polimento` entra na primeira leva (exige uma forma de a API guardar sessões).
