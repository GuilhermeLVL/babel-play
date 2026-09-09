# Fase 4 — Segurança (entregável do Gate 4)

Rodada de saneamento, branch `saneamento/2026-09-08`. Oito changes, seis commits.

Tudo abaixo é **confirmado por execução**, salvo onde estiver escrito "inferido por leitura".

## 1. A matriz que substituiu a leitura de arquivo

A pergunta "quais rotas são públicas e quais têm limitador" não tinha resposta verificável. A
primeira tentativa — regex sobre `server/routes/*.ts` — deu falso positivo em série, e por um motivo
que nenhuma regex resolve: **o que decide se uma rota é pública não está no arquivo da rota, está na
ordem da montagem**. O mesmo router antes do `authMiddleware` é público e depois dele é privado.

`tests/seguranca/_matriz.ts` lê `app._router.stack` depois de `criarApp()`: a pilha real, na ordem
real. O caminho de cada camada é decodificado do `RegExp` que o `path-to-regexp` 0.1 compilou (o
`Layer` do Express 4 não guarda a string); limitador é reconhecido pelas props `resetKey`/`getKey`
que o `express-rate-limit` v7 pendura, e só conta se montado **antes** da rota.

| medida | valor |
|---|---:|
| rotas classificadas | 85 |
| públicas (todas na allowlist com razão) | 4 |
| mounts privados fora de qualquer limitador, antes | 2 |
| escritas privadas sem limitador, antes | 4 |
| idem, depois | 0 |

As quatro escritas descobertas estavam todas em `/api/admin`: `POST /armazenamento/reconciliar`,
`POST /billing/reprocessar/:id`, `PATCH /users/:id`, `PATCH /users/:id/plan` — quatro escritas
**cross-tenant**. `requireRole` diz *quem* entra, não *quantas vezes*, e a reconciliação percorre
todos os usuários fazendo `stat`/`HEAD` por arquivo.

## 2. Achados, correções e o que prova cada uma

| achado | onde | correção | teste |
|---|---|---|---|
| 4 escritas admin sem limitador | `server/http/app.ts` | `/api/admin` e `/api/audio` no `writeLimiter` | `matriz-de-rotas.test.ts` (lista de exceções vazia) |
| `trust proxy` nunca configurado — atrás de proxy toda origem vira a mesma chave de limitador | `app.ts` | `TRUST_PROXY` declarada, aplicada só quando definida | `cabecalhos-e-forca-bruta.test.ts` |
| 401 não chegava a limitador nenhum | `app.ts` | limitador antes do auth, contando só o que falhou | `cabecalhos-e-forca-bruta.test.ts` (2 casos) |
| corpo do chat espalhado ao provedor sem schema | `server/ai/proxy.ts:44` | `llmChatCompletionsSchema`, `strictObject` | `caracterizacao/ia.test.ts` |
| `req.params` cru em 4 handlers | `sessions.ts:333`, `vocab.ts:159`, `admin.ts:52,74` | `idParamSchema` | `fsrs`, `sessao-e-rodada`, `rbac-admin-endpoints` |
| cabeçalhos do STT sem formato | `sttProxy.ts:90` | `sttHeadersSchema` | `caracterizacao/ia.test.ts` |
| recusa de SSRF respondia **200** | `ssrf.ts`, `proxy.ts` | 400 `destino_bloqueado`, sem o IP resolvido | snapshot de contrato |
| corpo do provedor externo ecoado ao cliente | `mtProxy.ts:146`, `sttProxy.ts:122` | `provedor_indisponivel` + `requestId`; texto no log | 3 snapshots |
| envelope de erro fora do padrão | `metrics.ts:93,159` | `responderErro` com código | 2 snapshots |
| campo do `.apkg` exportado sem escape | `ankiExport.ts` | `escaparHtml` em `flds` e `sfld` | `anki-html-hostil.test.ts` |
| valores do usuário no log via mensagem do ORM | `logger.ts` | `redigirErro` dentro de `log()` | `log-sem-pii.test.ts` |
| `largerModels` nunca lido pelo servidor | `provedores.ts` | `LLM_MODEL_GRANDE` + `modeloDoPlano` | `modelo-por-plano.test.ts` |

### Três achados que não vieram de auditoria nenhuma

**O log guardava o conteúdo do usuário.** O logger tem allowlist de campos desde o M-01 e o
comentário dele promete que transcrição, chave e prompt nunca vão para o diário. A allowlist é sobre
a **chave**, e `error` é uma chave permitida de texto livre. Medido:

```
String(err) === 'Error: Failed query: insert into "t" ("id","texto") values (?, ?)
                 params: 2,transcricao-do-usuario-meu-cpf-e-123.456.789-00'
```

O driver do libsql **não** faz isso — `LibsqlError` traz só `SQLITE_CONSTRAINT: UNIQUE constraint
failed: t.texto`. Quem anexa é o drizzle, em `message`, em `stack` e numa propriedade `params`. Toda
escrita que falhava — salvar transcrição, gravar cartão, guardar credencial — despejava o conteúdo
no log, por dentro do único campo que a allowlist deixa passar. Vale para os 20+ pontos que chamam
`log(..., { error: String(err) })`, e por isso a redação foi para dentro de `log()`.

