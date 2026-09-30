# ADR 0012 — Manter o núcleo de IA em funções sem Express, para a API `/v1` e o MCP chamarem o mesmo código

- **Data:** 2026-09-30
- **Estado:** proposto
- **Change OpenSpec:** `api-e-mcp`

> Número 0012: o plano aprovado (`functional-doodling-crane`) reserva o 0010 para o B7 (troca de provedores
> com o custo medido), e o 0011 é o dos planos v2.

## Contexto

Antes da Fase F, as cinco funções de IA gerenciada eram handlers do Express que decidiam E respondiam no
mesmo passo: `mtProxy.ts` (433 linhas), `alternativas.ts` (225), `polimento.ts` (422), `ttsProxy.ts` (543)
e `sttProxy.ts` (531). As recusas eram escritas direto na resposta, espalhadas em ajudantes que recebiam
`res`: `abrirReservaDeLlm(userId, tokens, res)` (`reservaDeNuvem.ts`), `responderNuvemOcupada(res, …)`
(`admissao.ts`), `responderPortaoFechado(res, …)` (`orcamentoDeIa.ts`), `responderUsoJustoDoDia(res, …)`,
`parseOr400(schema, body, res)`, e a flag lida por `flagLigada(req, …)`. O plano da Fase F pede ganchos
para uma rota `/v1` com chave de API e um servidor MCP remoto; com a regra presa ao `req`/`res`, cada um
teria de reescrever a ORDEM das recusas (entitlement → flag → configuração → cache → portão → admissão →
cota → cascata → custo), e a cópia é onde a regra de cobrança e a de retenção divergem.

## Decisão

As cinco funções moram em `server/ai/nucleo/` e não dependem do Express: `traduzirNoNivel`,
`sugerirAlternativas`, `polirLote`, `sintetizarVoz`, e o STT em dois passos (`admitirTranscricao`, a porta
barata antes de ler o corpo; `transcrever`, com o áudio). Cada uma recebe um `ContextoDeIa` — `userId`,
`requestId`, `rastro`, `entitlements` já resolvidos, `emTeste`, `modo` da cota, `canal`
(`app | api | mcp`), `perfilProtegido`, `registrarCusto?` e `flagLigada?` — e o pedido VALIDADO (cada
módulo exporta o `lerPedido…` do corpo cru). Devolve um resultado tipado: o sucesso, ou uma `RecusaDeIa`
com `status`, `code`, `retryAfterS` e o corpo exato de hoje (`nucleo/recusa.ts`).

As rotas do app viram adaptadores finos: leem o `req`, abrem a porta GRATUITA do app (convidado, pool
do dia, nuvem de alívio — ela lê IP, cabeçalho e flag e continua do app), resolvem o plano uma vez,
montam o contexto, chamam o núcleo e traduzem o resultado (`respostaDoNucleo.ts`). O gancho `aoDecidir`
(`nucleo/ganchos.ts`) é chamado no instante da decisão, antes do `finally`: o app responde ali, e a
ordem de antes (responder, depois estornar a cota, soltar a vaga e gravar o L2) fica igual.

Fora do app, só adulto declarado passa (`recusaDeQuemPede`: 403 `perfil_protegido`), e isso mora no
núcleo, não em cada adaptador futuro. No app o campo é `null`: a conta restrita já é recusada no mount
(`exigirContaLiberada`) e o menor liberado usa a nuvem como qualquer assinante.

## Alternativas consideradas

- **Chamar os handlers com um `req`/`res` falso a partir da API/MCP.** É o que os testes fazem, e é
  frágil: o handler lê cabeçalhos (`x-nuvem-alivio`, `x-credential-id`), IP e flags do request; um objeto
  falso esquece um campo e a regra muda sem erro.
- **Reescrever a API como um serviço à parte.** Duplica cota, admissão, portão e custo — exatamente o que
  este ADR quer impedir — e dobra a superfície de retenção zero a auditar.
- **Devolver o resultado e deixar o adaptador fazer a limpeza.** Mais simples, mas a cota seria devolvida
  (e o L2 gravado) antes da resposta sair: o mesmo status, com latência maior e a ordem de efeitos
  trocada. O gancho `aoDecidir` custa uma função idempotente e mantém a ordem.
- **Mover também a porta gratuita para o núcleo.** Ela lê o IP pseudonimizado, cabeçalhos e flags de
  request; na API não há convidado nem alívio. O núcleo recebe o veredicto (`modo`, `registrarCusto`).

## Consequências

Melhor: a API e o MCP chamam o mesmo código do app, com as mesmas recusas, a mesma cota, o mesmo custo e
os mesmos provedores (retenção zero; o registro recusa o Gemini em qualquer forma). Cada função tem
testes diretos, sem Express (`tests/integration/nucleo-de-ia.test.ts`). As rotas caíram para 82–135 linhas.

Pior: um arquivo a mais por função (o adaptador e o núcleo), e os rótulos de log (`route: '/api/ai/…'`)
continuam os da rota do app até a `/v1` existir. O tutor entrou no núcleo depois (30/09/2026,
`nucleo/conversarComTutor.ts`, com a rota `server/routes/tutor.ts` como adaptador), mas não é função da
API nesta fase: expô-lo é decisão do dono. Com ele, `abrirReservaDeLlm` e `responderNuvemOcupada`
perderam o último usuário e saíram. Uma divergência antiga ficou visível e foi mantida:
as alternativas nunca leram o teste de 14 dias (admitem o teste como Premium; o `/mt` e o polimento, como
grátis) — alinhar é decisão de produto, não deste refactor.

Proibido: importar `express`, `express-rate-limit`, a porta do app (`lib/convidado`, `lib/nuvemDeAlivio`)
ou o adaptador HTTP (`respostaDoNucleo`) dentro de `server/ai/nucleo/`; recusar escrevendo em `res` numa
função do núcleo; um canal fora do app sem `perfilProtegido === false`.

## Como isto é cobrado

- **Lint:** `no-restricted-imports` no bloco `server/ai/nucleo/**` do `eslint.config.js`.
- **Testes do núcleo:** `tests/integration/nucleo-de-ia.test.ts` chama as cinco funções direto, com
  sucesso, recusas principais, o gancho chamado uma vez e o 403 do perfil protegido fora do app.
- **Testes de rota como rede:** os de integração (`alternativas`, `polimento`, `tts`, `cascata-de-stt`,
  `admissao-de-ia`, `quota-reserve-proxies`…), a caracterização (`tests/caracterizacao/ia.test.ts`), a
  segurança (`tests/seguranca/*`) e o contrato (`node scripts/testes/contrato-api.mjs`) passaram sem
  mudança de comportamento — o único teste tocado lia um literal por caminho de arquivo
  (`tests/eval/bancada-nuvem.test.ts`, que agora lê o núcleo).
- **Contrato das recusas:** o mesmo arquivo confere que `recusaPortaoFechado` produz a resposta de
  `responderPortaoFechado`, e que `recusaNuvemOcupada` produz, literal, o 429 que o `responderNuvemOcupada`
  respondia (a função saiu quando o tutor entrou no núcleo).
