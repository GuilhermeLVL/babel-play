# ADR 0004 — Nomear as três normalizações de texto, em vez de unificar quinze cópias numa só

- **Data:** 2026-09-09
- **Estado:** aceito
- **Change OpenSpec:** `adr-normalizacao-de-texto`

## Contexto

A auditoria de 2026-09-07 (achado A24/A55) contou "5 implementações da mesma chave" e a medição da
Fase 2 encontrou 15 lugares chamando `normalize('NFD')`. A leitura natural — "a mesma função
copiada quinze vezes" — está errada, e agir sobre ela quebraria o produto.

Abrindo os quinze, eles se separam em **três perguntas diferentes**:

| pergunta | o que faz | onde |
|---|---|---|
| **1. Estas duas palavras são a mesma?** | tira acento e caixa, e remove **tudo** que não é letra ou número, inclusive espaço | `src/core/texto/palavra.ts:14` (`chaveDaPalavra`) |
| **2. Estes dois textos são o mesmo?** | tira acento e caixa e **preserva os espaços**, porque o texto é uma frase | `languages.ts:79`, `cefrWordlist.ts:52`, `dictionary.ts:148`, `escuta.ts:61` |
| **3. Esta letra cabe na grade?** | passa pela base latina (`ł`→`l`, `ø`→`o`), tira acento, sobe para maiúscula e mantém só A-Z | `termo.ts:27`, `wordsearch.ts:60` |

Unificar as três numa só apagaria o espaço das frases (quebrando a comparação do Escuta e a busca
de idioma) ou traria espaço para dentro da chave de palavra (fazendo `água doce` e `águadoce`
deixarem de ser distinguíveis). A duplicação real é **dentro da pergunta 2**: quatro cópias que
diferem só no tratamento do espaço em branco.

| lugar | espaços |
|---|---|
| `languages.ts:79` (`fold`) | preserva como estão |
| `cefrWordlist.ts:52` (`chave`) | apara as bordas |
| `escuta.ts:61` (`chaveDeTexto`) | apara e colapsa os internos |
| `dictionary.ts:148` (`norm`) | colapsa e apara |

## Decisão

**As três perguntas ganham três funções com nome, no núcleo, e a segunda vira uma só com o
tratamento de espaço explícito no chamador.**

`src/core/texto/palavra.ts` passa a exportar `dobrarTexto(s, { espacos })`, onde `espacos` é
`'preservar' | 'aparar' | 'colapsar'`. Cada um dos quatro chamadores passa o que já fazia — nenhum
comportamento muda, e a diferença entre eles deixa de ser um detalhe escondido em quatro regexes
para virar um argumento que se lê.

`chaveDaPalavra` (pergunta 1) e `comBaseLatina` + maiúscula (pergunta 3) já estavam consolidadas e
ficam como estão.

## Alternativas consideradas

**Uma função só para as três.** Quebraria as perguntas 2 e 3, como descrito acima. É a alternativa
que a contagem de "15 cópias" sugere, e é por isso que a contagem sozinha não decide.

**Uma função por chamador, sem opção.** `dobrarTextoAparado`, `dobrarTextoColapsado`... Quatro
nomes para o mesmo conceito com um parâmetro. Volta ao problema de origem: quem lê um dos nomes não
tem motivo para procurar os outros.

**Deixar como está.** As quatro cópias não fazem mal hoje. Mas a próxima tela que precisar comparar
texto vai escrever a quinta, e nada indica que já existem quatro.

## Consequências

Melhora: quem precisar comparar texto encontra uma função e escolhe o tratamento de espaço em vez
de escrever a regex de novo. As três perguntas ficam distinguíveis pelo nome.

Piora: a assinatura com objeto de opções é mais verbosa no ponto de chamada que um `fold(s)`.

Fica de fora, deliberadamente: `src/core/eval/wer.ts:34` (métrica de avaliação, tem regra própria
de pontuação por definição da métrica), `src/data/efemero/servidor.ts:118` (`chaveDedupLegada`, que
existe para ler cartões gravados sob a chave antiga e **não pode** mudar), `server/import/anki.ts:259`
e `src/lib/exercicios/diff.ts:4` (comparação de resposta digitada, com regra própria).

## Como isto é cobrado

`tests/normalizacaoDeTexto.test.ts` fixa o comportamento das três perguntas com os casos que as
distinguem — `água doce` (espaço), `łatwy` (letra que o NFD não decompõe), `Ação!` (pontuação) — e
cobra que os quatro chamadores da pergunta 2 continuem produzindo o que produziam.