**O `.apkg` exportado carregava marcação viva.** `limparCampo` remove tags e decodifica as entidades
**depois**, de propósito: sem essa ordem, `&lt;div&gt;` — texto que o autor da nota quis mostrar —
seria confundido com tag e apagado. O efeito colateral, medido, é que
`&lt;script&gt;alert(1)&lt;/script&gt;` sai de lá como marcação. Dentro do produto é inerte (nada do
baralho vira HTML; o único `dangerouslySetInnerHTML` do cliente é o QR do 2FA). O sink é a saída:
`notes.flds` é renderizado pelo Anki, que é um webview. Baralho hostil importado e reexportado
levava a carga para fora do nosso domínio.

**O plano prometia um modelo que ninguém entregava.** `largerModels` está na matriz desde a Fatia 1,
é devolvido ao cliente, e `grep largerModels server/` não achava um único leitor. O Pro pagava por
uma diferença inexistente e o free usava o modelo caro sem nada o impedir.

## 3. IDOR — 19 rotas, zero vazamentos

Os casos são **gerados da matriz** (privadas com parâmetro), então uma rota nova com `:id` derruba a
suíte até alguém declarar como semeá-la. Cada caso: semeia recurso novo de A → B chama com **corpo
válido** (um 400 de schema não prova isolamento, prova que a validação roda antes da autorização) →
confere que o recurso de A continua intacto → **e só então A repete a chamada**. Sem esse último
passo, uma rota que responde 404 para todo mundo "isolaria" perfeitamente.

Nenhum 200 com dado de outro dono, nenhum efeito, nenhum 5xx. Mais as 9 rotas de `/api/admin`
respondendo 403 para conta sem papel.

**Quatro desvios de forma de resposta**, registrados com razão e **sem correção** — nenhum vaza
dado, nenhum tem efeito, e nenhum serve de oráculo de existência (respondem igual para id
inventado). São decisão do dono:

- `DELETE /api/sessions/:id` e `DELETE /api/vocab/:id` devolvem **200 `{ok:true}`**, confirmando uma
  exclusão que não aconteceu — descartam o resultado do repositório escopado;
- `GET /api/vocab/:id/ocorrencias` devolve **200 `[]`**;
- `POST /api/vocab/:id/review` devolve **400** onde `PATCH /api/vocab/:id` devolve 404, pela mesma
  condição.

## 4. Segredos, dependências e SAST

| ferramenta | antes | depois |
|---|---|---|
| `gitleaks` (histórico completo) | 6 achados | 0 (allowlist nomeada) |
| `semgrep` `p/typescript p/nodejs p/expressjs` em `server/` | não rodava | 1 WARNING |
| `semgrep` `p/typescript p/react` em `src/` | não rodava | 0 |
| `npm audit` alta/crítica | 5 | 4, todas na allowlist justificada |
| `npm audit` moderadas | 13 | 13, todas em devDependencies |

Os 6 achados do gitleaks eram **o mesmo valor**, `segredo-e2e-hs256-marco1`, a constante com que
`mt1-isolation-e2e.test.ts` assina um HS256 local. Quatro dos seis eram a varredura achando o
`gitleaks-historico.json` da Fase 0, que guardava a varredura anterior — dois achados registrados
duas vezes. Por isso a allowlist é **por valor e não por caminho**: um segredo diferente em qualquer
arquivo continua sendo acusado. Nada a rotacionar, e `git filter-repo` não se justifica.

O único achado do semgrep em `server/` é `direct-response-write` em `sessions.ts:104` — exatamente o
que a regra própria `resposta-crua` já acusa. Um SAST independente concordando com as seis regras da
casa é o resultado que se queria.

As 4 HIGH (`adm-zip`, `sharp`, `onnxruntime-node`, `@huggingface/transformers`) não têm correção
upstream, são transitivas de inferência que roda no navegador, e estão em `scripts/audit-gate.mjs`
com razão escrita e `reevaluateBy: 2026-11-01`. As 13 moderadas são todas de ferramenta de
desenvolvimento (esbuild/vitest/drizzle-kit/autocannon) — plano: sobem junto com o próximo bump.

## 5. Cabeçalhos, CORS e cookies

A CSP era `false` fora de produção, com o efeito de qualquer portão que só liga no fim: a primeira
vez que alguém a via era quando ela já bloqueava. Agora sai `Content-Security-Policy-Report-Only`
com as **mesmas** diretivas — o navegador reclama no console e não bloqueia nada, nem o inline e o
eval que o HMR do Vite precisa. O ruído em dev não é efeito colateral, é o produto.

CORS e cookie **não mudaram código**; ganharam prova negativa, que é o que faltava:

- não há middleware de CORS montado, então `Access-Control-Allow-Origin` nunca sai (nem no
  preflight);
- o servidor não emite cookie, e um cookie enviado não autentica ninguém (401).

