## Why

O parser adivinha qual campo é a palavra e qual é o significado, **e quando erra o usuário não tem
como corrigir**. O erro não é hipotético: o baralho "4000 Essential English Words" do AnkiWeb tem
`№` e `IMG` como campos 0 e 1, e a leitura posicional descartou **3.871 de 3.871 notas** — a tela
dizia "0 notas lidas" sobre um baralho perfeitamente válido, sem nenhuma pista do porquê. O
conserto (mapeamento por nome, `server/import/anki.ts:109-136`) resolveu **aquele** baralho; a
comunidade documenta que campos bagunçados de decks de terceiros são uma das maiores fricções do
Anki, a ponto de existir serviço pago só para gerenciar isso.

O que falta não é heurística melhor: é **a última palavra ser do usuário**. E o dado para isso já
viaja — `LeituraAnki.campos` (`server/import/anki.ts:47`) já chega ao cliente com os nomes dos
campos, e a tela já os mostra (`BaralhoAnki.tsx:258-263`). Só não dá para mudar.

Além disso, o mesmo tipo de nota reaparece em baralho após baralho (Kaishi, Core, subs2srs,
Migaku têm estruturas fixas e conhecidas): corrigir uma vez deveria bastar para sempre.

## What Changes

- **ADICIONA** o Mapeador: tela onde o usuário vê os campos reais do baralho ao lado do que o app
  entendeu, e troca qualquer papel (palavra, significado, frase, leitura, áudio, imagem).
- **ADICIONA** perfis de mapeamento reutilizáveis, chaveados pelo **hash da estrutura** do tipo de
  nota (nomes normalizados + ordem): reconhecer um tipo já visto aplica o mapeamento salvo sozinho.
- **ADICIONA** priors pré-cadastrados dos tipos de nota populares levantados no G0 (`Word`/
  `Expression`/`Vocabulary-Kanji`/`SentKanji`…), com a desambiguação de `Expression` — que é palavra
  em baralho de vocabulário e frase em baralho de mineração.
- **MODIFICA** `BaralhoAnki.tsx`: a prévia deixa de ser só informativa e ganha "não é isso? trocar".
- **MODIFICA** o parser para expor o que a decisão precisa: nome do tipo de nota, nome do baralho,
  hash da estrutura, e a confiança de cada palpite.
- **NÃO MUDA**: a ordem de detecção do arquivo (`anki21b→anki21→anki2`), nem o comportamento para
  baralhos de dois campos sem nome — o caso mais comum, que já funciona.

## Impact

- `server/import/anki.ts`: expõe `notetype`, `baralho`, `estruturaHash`, confiança por campo.
- `server/db/`: tabela `anki_perfis_de_mapeamento` (aditiva).
- `src/components/views/BaralhoAnki.tsx` + componente novo do Mapeador.
- Reprocessamento sem reimportar depende de `campos_brutos`, do change `motor-anki-acervo`.
