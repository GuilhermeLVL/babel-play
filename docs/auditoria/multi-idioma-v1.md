# Auditoria — a experiência multi-idioma na prática (G0)

Sete baralhos importados e jogados de verdade em 02/09/2026, sem atalho de desenvolvedor. Corpus
gerado por `scripts/corpus-anki/gerar.mjs` (baralho real tem licença própria e não entra no repo):
es, fr, de (latinos), **ja** (kana+kanji), **ru** (cirílico), **ar** (árabe, RTL), **th** (tailandês,
o idioma que o detector nem reconhece).

Tudo abaixo tem evidência: tempo medido, consulta ao banco ou captura de tela.

---

## Resumo

O app oferece **28 idiomas** e entrega experiência completa em **um**. Não por falta de conteúdo do
usuário — por quatro defeitos que se encadeiam e transformam um baralho legítimo em tela vazia.

| # | Defeito | Classe |
|---|---|---|
| 1 | `palavra-curta` descarta kanji isolado — 70% de um baralho japonês | **bloqueante** |
| 2 | Importar não entrega nada jogável: toda nota nasce `arquivada` | **bloqueante** |
| 3 | Frase de gravação em inglês aparece na rodada de árabe | **bloqueante** |
| 4 | RTL não existe: `direction: ltr` em todo texto de exercício | **bloqueante** |
| 5 | Baralho sem idioma-alvo não diz que idioma é | atrito |
| 6 | A porta de desbloqueio sugere "Jogar em inglês" — abandonar o idioma | atrito |
| 7 | Quatro pontos quebram em silêncio fora do gate de alfabeto | atrito |
| 8 | Hindi e tailandês não são reconhecidos pelo detector de escrita | atrito |

---

## Jornada cronometrada

**Importação** (POST `/api/import/anki`, texto TSV):

| idioma | tempo | notas | descartadas | motivo |
|---|---:|---:|---:|---|
| ar | 637 ms | 10 | 0 | — |
| de | 307 ms | 10 | 0 | — |
| es | 380 ms | 12 | 2 | `traducao-igual` (cognatos: *comida*, *agua*) |
| fr | 298 ms | 10 | 0 | — |
| **ja** | 294 ms | 10 | **7** | **`palavra-curta`** |
| ru | 290 ms | 10 | 0 | — |
| th | 297 ms | 10 | 0 | — |

A importação é rápida. **O tempo não é o problema — o resultado é.**

**Do import até a primeira rodada jogável**: 6 cliques e ~15 s, e só porque eu sabia o caminho:
`Trocar` → `Gerenciar baralhos` → `Ativar mais N` (por baralho) → `Voltar` → `Trocar` → escolher o
idioma. Quem não sabe não chega: nada na tela de jogar indica que o baralho recém-importado existe.

---

## Defeito 1 — `palavra-curta` descarta a palavra japonesa

`src/core/learning/quality.ts:234` — `if (palavra.length < 2) return REPROVADO('palavra-curta')`.

A régua conta **caracteres**. Em escrita logográfica, um caractere é uma palavra inteira:

| descartado | significa |
|---|---|
| 窓 | janela |
| 家 | casa |
| 道 | caminho |
| 本 | livro |
| 町 | cidade |

Sete de dez notas. Sobraram 3 palavras — **abaixo do mínimo de 4** de qualquer jogo de palavra.
O encadeamento completo: régua descarta 70% → acervo fica com 3 → os quatro jogos de palavra
bloqueiam → o japonês é injogável, e nenhuma mensagem diz por quê.

**Correção**: o mínimo de comprimento depende da escrita. Han, kana e hangul: 1 caractere basta.

## Defeito 2 — importar não entrega nada jogável

Consulta ao banco depois dos sete imports:

```
NOTAS:    ar 10, de 10, es 12, fr 10, ja 10, ru 10, th 10  — todas estado='arquivada'
CARTÕES:  en 2228, pt 439                                   — nenhum dos sete idiomas
```

A importação grava `anki_notes` e para. A projeção para `vocab_cards` só acontece em "Ativar mais
N", numa tela que a pessoa precisa descobrir sozinha. Do ponto de vista de quem acabou de importar,
**o app não fez nada**.

## Defeito 3 — vazamento de idioma na rodada

Com **árabe** escolhido (`?fonte=baralho&idioma=ar`, resumo confirmando "10 palavras · árabe"), o
jogo *Montar a frase* abriu com:

> MONTE A FRASE QUE QUER DIZER ≈ **Para onde vou?** — `going? am Where I`

Frase inglesa, de uma gravação do usuário, numa rodada de árabe. As falas de gravação
(`frases`, estado da sessão) **não são filtradas por idioma** — só as frases do acervo passam pelo
filtro. Como as gravadas têm precedência, elas mascaram o idioma escolhido inteiro.

Responde a pergunta 4 do brief: **sim, o conteúdo vaza**, e pelo caminho das falas.

## Defeito 4 — RTL não existe

Medido nas cartas do jogo da memória com árabe:

```
texto "ليل"  → direction: ltr, textAlign: center, unicodeBidi: normal
<html dir>   → ausente
```