É isso que sustenta "CSRF não se aplica": a auth é `Authorization: Bearer`, um header que o navegador
não anexa sozinho numa requisição disparada por outro site. A frase deixa de valer no minuto em que
alguém montar `cookie-parser` — e essa mudança não pareceria uma mudança de segurança para quem a
fizesse. Por isso o teste.

### O raio de alcance do bloqueio de 401, registrado porque é decisão

O limitador fica **antes** do `authMiddleware` — é o que faz dele proteção de verdade, porque recusa
a requisição em vez de só trocar a resposta. O preço: uma vez estourado, o balde bloqueia tudo
daquela chave na janela, inclusive requisição com token bom. É o que qualquer bloqueio por origem
faz, e é o motivo de a chave precisar ser o IP real — atrás de proxy sem `TRUST_PROXY`, o bloqueio de
um atacante pegaria todo mundo junto. Há teste para os dois lados: quem navega autenticado não gasta
o balde (40 chamadas), e quem estourou é barrado mesmo com token válido.

## 6. Dois diagnósticos do plano corrigidos por medição

**"O cap mensal degrada aberto (`usageQuota.ts:81`); trocar por 402."** Falso. `reserveManagedCall`
devolve `false` no teto e as rotas respondem 402 `quota_exceeded`; decidir e contabilizar são a mesma
instrução (`usageCountersRepo.reserve`), então o teto vale sob concorrência. O que degrada aberto é
só a falha de **infra** (o `catch`), que é política de fair-use declarada, com log
`quota_reserve_failed_open` e teste próprio (`usage-quota-reserve.test.ts:62`). Os testes de
overshoot que o plano pedia já existiam em dois níveis: 20 reservas simultâneas contra teto 5 → 5
(`usage-quota-reserve.test.ts:52`) e 20 requisições simultâneas → 5 chamadas ao provedor
(`quota-reserve-proxies.test.ts:98`). O furo era só o entitlement não lido.

**"`/api/import/anki` (200 MB) precisa entrar no `writeLimiter`."** Desnecessário: o mount
`/api/import` já está no `expensiveLimiter`, 60/min por tenant contra os 120/min do `writeLimiter` —
teto mais apertado, não mais frouxo.

## 7. Três testes que estavam quebrados e por quê

`rate-limit-escrita`, `montagem-espelha-o-server` e `compressao-http` leem `server/http/app.ts` como
**texto** e casavam com aspas duplas literais. O prettier da Fase 3 (`singleQuote` em `server/**`)
reescreveu o arquivo no commit da matriz, e as três regexes passaram a casar com zero ocorrências —
`montagem-espelha-o-server` caiu comparando os 14 routers do harness com uma lista vazia.

Registro honesto: **dois commits desta fase (`19473e8`, `a21a94e`) foram feitos com essas três
falhas na árvore**, porque a suíte completa que rodei verde foi antes da passada do formatador. As
três regexes agora aceitam qualquer aspa. A lição vale além delas: teste que lê código como texto não
pode depender do formatador.

## 8. Provas negativas registradas

| o que | como | resultado |
|---|---|---|
| escape do `.apkg` | removidas as duas chamadas de `escaparHtml` | 2 dos 20 casos falham |
| redação do log | `log()` voltando a `out[k] = v` | 3 dos 10 casos falham, com o valor do usuário na linha JSON |
| limitador de 401 | bloco removido de `app.ts` | 2 dos 9 casos falham (401 e 200 em vez de 429) |

## 9. Commits

| commit | o quê |
|---|---|
| `fe491a5` | semgrep no CI, allowlist do gitleaks por valor |
| `c4502f8` | escape do campo na exportação `.apkg` + 20 casos hostis |
| `0a2ad48` | redação do log, campo `stack` na linha JSON |
| `19473e8` | matriz rota × guarda, IDOR nas 19 rotas, `TRUST_PROXY` |
| `a21a94e` | schema em toda entrada do gateway, params, envelope de erro |
| `bc22eb6` | CSP report-only, teto de 401, prova negativa de CORS e cookie |
| `35f57c6` | modelo de IA por `largerModels` |

## 10. Bateria verde ao fim da fase

339 arquivos, **3.819 testes**, 2 skipped, 0 falhas. `tsc --noEmit` · `typecheck:estrito` ·
`eslint --max-warnings 0` · `madge` (zero ciclos) · `ast-grep test` (6 fixtures) + `scan` ·
`rotas-sem-caracterizacao` · `rotas-sem-consumidor` · `audit:gate` · `validar-workflows` ·
`config-inventario` — todos exit 0.

## 11. O que fica em aberto

- Os **quatro desvios de forma** do §3, que são decisão do dono.
- `LLM_MODEL_GRANDE` sem valor definido: a mecânica existe e está testada; qual modelo vale a
  diferença de preço é decisão de produto.
- `DELETE /api/ai/credentials/:id` continua sem consumidor na interface (registrado na Fase 2 como
  lacuna de produto: a pessoa não consegue apagar uma chave de API que colou).
- **Inferido por leitura, não medido:** o comportamento do limitador de 401 atrás de um proxy real.
  Aqui ele foi exercitado com `TRUST_PROXY=1` e `X-Forwarded-For` sintético.
