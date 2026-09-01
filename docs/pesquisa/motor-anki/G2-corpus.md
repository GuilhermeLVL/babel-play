# G2 — Protótipo de ingestão e corpus medido

> Gate G2. Instrumento: `scripts/corpus-anki/medir.ts` (roda com `npx tsx`, independente do
> servidor). Baralhos ficam **fora do repositório** — tamanho e licença; só as métricas entram
> (`corpus.json`). Números medidos, não estimados.

## O que o parser passou a fazer (e a prova em baralho real)

| Incremento | Antes | Depois |
|---|---|---|
| Referências de mídia | `[sound:]` e `<img>` **apagados** do texto; a referência não sobrava nem como ponteiro | extraídas do campo bruto antes da limpeza, agregadas por nota |
| Cloze | `{{c1::...}}` vazava cru para a tela | resolvido em texto legível + lacunas com ordinal e dica |
| Baralho e tipo de nota | desconhecidos | nome do baralho (hierarquia `::` normalizada) e do note type |
| Estrutura | — | hash dos nomes de campo normalizados + ordem, para reconhecer tipos já vistos |
| Volume | `SELECT ... FROM notes` **sem LIMIT** | teto de 50.000 notas por leitura, com `truncado`/`totalNoArquivo` |
| Mapa de mídia | nunca aberto (só um booleano) | JSON legado **e** protobuf `MediaEntries`; mídia zstd por arquivo |

Verificação no baralho real do AnkiWeb (`4000 Essential English Words`, 214 MB):

```
formato: collection.anki21 | notas: 3600 | descartadas: 271
baralhos: 4000 Essential English Words::1.Book … ::6.Book
notas com refs de mídia: 3600   exemplo: {"sons":["01_0001.mp3","01_0001_meaning.mp3",
                                          "01_0001_example.mp3"],"imagens":["01_0001.jpg"]}
notetype: 4000 EEW | estruturas distintas: 1 | cloze cru vazando: 0 | 508 ms
```

As 3.600 notas com mídia são exatamente o que era descartado em silêncio: três áudios e uma imagem
por nota, ou seja, **14.400 arquivos** que o importador não sabia que existiam.

## A régua de qualidade, medida

O achado que mais muda o produto. `pistaUtil` recusa pista com mais de 42 caracteres ou 5 palavras
— régua calibrada para **fala capturada**. Distribuição real do verso no baralho medido:

| | mediana | p90 | p99 | máximo |
|---|---|---|---|---|
| caracteres | 57 | 76 | 96 | 125 |
| palavras | 11 | 15 | 18 | 24 |

82,8% estouram o limite de caractere e 98,2% o de palavra. Daí o perfil por origem
(`captura` 42/5 · `curado` 160/30, que cobre 100% do baralho com folga e ainda barra parágrafo):

```
captura   aprovadas   61 / 3600  (1,7%)   descartes: pista-ruim=3529 gramatical=10
curado    aprovadas 3590 / 3600  (99,7%)  descartes: gramatical=10
```

Os 10 descartes restantes são palavras gramaticais — devem cair mesmo.

## Corpus medido até aqui

```
arquivo                            notas  aprov.      %  captura  jogos      ms    +MB
4000_Essential_English_Words_al…    3600    3590  99.7%       61    9/9     453    301
baralho-antigo.apkg                    4       4   100%        4    9/9       5      0
baralho-moderno.apkg                   4       4   100%        4    9/9       4      0
simples.txt                            2       2   100%        2    0/9       1      0
ERROS:
  corrompido-truncado.apkg: Corrupted zip: can't find end of central directory
```

Leitura das colunas: `aprov.`/`%` usam o perfil **curado** (a régua certa para baralho);
`captura` mostra o mesmo baralho sob a régua de fala — a distância entre os dois diz se o baralho é
de tradução curta ou de definição longa. `+MB` é o **delta** de RSS sobre a linha de base, não o
absoluto do processo (medir absoluto faria um baralho de 823 bytes parecer custar 365 MB).

Achados desta rodada:

1. **Falha graciosa confirmada**: o arquivo corrompido (truncado de propósito) falha isolado, com
   mensagem clara, e não derruba o lote — que era o requisito.
2. **Custo de memória do baralho grande**: +301 MB para 214 MB de arquivo. Fica **abaixo** do teto
   de expansão de 300 MB por entrada só porque a coleção interna é pequena (630 KB); o que pesa é o
   zip inteiro em memória. É o número que justifica a extração no cliente antes do upload.
3. **`.txt` não alimenta jogo nenhum** com 2 notas — correto: `minItems` é 4 no menor jogo. Não é
   defeito, é a matriz funcionando.

## O que falta para fechar o corpus de 10+ (honesto)

Só **um** baralho real foi medido; os outros exigem download manual. A lista de 15 candidatos
verificados (com URL, idioma, tamanho, licença e o critério que cada um cobre) está no relatório do
G0 §5, e o passo a passo em `scripts/corpus-anki/baixar.md`. Critérios ainda não cobertos por
medição: script não latino (japonês/chinês/russo/árabe), subs2srs com áudio+imagem, imagem-palavra,
cloze pesado, note type customizado, e um baralho de 20k+ notas.

O fluxo de download do AnkiWeb foi verificado e funciona **sem login**: a página é uma SPA, mas
`GET /svc/shared/item-info?sharedId=<id>` responde anonimamente com um protobuf que carrega o
token, e `GET /svc/shared/download-deck/<id>?t=<token>` entrega o `.apkg`. A recomendação é baixar
pelo navegador uma vez e guardar fora do repositório — automatizar contra endpoint não documentado
é frágil, e redistribuir os arquivos não nos é permitido (G0 §5).
