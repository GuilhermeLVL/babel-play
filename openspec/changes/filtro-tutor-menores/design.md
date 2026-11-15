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
  cabelo/unha (el pelo, uñas, flequillo, barba) passa; com veia/pulso/braço/perna/pele (qualquer artigo, singular ou
  plural) barra, assim como "hazte daño" e "lastímate"; "cut yourself some slack" passa;
- **dado pessoal**: o nome do dado seguido de "favorito/preferido/da sorte/one" não é pedido ("número favorito",
  "number one goal");
- **aliciamento**: "ver … ao vivo" saiu (é programa); "after school" só com "meet me"; "estás sola/o" barra como pergunta
  ou seguido de "en casa/ahora/esta noche/con nadie" ("Estas solo palabras" passa); "our (little) secret" barra, menos
  seguido de comida/receita ("our secret ingredient/recipe/sauce"); "nuestro secreto" só combinado ("es nuestro
  secreto"), não "nuestro secreto es el amor".

O teste fixa 44 respostas de aula com as palavras ambíguas que precisam passar.

## A citação não isenta nada (decisão da revisão de segurança)

Versões anteriores ignoravam o trecho citado (`**…**`, aspas) para dado pessoal e aliciamento quando ele "parecia aula":
primeiro com qualquer explicação no texto, depois só com marca de tradução junto ou lista de frases. Cada regra virou
desvio: uma injeção no material da tela pede ao modelo a moldura certa ("Frases úteis: - **What is your home address?**",
"Para perguntar: 'Where is your school?'", "To ask: **Can we meet in person?**", "**¿Dónde vives?** = Where do you
live?"). DECISÃO do coordenador (segurança acima da conveniência da aula, só para perfil protegido): o filtro confere o
texto INTEIRO, citação inclusive, em todas as categorias — a isenção foi removida por completo, que é mais simples e não
deixa uma segunda regra para auditar (nas outras categorias ela nunca existiu).

O custo, aceito e à vista no teste (`ACEITOS_PARA_MENOR`): aula que ensina a um menor frases de dado pessoal ou de encontro
vira a frase fixa — "Para perguntar o endereço, diga **What is your address?**…", "Frases de apresentação: **Where do you
live?**, …", "**It's our secret** = é o nosso segredo…", "Use 'What is your address?' to ask…", "Use ‘Where do you
live?’ para perguntar…". Adulto não é filtrado. A opção C (moderação que entende contexto) é o caminho para recuperar
essas aulas sem reabrir o desvio.

## Contato externo

Link explícito (`http`, `www.`), domínio solto com TLD de convite, e-mail, `@perfil` com nome de rede no texto e
telefone. Telefone exige FORMATO: 8+ dígitos colados; 8 a 15 dígitos com `+`, DDD entre parênteses ou hífen/ponto entre
grupos (menos intervalo de anos "1999-2000"); ou grupos separados por espaço com desenho de telefone — último grupo de 4,
penúltimo de 3 a 5, os da frente de 1 a 3, 8 a 13 dígitos ("11 98765 4321", "98765 4321", "3456 7890", "555 123 4567").
Ficam de fora a contagem de um dígito ("1 2 3 4"), centenas redondas ("100 200 300") e listas de anos ("1999 2000
2001"). Domínios de exemplo
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
- Aula que ensina frase de dado pessoal ou de encontro a menor vira a frase fixa (acima).
- Com conteúdo de rastro ligado no Langfuse (`conteudoPermitido`), a `saida` da geração é gravada pela cascata antes do
  filtro — vale para todo texto do tutor, não só o barrado; está desligado por padrão.
