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

Contatos (link, e-mail, telefone ≥ 9 dígitos com grupo de 3+, `@perfil` só com nome de rede no texto) são lidos no texto
antes do leetspeak. O resto lê o texto normalizado: NFKD sem acento, invisíveis removidos, leetspeak só dentro de palavra
com letra, pontuação vira espaço (o `?` fica), letras soltas espaçadas juntam, 3+ letras repetidas viram uma.

Contra falso positivo: frase de intenção em vez de palavra solta ("como comprar maconha", não "maconha"; "how to make a
bomb", não "bomb"), palavras ambíguas fora da lista com o motivo anotado, e para dado pessoal/aliciamento o trecho citado
(`**…**`, aspas, crase — como o tutor marca o idioma estudado) é ignorado e o pedido precisa ser pergunta (`?`) ou
imperativo. O teste fixa 31 respostas de aula com as palavras ambíguas (drugstore, kill time, bomba de chocolate, coger el
autobús, sexo no formulário, "Where do you live?" citado, números grandes, `@ficha`, CVV 188) que precisam passar.

## Observabilidade

`log('warn', { event: 'tutor_saida_filtrada', categoria, funcao, requestId })` — `categoria` e `funcao` entraram na
allowlist do logger; o texto nunca. Prometheus `ia_saida_filtrada_total{funcao,categoria}` (com `METRICS_ENABLED`) e a
anotação `saidaFiltrada` no rastro de telemetria. No Worker, o log é o que conta (a métrica Prometheus não roda lá).

## Limites conhecidos

- Paráfrase, eufemismo e idiomas fora de pt/en/es (os contatos valem em qualquer idioma).
- Com conteúdo de rastro ligado no Langfuse (`conteudoPermitido`), a `saida` da geração é gravada pela cascata antes do
  filtro — vale para todo texto do tutor, não só o barrado; está desligado por padrão.
