# Trilha de vocabulário — origem e licença dos dados

O arquivo `en.json` deste diretório **não é conteúdo original do Babel Play**. Ele é a conversão de
listas públicas: duas de vocabulário graduado por nível do Quadro Comum Europeu (CEFR), que dão as
**palavras** e os **níveis**, e duas de dados lexicais abertos, que dão as **traduções**. As
licenças de todas exigem atribuição. Este arquivo existe para cumprir essa exigência e para que
quem mexer aqui depois saiba de onde o dado veio.

## O que está embutido

`en.json` — 3.997 pares `[palavra, tradução]` em inglês → português, distribuídos por nível.

Até a versão anterior o arquivo guardava 8.252 palavras **secas** (só a palavra, sem tradução).
Agora cada entrada carrega a tradução junto. A tabela abaixo é a cobertura **medida**, não estimada:

| nível | palavras antes | com tradução | % |
|---|---|---|---|
| A1 | 923 | 827 | 90% |
| A2 | 1.170 | 807 | 69% |
| B1 | 2.065 | 1.114 | 54% |
| B2 | 2.364 | 925 | 39% |
| C1 | 897 | 214 | 24% |
| C2 | 833 | 110 | 13% |
| **total** | **8.252** | **3.997** | **48%** |

**Palavra sem tradução conferida saiu da trilha.** Foi escolha explícita do dono do projeto: uma
trilha menor em que toda palavra tem tradução real vale mais que uma completa com metade
inventada. A consequência honesta está na tabela — **a cobertura cai muito nos níveis altos**, e
C1/C2 ficam com pouco mais de cem palavras cada. É jogável (o mínimo de qualquer jogo é 4 itens),
mas está longe de um currículo completo nesses níveis.

## Por que a tradução passou a vir embutida

A lista sem tradução obrigava o app a traduzir palavra por palavra **pela rede, na hora de usar**.
Medido no app real: 116 cliques para completar o A1, 8 traduções em série por clique, sem barra de
progresso e sem como cancelar, com falhas silenciosas quando a chamada não voltava. E o que voltava
nem sempre prestava — no banco real havia `cook` → "cozinheiro de bordo", `describe` → "desenhar",
`kick` → "ressalto".

Com a tradução embutida a trilha joga direto, sem rede, e passa a funcionar no perfil
**Privado/Local**, que não pode fazer chamada externa.

## A validação de IDA E VOLTA (versão `trad.2`)

A primeira versão com tradução pegava a **primeira glosa disponível** de cada fonte. Jogando, o
dono do projeto viu a pista "andar" valendo `story`, "teatral" valendo `camp` e, no Termo, "morto"
valendo `body`. Não eram traduções erradas — eram **sentidos raros escolhidos como principais**:
`story` é andar de prédio, `camp` é teatral/afetado, `body` é cadáver. A ordem de sentidos das
fontes não é ordem de frequência, e a primeira glosa não é a mais comum.

Medido no arquivo daquela versão: **490 traduções serviam a mais de uma palavra inglesa, afetando
1.116 de 3.997 pares (28%)**. A pista "conta" valia para sete palavras (`check`, `account`, `bill`,
`calculation`, `responsibility`, `responsible`, `invoice`) — o enigma era insolúvel por construção.

### A regra nova

Um par `EN→PT` só entra se **o caminho de volta confirmar**: a entrada portuguesa da glosa tem de
listar a palavra inglesa entre as traduções dela. `body→morto` reprova (o "morto" português volta
como `dead`); `body→corpo` aprova (o "corpo" volta como `body`). É a técnica de recuperação
bidirecional usada na literatura de indução de léxico bilíngue, pelo mesmo motivo: recuperar só
num sentido produz falso positivo.

O índice de volta saiu do mesmo dump já usado — o extrato do Wikcionário português tem 399.087
entradas portuguesas, das quais **20.539 trazem tradução para o inglês**.

### Uma premissa que caiu na medição

A versão anterior tratava o **Wikidata Lexemes como confiável por construção** (lema↔lema,
simétrico) e o isentava de conferência. Errado: `story→andar` e `body→morto` **vinham justamente do
Wikidata**. Sentidos ligados ao mesmo item podem ser raros. Agora o Wikidata é só mais uma fonte de
candidatas e passa pela mesma régua — dos 1.466 pares dele, **1.025 sobreviveram**.

### Colisão NÃO é resolvida por substituição

Tentou-se dar a glosa disputada à palavra de nível mais baixo e a candidata seguinte às outras. O
resultado foi pior: `bill` recebeu **"bico"** (bico de ave) e `account` foi eliminado — o remédio
inventava sentido raro, que é exatamente a doença. Então a colisão fica: `account → conta` e
`bill → conta` são ambos corretos, e o **construtor de rodadas** garante que duas pistas iguais
nunca caem na mesma partida (`buildItems` e `buildTermoRounds`, em `src/core/minigames/`).

Resultado: colisão de **28% para 13%** — e as 352 que sobraram são sinonímia legítima, não sentido
errado.

## Cobertura da versão `trad.2`, medida

| nível | palavras da lista | com tradução validada | % |
|-------|-------------------|-----------------------|---|
| A1 | 923 | **704** | 76% |
| A2 | 1.170 | 580 | 50% |
| B1 | 2.065 | 757 | 37% |
| B2 | 2.364 | 565 | 24% |
| C1 | 897 | 114 | 13% |
| C2 | 833 | 64 | 8% |
| **total** | **8.252** | **2.784** | **34%** |

