# Auditoria — os minijogos com material importado do Anki

Pedido do dono (02/09): *"o exercício do jogo da memória e o exercício de termo são dois exercícios
que eu pude testar e percebi que a lógica deles está quebrada… aparece uma frase gigante, mas aí o
usuário só tem que escrever uma palavra"*.

Investigado sobre o acervo REAL (`data/babel.db`, baralho `4000 Essential English Words::1.Book`,
2.225 cartões ativos), não sobre hipótese. Foram encontrados **três defeitos encadeados**; os dois
primeiros estão corrigidos e verificados, o terceiro está descrito com a decisão pendente.

---

## O que o material realmente é

O baralho não é um par bilíngue. É um dicionário de aprendiz:

| campo | conteúdo real | o que o app supunha |
|---|---|---|
| frente (`word`) | `abandon` | palavra — **correto** |
| verso (`back`) | `To abandon something is to leave it forever or for a long time.` | tradução curta para o idioma do usuário — **falso** |
| idioma | gravado `src_lang='en'`, `tgt_lang='pt'` | o verso está em **inglês**, não em português |

Medições sobre os 2.225 cartões:

| medida | valor |
|---|---|
| verso com mais de 42 caracteres | 1.846 (83%) |
| comprimento médio do verso | 57 caracteres |
| **verso que contém a palavra-alvo** | **2.224 de 2.225 (100%)** |
| verso que começa pela palavra-alvo | 356 (16%) |

Este formato — frente = palavra, verso = definição no mesmo idioma — é o mais comum entre os
baralhos populares de vocabulário. Não é material ruim; é material que o produto não sabia ler.

---

## Defeito 1 — a pista entregava a resposta (CORRIGIDO)

**Sintoma**: no Termo, a dica de `abandon` era *"To abandon something is to leave it forever"* — a
resposta impressa acima do teclado. Na Memória, as duas cartas do par traziam a mesma palavra
escrita, então o par casava sozinho.

**Raiz**: `pistaUtil` (`src/core/learning/quality.ts`) mede **comprimento e ruído** — nunca
perguntou se a pista contém a resposta. Por construção não tinha como pegar. A única checagem
próxima, `traducao-igual`, reprova quando a tradução INTEIRA é igual à palavra; uma definição que
contém a palavra passa ilesa.

**Correção**: `src/core/learning/pistaDeJogo.ts` (novo) mascara a resposta e suas flexões em vez de
recusar o cartão — recusar jogaria fora o formato de baralho mais comum que existe, e a definição
é uma pista pedagogicamente ótima. O exercício vira definição-com-lacuna:

```
antes:  To abandon something is to leave it forever.   →  digite: abandon
depois: To ——— something is to leave it forever.       →  digite: abandon
```

Regras que importam:
- **Igualdade exata sempre mascara**, qualquer que seja o tamanho da palavra.
- **Flexão exige radical de 3+ letras** (`abandoning`, `abandoned`, `abilities`), senão `be`
  apagaria `bear`, `best`, `bed`. A assimetria foi encontrada por um teste do material real.
- **Palavra apenas parecida fica intacta**: `art` não apaga `article`.

**Aplicado em**: `promptFor` (`itemSource.ts` — Memória, Duelo, Caça-palavras) e
`buildTermoRounds` (`termo.ts` — dica e frase de contexto).

**Verificação**: `tests/pista-de-jogo.test.ts` (20 casos, com amostras literais do banco) e
varredura do acervo inteiro — **100% vazavam, 0% vazam, nenhum cartão perdido**. Confirmado
jogando no navegador: a dica do Termo saiu como *"To ——— is to ask for something you want very
badly"*; as cartas da Memória como *"——— is the study of the Earth…"*.

Commit `6b44ed6`.

## Defeito 2 — tudo nascia vencido (CORRIGIDO)

**Sintoma**: a tela anunciava *"2.225 palavras pedindo revisão"* logo depois de importar, e a
faceta "Nunca vistas" mostrava **zero**.

**Raiz**: `projetarDoAnki` (`server/db/repositories/vocab.ts`) gravava `dueAt = now`. Como
`dueAt <= agora` é a definição de "vencida", todo cartão nascia pedindo revisão no mesmo instante
em que entrava. Medido: 2.222 dos 2.225 com `reps = 0` (nunca respondidos) e ainda assim vencidos.
Efeito colateral no agendador: material novo e material esquecido empatados no mesmo timestamp, o
que apaga qualquer ordenação por urgência.

**Correção**: `dueAt = null` no import — a definição de "nunca vista" no app inteiro. `dueAt ASC`
põe NULL na frente, então material novo mantém prioridade na fila sem mentir sobre o que é.
Migração `0021_anki_nasce_sem_agenda.sql` alcança o que já estava gravado, com dupla condição
(`reps = 0` **e** `due_at = added_at`) para não tocar em quem já conquistou uma agenda. Reversível:
o valor descartado era, por construção, o próprio `added_at` (`down-0021.sql`).

**Verificação** no banco real: `nunca_vistas` 0 → 2.222; `pedindo_revisao` 2.222 → 3 (as três que
o dono de fato jogou). Na tela: banner "3 palavras pedindo revisão", pílula "Nunca vistas 2.222".

Commit `3ab614b`.

## Defeito 3 — o idioma do verso está rotulado errado (PENDENTE, precisa de decisão)

O deck foi gravado como `en → pt`, mas o verso está em **inglês**. O rótulo mente, e isso tem
consequências reais que ainda não foram tratadas:

- a tela promete "tradução" e entrega definição monolíngue;
- um jogo que quisesse usar o verso como texto no idioma do usuário (leitura, áudio de apoio) faria
  a coisa errada;
- a detecção de idioma da importação (`decidirIdiomaOrigem`) olha a ESCRITA (latina/kana/hangul),
  que não separa inglês de português.

**Teste disponível e barato**: um verso que contém a palavra da frente em >70% das notas é, por
definição, um baralho de definição monolíngue — a heurística é auto-referencial e independe de
idioma, ao contrário de listas de palavras funcionais. Esse sinal já é calculado por
`vazaResposta`.

**Encaminhamento proposto** (não implementado — muda o que a tela promete, e isso é decisão de
produto): marcar o deck como `tipoDeVerso: 'definicao'` na importação, parar de gravar um
`tgt_lang` que não corresponde ao conteúdo, e a tela dizer *"ensina por definição em inglês"* em
vez de prometer tradução. Nenhum jogo precisa mudar depois do defeito 1 estar corrigido.

---

## Por que os jogos de frase e de áudio não abrem com este baralho

Não é defeito: 3 dos 2.228 cartões têm frase de exemplo, e nenhum tem áudio. Os cinco jogos de
frase e áudio (Montar a frase, Palavras de ligação, Reconhecer a fala, Escrever o que ouviu,
Repetir em voz alta) pedem material que este baralho não tem. O que ESTAVA errado era a tela não
dizer isso — nove cartas cinzentas sem motivo. O redesenho (`docs/prototipos/praticar-v2.html`)
separa "prontos para jogar" de "precisam de outro material", com o motivo e o botão que resolve.

## Pendências registradas

| item | estado |
|---|---|
| Rotulagem do idioma do verso (defeito 3) | aguarda decisão de produto |
| `bulkAdd` também grava `dueAt = now` (fluxo de captura) | não tocado — outro fluxo, exige medição própria antes |
| Frases do baralho alimentarem os jogos de frase (F10) | na fila do motor Anki |
