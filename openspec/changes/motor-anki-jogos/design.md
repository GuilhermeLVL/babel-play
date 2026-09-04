## Context

Não existe interface de adapter nos minijogos: são 6 construtores com assinaturas próprias, 2 ramos
inline e 7 tipos de rodada, roteados por cadeia de `if` em `montarRodada` (`Play.tsx:637-750`). O
contrato formal são duas tabelas **exaustivas por tipo**: `MINIGAMES` (`types.ts:121-139`) e
`REVELAVEL` (`revelavel.ts:71-81`) — um jogo que não se declara nelas **não compila**. É por elas
que se entra, e a matriz abaixo é uma leitura delas, não uma invenção.

## A matriz jogo × dados

| Jogo | Precisa | Vem do baralho quando | Falta o quê → o que acontece |
|---|---|---|---|
| memória | palavra + tradução | tem os dois campos mapeados | sem tradução → item fica fora deste jogo |
| caça-palavras | palavra + tradução; alfabeto latino | idem | script não latino → jogo indisponível para o baralho (declarado, não falha em silêncio) |
| duelo (blitz) | palavra + (tradução **ou** frase→cloze) | idem; cloze do Anki entra direto | sem nenhum dos dois → fora |
| termo | palavra 4–6 letras, sem espaço/hífen; tradução única no degrau | palavras curtas do baralho | poucas palavras elegíveis → menos degraus, ou jogo indisponível |
| embaralhar frase | frase 4–10 palavras + tradução da frase | nota tem frase de exemplo e tradução | sem tradução da frase → fora |
| escuta | frase + áudio (nativo ou TTS) + ≥4 falas | frase + áudio do baralho, ou TTS | sem áudio e sem voz no idioma → jogo indisponível |
| ditado | frase 4–12 palavras + áudio | idem | idem |
| karaokê | frase + áudio com duração real | só com áudio nativo do baralho | sem clipe → TTS não serve (karaokê precisa de tempo) → fora |
| conectores | frase ≥5 tokens com conector; idioma en/pt/es | frase do baralho no idioma certo | idioma sem lista de conectores → indisponível |

Regra geral da degradação: **nunca apresentar item quebrado**. Ausência de dado tira o item daquele
jogo; ausência sistemática torna o jogo indisponível *com motivo dito* (o gate `estadoDeCadaJogo` já
faz isso e já tem os motivos `sem-voz`, `trilha-sem-frase`, `audio-carregando`).

## Decisão 1 — Filtro por baralho é `fonte.ref`, não uma quinta fonte

Já argumentado no change `motor-anki-acervo`: `FonteId` é irrenomeável (`exercise_results.origem`
deriva dele) e uma quinta fonte tocaria seis lugares para não entregar nada que o `ref` não entregue.
Semântica: `fonte='baralho'` sem `ref` = todo o acervo (inclusive Anki, como hoje); com
`ref='anki:<deckId>'` = só aquele baralho.

## Decisão 2 — A paridade offline é declarada, não fingida

`cartoesDaFonte` roda no cliente com o payload do deck; para filtrar por baralho ele precisaria saber
a associação cartão→baralho, como já sabe `daTrilha`. Duas saídas:

- **levar a associação no payload** (um campo análogo a `daTrilha`), e o filtro funciona offline; ou
- **não levar**, e o filtro por baralho degradar para "todos" quando o servidor falha.

Escolhido: **levar**, porque o custo é um campo e a alternativa é um filtro que mente exatamente
quando o usuário não pode perceber. Se o campo não estiver presente (versão antiga do payload), a
spec manda **dizer** que o filtro não pôde ser aplicado, em vez de silenciosamente jogar com tudo.

## Decisão 3 — Frase do baralho vira `fala`, com o sinal que já existe

O ramo da trilha (`Play.tsx:673-706`) já converte item sem clipe em jogo de escuta usando
`startMs: 0, endMs: 0` como "não há clipe, fale o texto". A frase de exemplo do baralho entra pelo
mesmo caminho: com áudio nativo, vira fala com duração real (e o karaokê funciona); sem áudio, vira
fala com `0/0` (escuta e ditado funcionam por TTS, karaokê não entra). Nenhum tipo novo.

## Decisão 4 — "Só revisão" é o piso, não o padrão

Item que não serve a nenhum jogo (ex.: palavra sem tradução, num idioma sem voz) não deve sumir: o
usuário o importou de propósito. O modo só-revisão mostra frente/verso e grava na memória, sem
mecânica. É **piso**, não destino preferencial: se o item serve a um jogo, ele vai para o jogo.

## Decisão 5 — Jogo novo só depois da medição

O brief pede minigames que só o Anki viabiliza (memória palavra↔imagem, ditado com áudio nativo,
cloze race, caça-imagem, contexto de legenda). Dois deles são os jogos atuais alimentados pelo
caminho de mídia e de frase — não precisam de código de jogo novo. Os demais só entram se o corpus
do G2 mostrar que os baralhos reais os sustentam: um jogo que só funciona em 2% do acervo é
mobiliário, e a auditoria de tela já pagou essa conta uma vez.

## Riscos

| Risco | Mitigação |
|---|---|
| Rodada mista de idiomas entrega a resposta pelo idioma do distrator | Não é escopo aqui; o filtro por baralho mantém um idioma por rodada, como hoje |
| Baralho de script não latino quebra caça-palavras/termo em silêncio | A matriz declara indisponibilidade com motivo; o gate já sabe exibir motivo |
| Chip de origem polui a prévia | Uma linha discreta, dentro do funil `previaSegura` (nenhum ramo escreve título por fora) |