Caiu de 3.997 para 2.784 — o preço de exigir confirmação nos dois sentidos. O arquivo foi de 88 KB
para 60 KB. **C1 e C2 ficaram magros** (114 e 64 palavras): jogável, longe de currículo.

### Qualidade, amostrada

Conferidas 30 palavras do A1 espaçadas pela lista: **28 corretas e naturais** (`about → cerca de`,
`beautiful → bonito`, `cheese → queijo`, `truck → caminhão`, `sheep → ovelha`). Duas discutíveis:
`flat → chato` (seria melhor "plano") e `miss → senhorita` (correto para o título, mas o verbo é
mais comum). Uma herdada da fonte: `story → estória`, variante datada de "história" — passa na ida
e volta porque o Wikcionário a registra.

## Fontes — palavras e níveis

**CEFR-J Vocabulary Profile 1.5** (níveis A1–B2)
Tono Laboratory, Tokyo University of Foreign Studies.
Publicado em <https://github.com/openlanguageprofiles/olp-en-cefrj>.
Licença: uso para fins de pesquisa **e comerciais** liberado sem custo, **com a devida citação**.

**Octanove Vocabulary Profile C1/C2 1.0** (níveis C1–C2)
Octanove Labs.
Publicado no mesmo repositório.
Licença: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).

## Fontes — traduções

**Wikidata Lexemes** — licença **CC0** (domínio público).
Consultado pelo endpoint SPARQL <https://query.wikidata.org/sparql>, unindo lexemas ingleses e
portugueses que compartilham o mesmo item de sentido (propriedade `P5137`). Rendeu 3.592 pares,
dos quais 1.466 úteis para a trilha. Usado com **prioridade** porque devolve lemas
(palavra ↔ palavra), e não definições — que é exatamente o formato de que a pista precisa.

**Wikcionário em português**, extraído por **Wiktextract**.
Publicado em <https://kaikki.org/dictionary/downloads/pt/pt-extract.jsonl.gz> (34 MB comprimido).
Licença: **CC BY-SA** — a mesma do Octanove, que já estava embutido, então não acrescenta
obrigação nova. Usado para preencher o que o Wikidata não cobria.
Atribuição de citação acadêmica do Wiktextract: Tatu Ylonen, "Wiktextract: Wiktionary as
Machine-Readable Structured Data", LREC 2022, pp. 1317–1325.

## O que a conversão fez

Regras aplicadas na geração das **palavras e níveis**, todas conservadoras (na dúvida, descarta):

- **Fora as classes gramaticais de estrutura** — determinante, pronome, preposição, conjunção,
  verbo auxiliar/modal, artigo, interjeição, partícula, numeral. São palavras funcionais: não
  viram cartão de vocabulário e a régua de qualidade as reprovaria depois, mais caro.
- **Só palavra simples**, de 3 a 14 letras, com letras (hífen e apóstrofo internos permitidos).
  Ficaram de fora abreviações com ponto (`a.m.`), números e locuções de várias palavras.
- **Variantes colapsadas**: entradas como `a.m./A.M./am/AM` ficaram com a primeira forma.
- **Palavra em mais de um nível fica no MAIS BAIXO.** Uma palavra com vários sentidos aparece
  várias vezes nas listas; o nível que interessa é aquele em que ela é ensinada primeiro.

Regras aplicadas na geração das **traduções**:

- **Prioridade Wikidata (lema) → Wikcionário pt (primeira glosa).**
- **A glosa é limpa**: remove parênteses e corta no primeiro `;` ou `,` — a pista é uma palavra,
  não um verbete.
- **Só entra pista de até 3 palavras, só letras.** É a régua de qualidade do app
  (`src/core/learning/quality.ts`), que reprova pista longa ou com dígito. Filtrar aqui é mais
  barato que descobrir na hora de jogar.
- **Nunca entra tradução igual à palavra** (normalizada sem acento e sem caixa) — é o motivo
  `traducao-igual` da mesma régua.

## Qualidade — o que foi realmente conferido

Amostra medida: 30 palavras do A1, espaçadas ao longo da lista. Cerca de **27 corretas e
naturais** (`beautiful → bonito`, `sky → céu`, `tree → árvore`, `chair → cadeira`). Três
imperfeitas:

- `fishing → pesqueiro` (deveria ser "pesca")
- `piece → elemento` (deveria ser "peça")
- `about → praticamente` (um sentido secundário)

Não é perfeito e não vale arredondar para perfeito. A lista é **editável**: são dados versionados,
não código — corrigir um par é editar `en.json`.

## Por que embutido, e não buscado da internet

Três motivos, na ordem em que pesam: o app tem um perfil **Privado/Local** que não pode fazer
chamada externa; uma lista baixada em tempo de execução torna a trilha não determinística e
quebra quando a fonte muda de formato ou sai do ar; e 88 KB versionados custam menos que
qualquer uma dessas falhas.

## Regenerar

O script de conversão não é código de produção e não é versionado — o que se versiona é a
**saída**. Para refazer:

1. Baixe os dois CSVs do repositório CEFR-J/Octanove e aplique as regras de palavras e níveis.
2. Traduza: consulte o SPARQL do Wikidata pelos pares en↔pt ligados por `P5137` e, para o que
   sobrar, baixe o `pt-extract.jsonl.gz` do kaikki.org e pegue a primeira glosa. Aplique nessa
   ordem as regras de limpeza e os filtros de qualidade acima.
3. Descarte a palavra que ficou sem tradução.
4. Escreva no formato `{ lang, fonte, versao, niveis: { A1: [[palavra, traducao], ...], ... } }`.
