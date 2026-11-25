> **Aviso de 25/11/2026:** as referências a `server/import/anki.ts` e `BaralhoAnki.tsx:258-263` estão velhas; a leitura mora no navegador (`src/core/anki/mapeamento.ts`, `src/lib/anki/`). Ver a revisão no fim.

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

## Revisão de 25/11/2026

- **Estado: precisa decisão, e o escopo encolheu.** A arquitetura mudou em 20/10 (importação pesada no navegador; servidor recebe notas em lotes e reaplica a régua). Já está feito o que sustenta a ideia: nome do tipo de nota e do baralho, `estruturaHash` e `campos_brutos` gravados, detecção de mídia em qualquer campo, mapeamento por nome com prioridade, tetos e guid. Falta o que o usuário vê: confiança por palpite, priors em dado, o Mapeador, o perfil reaproveitável e remapear sem reimportar. A tarefa antiga 1.3 (confiança) estava marcada como feita por engano; não há confiança no código. A tabela `anki_perfis_de_mapeamento` não existe e talvez nem precise existir. Hoje o campo errado só é visível depois de importar, em "Como os campos foram lidos", sem como trocar.
- **O que ficou velho:** o parser em `server/import/anki.ts` e a rota `/api/anki/decks/:id/remapear` como ponto de partida; "BaralhoAnki.tsx:258-263"; a premissa de que o servidor decide o mapeamento. Tudo reescrito em `tasks.md` e `design.md`. As specs continuam válidas e ganharam dois requisitos (decisão no navegador antes do primeiro lote; o arquivo nunca vai ao servidor).
- **Esforço: M** (era G). Núcleo e priors são P; o Mapeador e separar "ler" de "enviar" são o miolo (M); remapear é P a M e é opcional na primeira entrega.
- **Valor para quem usa: médio.** Só quem traz baralhos de terceiros com campos fora do padrão (o 4000EW perdeu 3.871 de 3.871 notas). O caso comum de dois campos já funciona. Vale para a promessa de "traga o que você já usa", sem relação com plano ou custo.
- **Dependências:** `motor-anki-jogos` vem antes (alimenta os jogos com a nota; mesmo `ankiImports.ts` e `repositories/anki.ts`); `cartoes` 7.1 e 7.2 ("terminar o mapeador" e "ler sem gravar") dependem desta change; `modelo-do-aluno-e-dados` 6.4 (Anki enxuto) toca a mesma tabela. Arquivos de conflito: `src/core/anki/mapeamento.ts`, `src/lib/anki/lerApkg.ts` e o worker, `src/data/importarAnki.ts`, `BaralhoAnki.tsx`, `server/routes/ankiImports.ts`, `server/validation.ts`. Importação pesada permanece no navegador: o servidor não recebe `.apkg`.
- **Decisões do dono:**
  1. Vale fazer agora? (a) sim, versão enxuta: confiança, priors em JSON, Mapeador antes de enviar e perfil no aparelho, sem remapear (recomendado); (b) só confiança e aviso "não entendi os campos", sem tela de troca; (c) arquivar e reabrir quando aparecer o segundo baralho quebrado.
  2. Onde guardar o perfil de mapeamento? (a) só no aparelho, sem tabela nova e sem dado novo no servidor (recomendado: coerente com a importação no navegador e com retenção zero); (b) na conta, para seguir entre aparelhos (migração e exportação/exclusão de conta); (c) nenhum perfil, só priors.
  3. Remapear baralho já importado sem reimportar? (a) fica para depois, quem errou reimporta o arquivo (recomendado agora); (b) entra junto, usando `campos_brutos`; (c) nunca.
