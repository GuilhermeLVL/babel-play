## Context

Hoje a escolha de campo é uma função pura no servidor: `indicePorNome(campos, padroes)`
(`server/import/anki.ts:124-136`), com `PADRAO_FRENTE` e `PADRAO_VERSO` varridos **em ordem de
prioridade** — igualdade exata primeiro, "contém" depois. A ordem importa e já foi paga com um
teste: `Word` precisa vencer `Front` (num baralho com ambos, `Front` costuma ser o template), e a
igualdade precisa vir antes de "contém" porque `Sound_Meaning` **contém** "meaning" e é um áudio.

Essa função continua sendo o "auto". O que se acrescenta é override e memória.

## Decisão 1 — O hash da estrutura é sobre nomes normalizados + ordem

Chave do perfil: sha256 dos nomes dos campos normalizados (minúsculas, sem acento, separadores
colapsados) **na ordem em que aparecem**, truncado. Justificativa de cada metade:

- **normalizar** porque o mesmo tipo aparece como `Word Audio`, `Word_Audio` e `WordAudio` conforme
  a ferramenta que gerou (levantamento do G0);
- **manter a ordem** porque dois tipos com os mesmos nomes em ordens diferentes são tipos
  diferentes, e aplicar o mapeamento de um no outro embaralharia tudo em silêncio.

Não usar o `mid` (id do tipo de nota) como chave: ele é local à coleção de origem e muda entre
usuários — o mesmo Kaishi baixado por duas pessoas teria ids diferentes. O hash é a única chave
estável entre coleções.

## Decisão 2 — `Expression` se resolve por conteúdo, não por nome

O G0 achou a ambiguidade: `Expression` é a palavra-alvo nos decks Core/vocabulário e é a **frase**
nos decks subs2srs. Nenhuma lista de nomes resolve isso. Regra: quando o nome é ambíguo, decidir
por **amostra do conteúdo** — comprimento médio e presença de espaço em N notas. Palavra é curta e
sem espaço; frase é longa e tem espaços. O palpite vem com confiança baixa e o Mapeador destaca o
campo para conferência.

## Decisão 3 — Confiança explícita, e a tela reage a ela

Cada palpite carrega confiança: **alta** (nome bateu por igualdade num padrão prioritário), **média**
(bateu por "contém", ou por perfil salvo de outro usuário), **baixa** (posicional, ou desempate por
conteúdo). Regra de produto: confiança baixa em palavra ou significado **abre o Mapeador antes de
gravar**, em vez de importar torto e deixar o usuário descobrir depois. É o oposto do que aconteceu
com o 4000EW, onde a falha foi silenciosa.

## Decisão 4 — Priors pré-cadastrados são dado, não código

A tabela de nomes por papel levantada no G0 (§4) entra como **dado** (um JSON versionado), não como
regex espalhada: `Word`/`Expression`/`Vocabulary-Kanji`/`word_to_translate`/`Simplified`/`Front`…
para palavra; `Sentence`/`SentKanji`/`Example` para frase; `Word Audio`/`SentAudio`/`Sound` para
áudio; `Picture`/`Image`/`Snapshot`/`IMG` para imagem. Assim o G2 pode ampliar a lista com o que o
corpus mostrar, sem tocar em lógica.

Regra herdada do parser e mantida: `[sound:...]` pode aparecer em **qualquer** campo — a detecção de
áudio olha o conteúdo, não só o nome do campo.

## Decisão 5 — Reprocessar não pede o arquivo de novo

Trocar o mapeamento recalcula frente/verso/exemplo a partir de `campos_brutos` (change
`motor-anki-acervo`). Sem isso o usuário teria de reimportar 200 MB para corrigir um campo — e a
correção só existiria para quem ainda tivesse o arquivo.

## Riscos

| Risco | Mitigação |
|---|---|
| Perfil salvo errado se propaga a cada import | O perfil é por usuário; o Mapeador sempre mostra o que aplicou e permite desfazer; confiança "média" quando veio de perfil |
| Renomear um campo quebra o perfil | É o comportamento correto (estrutura diferente = tipo diferente); o auto reassume e o custo é uma correção |
| Reprocessar em massa é caro | Reprocessamento roda por baralho, em lote, e só recalcula texto — não toca em SRS nem em mídia |
