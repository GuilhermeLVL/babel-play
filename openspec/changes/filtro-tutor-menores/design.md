## Onde encaixa

`conversarComTutor` já calcula `menor = await ehMenor(userId)` para a instrução de segurança. Os dois pontos que entregam
texto (a perna da nuvem que entregou e o Ollama do self-host) passam por `entregar(...)`, que chama
`moderarSaidaDoTutor(texto, { protegido: menor })`. O `tutor` e o `corretor` compartilham esse núcleo, então os dois são
filtrados. A cota é consumida como antes: o modelo foi chamado e cobrou.

## Fluxo, não streaming

O tutor NÃO usa streaming: a cascata chama `chamarChat` (resposta inteira) e a rota responde um JSON único no gancho
`aoDecidir`. A moderação roda antes de `decidir(...)`, então nada do texto do modelo sai parcialmente. O único caminho em
fluxo (`chamarChatEmFluxo`) é o "Como respondo?" do assistente ao vivo (`assistenteAoVivo.ts`), fora do tutor — listado como
próxima tarefa; filtrá-lo exigiria segurar o fluxo para perfil protegido.

## Assinatura

A frase fixa NÃO é assinada. Ela não é fala do modelo; o cliente (`historicoParaOTutor`) só devolve turno `assistant` com
assinatura, então ela não volta ao modelo. O texto barrado nunca saiu do servidor, então nunca teve assinatura: não há como
repassá-lo como turno válido (o servidor descarta turno sem assinatura que confere). Assinar a frase fixa seria inofensivo,
mas deixar de assinar mantém a regra simples: só fala do modelo aprovada é assinada.

## Interface para a opção C

```ts
type ModeradorDeSaida = (texto, perfil: { protegido: boolean }) => Veredicto | Promise<Veredicto>;
type Veredicto = { ok: true } | { ok: false; motivo: CategoriaDeBloqueio };
```

`moderarSaidaDoTutor` percorre `MODERADORES` em ordem e o primeiro que barra decide. A moderação por IA entra depois do
filtro local (o barato decide primeiro e poupa a chamada), só para perfil protegido, sem mudar quem chama.

## Normalização e falso positivo

Contatos são lidos no texto antes do leetspeak. O resto lê o texto normalizado: NFKD sem acento, invisíveis removidos,
leetspeak só dentro de palavra com letra, pontuação vira espaço (o `?` fica), letras soltas espaçadas juntam, 3+ letras
repetidas viram uma. Texto acima de 20 mil caracteres (`TETO_DO_TEXTO_MODERADO`) é barrado como `texto_longo` sem
conferir — a resposta do tutor tem ~900 tokens, e acima disso as expressões de domínio/e-mail ficariam quadráticas.

Contra falso positivo: frase de intenção em vez de palavra solta ("como comprar maconha", não "maconha"; "how to make a
bomb", não "bomb") e palavras ambíguas fora da lista com o motivo anotado. Depois da revisão do PR #135:

- **automutilação**: "machucar/ferir" só com intenção ("de propósito", "você deveria"); "córtate/cortarte" seguido de
  objeto (el, la, tu, pelo, uñas, flequillo…) é cabelo, e "cortarse las venas/muñecas" continua barrado; "cut yourself
  some slack" passa;
- **dado pessoal**: o nome do dado seguido de "favorito/preferido/da sorte/one" não é pedido ("número favorito",
  "number one goal");
- **aliciamento**: "ver … ao vivo" saiu (é programa); "after school" só com "meet me"; "estás sola" só como pergunta;
  "our secret" e "nuestro secreto" só quando combinados ("it's our secret", "es nuestro secreto"), não "our secret
  ingredient" nem "nuestro secreto es el amor".

O teste fixa 49 respostas de aula com as palavras ambíguas que precisam passar.

## A citação, e o risco que sobra

Para dado pessoal e aliciamento, o trecho citado (`**…**`, `__…__`, aspas duplas, `'…'`, `‘…’`, «…», crase — como o tutor
marca o idioma estudado) é ignorado SÓ quando há explicação fora dele ("diga", "significa", "quer dizer", "use", "para
perguntar", "frases", "em inglês", "means", "say", "se dice", "="). "Me diga" e "tell me" não contam. Sem explicação, o
trecho citado é avaliado: "Me diga, **qual é o seu endereço?**" é barrado. Isso fecha o desvio mais simples — uma injeção
no material da tela pedindo ao modelo para pôr o pedido em negrito.

RISCO QUE SOBRA (para a opção C): com uma moldura de aula ("Em inglês: **qual é o seu endereço?**"), o pedido citado
passa. O filtro local não sabe se a frase está sendo ensinada ou feita; só um moderador que entende contexto separa os dois.

## Contato externo

Link explícito (`http`, `www.`), domínio solto com TLD de convite, e-mail, `@perfil` com nome de rede no texto e
telefone. Telefone exige FORMATO: 8+ dígitos colados, ou 9 a 15 dígitos com `+` de país, DDD entre parênteses ou
hífen/ponto entre grupos — grupos separados só por espaço ("100 200 300 400 500") não contam. Domínios de exemplo
(`example.com/.org/.net`, `exemplo.com(.br)`, `ejemplo.com`, `test.com`) e o do app são permitidos em domínio e e-mail.
DECISÃO: um telefone real e bem escrito ("My phone number is (11) 98765-4321") continua barrado para menor mesmo numa
frase de aula — o filtro não sabe se o número é de exemplo, e contato é o que mais importa segurar.

## Observabilidade

`log('warn', { event: 'tutor_saida_filtrada', categoria, funcao, requestId })` — `categoria` e `funcao` entraram na
allowlist do logger; o texto nunca. Prometheus `ia_saida_filtrada_total{funcao,categoria}` (com `METRICS_ENABLED`), no
Worker o ponto `saida_filtrada` do Analytics Engine (função, categoria; `docs/runbook.md`) e a anotação `saidaFiltrada`
no rastro de telemetria.

## Limites conhecidos

- Paráfrase, eufemismo e idiomas fora de pt/en/es (os contatos valem em qualquer idioma).
- A moldura de aula em volta de um pedido citado (acima).
- Com conteúdo de rastro ligado no Langfuse (`conteudoPermitido`), a `saida` da geração é gravada pela cascata antes do
  filtro — vale para todo texto do tutor, não só o barrado; está desligado por padrão.