Zero ocorrências de `dir=`, `direction` ou `unicode-bidi` em todo o `src/`. Palavra árabe **isolada**
ainda aparece certa — o algoritmo bidi do Unicode resolve sozinho quando o texto é homogêneo. O que
quebra é texto misto: frase com pontuação, número ou palavra latina no meio, que é exatamente o
formato de toda frase de exemplo.

## Defeito 5 — o baralho não diz que idioma é

Os sete baralhos foram importados sem `x-tgt-lang` e gravaram `idioma_alvo = null`. A tela de
baralhos então mostra o **nome do arquivo** no lugar do par de idiomas
(`BaralhosAnki.tsx`, ramo `deck.idiomaOrigem && deck.idiomaAlvo`). Com vários baralhos importados,
não há como saber qual é qual sem abrir.

## Defeito 6 — a porta sugere abandonar o idioma

Com japonês escolhido, as cartas bloqueadas ofereciam **"Jogar em inglês"**. A saída proposta para
"seu baralho japonês não tem material suficiente" é trocar de idioma — quando a ação útil seria
ativar mais notas daquele baralho, ou dizer que a régua descartou 7 delas (defeito 1).

## Defeito 7 — quatro pontos fora do gate

O gate `requisitos: { alfabeto: 'latino' }` cobre só Termo e Caça-palavras. Estes quebram calados:

| Ponto | Regra | Efeito |
|---|---|---|
| `src/core/minigames/bingo.ts:42,50` | `normalizarPalavra` (A–Z) | Bingo vazio, sem declarar requisito |
| `src/core/minigames/escuta.ts:275` | `lista.has(normalizarPalavra(t))` | Conectores sem alvos |
| `src/components/views/Analysis.tsx:1397` | `[^a-zA-Z]` | Destrói acentuadas — **afeta português** |
| `src/components/TokensClicaveis.tsx:42` | `/^[a-z]+$/` | "ação" não é clicável. `vocabWord.ts:198` já corrigiu a tokenização; o consumidor ficou para trás |

## Defeito 8 — hindi e tailandês não são detectados

`server/import/anki.ts:875-891` reconhece kana, hangul, Han, cirílico, árabe, hebraico, grego e
latino. **Não há faixa Devanagari nem Thai** — caem em `desconhecido`. O baralho tailandês importou
porque eu mandei `x-src-lang: th` explicitamente; pela detecção automática, não teria idioma.

---

## As nove perguntas do brief

1. **Cliques/tempo até jogar?** 6 cliques, ~15 s, conhecendo o caminho. Ponto mais lento: descobrir
   que é preciso *ativar* (defeito 2).
2. **O idioma aparece nos seletores?** Só depois de ativar. Antes, o baralho existe e o idioma não.
3. **Dá para jogar num idioma só, sem tentativa e erro?** Sim, depois de ativado — a faceta de
   idioma lista com contagem (`inglês 2228 · japonês 3 · português 0`).
4. **Vaza conteúdo entre idiomas?** **Sim** — defeito 3, pelas falas de gravação.
5. **Scripts não latinos?** Renderizam. Comparação de resposta é o problema: Termo e Caça-palavras
   bloqueiam por gate (correto); bingo e conectores quebram calados (defeito 7).
6. **RTL?** Não existe (defeito 4).
7. **Sem voz?** Degrada com motivo `sem-voz` e o jogo diz. **Neste navegador só há voz para pt e
   en** — 26 dos 28 idiomas perdem os três jogos de áudio, salvo gravação real.
8. **Mensagens fora do inglês?** Fazem sentido; o rótulo do idioma vem de `langLabelPt`.
9. **Pontos de confusão** — abaixo.

## Cinco pontos de confusão para quem chega sem contexto

1. **"Importei e não aconteceu nada."** O baralho não aparece na tela de jogar até ser ativado, e
   nada diz isso.
2. **"Ativar mais 10" — ativar o quê, e por que não veio ativado?** O vocabulário do termo é do
   sistema, não de quem estuda.
3. **"3 de 10 ativadas, 7 descartadas"** sem dizer *o que* foi descartado nem *por quê* — e no
   japonês o motivo é um defeito nosso, não do baralho.
4. **Jogo bloqueado que sugere trocar de idioma** em vez de resolver o material.
5. **"0 de 10 notas ativadas" convive com "10 palavras" no resumo** depois de ativar: duas unidades
   (notas × cartões) que a tela não reconcilia.

---

## Encaminhamento (G1)

Ordem por risco crescente, todas com teste que reproduz antes do fix:

1. `TokensClicaveis.tsx:42` e `Analysis.tsx:1397` — `\p{L}`; reusar `tokenizarTexto`.
2. `bingo.ts` declara `requisitos: { alfabeto: 'latino' }`; conectores usam `chaveDeTexto`.
3. `quality.ts:234` — mínimo por escrita (1 caractere basta em Han/kana/hangul).
4. Filtrar as falas de gravação pelo idioma da rodada (defeito 3).
5. Devanagari e Thai no detector de escrita.
6. `dir` derivado do idioma nos containers de texto do exercício.
7. Fluxo de importação: ativar por padrão, ou dizer na tela de jogar que há baralho esperando.
