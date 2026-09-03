# Trilha multi-idioma — o que ficou em pé

Medido entre 2026-09-02 e 2026-09-03, no worktree `multi-idioma`, servidor na porta 3101.

## O que a tela faz agora

O espanhol tem trilha. Escolher espanhol em `/jogar` oferece **Curso de palavras · 5.727**, com
seis faixas de 955, quatro jogos jogáveis e o painel de progresso funcionando — antes o idioma caía
em "só o seu conteúdo" e a aba nem aparecia.

O jogo da memória em espanhol monta pares reais (`loco/louco`, `cerrar/fechar`, `arriba/acima`,
`saludo/cumprimento`): palavra sem tradução é recusada pela triagem, não vira carta órfã.

## A honestidade do rótulo

A trilha do espanhol é ordenada por **frequência de uso**, não por CEFR. Como os dois usam os
mesmos seis degraus para ordenar, a distinção viaja com o dado (`escala`) e aparece em toda parte
que rotula:

| Onde | CEFR (inglês) | Frequência (espanhol) |
|---|---|---|
| Gaveta do seletor | "nível do curso" · A1…C2 | "faixa do curso" · 1…6 |
| Sala de escolha | "Nível da trilha" | "Faixa de frequência da trilha" |
| Painel da trilha | "704 palavras do A1" | "955 palavras da faixa 1" |
| Nome da etapa | `A1 · etapa 1` | `1 · etapa 1` |
| Rodapé | listas curadas | "não níveis do CEFR", com a cobertura medida |

O rodapé do painel mostra **41%**, que é a cobertura real de tradução daquela trilha — lido do
dado a cada render, não escrito à mão.

## F26 fechado

Três portas, não uma:

1. **A glosa é do par.** O índice diz para quais nativos existe glosa (`glosas: ["pt"]`). Fora
   deles a rodada joga e **não promove** — antes, quem estudasse inglês com nativo espanhol saía
   com cartões que afirmavam ser `es` e carregavam texto português.
2. **Faixa não vira CEFR.** `cefrLevel` só é gravado quando `escala === 'cefr'`; senão vai `null`
   com confiança 0. `nivelCefr` ganhou a procedência `frequencia`, que devolve `faixa` e mantém
   `level` nulo.
3. **Cartão sem pista não nasce.** Palavra sem glosa joga nos exercícios de escrita, mas não é
   promovida ao baralho.

`scripts/trilha/diagnostico.mjs` conta o dano legado sem reescrever nada. Neste banco: **0** — não
há cartão vindo da trilha (2.922 do Anki, 467 de sessão).

## Cobertura por idioma, na tela

`CoberturaDosIdiomas` fica recolhida ao lado de "outro idioma", na gaveta e na Sala. Diz, por
idioma: que tipo de vocabulário existe, quantas palavras, se **este navegador** tem voz, e quanto é
do próprio usuário. A voz é medida na hora, porque depende do sistema de quem lê — hoje, só
português e inglês.

## Dois defeitos achados no caminho

- **O servidor não subia.** `import.meta.glob` tinha entrado num módulo que o Node alcança por
  `@core` → `cefrWordlist`; fora do Vite ele não existe e o processo morria no import, antes de
  qualquer rota. O índice foi separado em `src/data/trilha/indice.ts` (sem Vite) e o núcleo voltou
  a receber os níveis por injeção (`registrarNiveis`). Era a causa das duas falhas de
  `integration/cluster`.
- **Trilha atravessando idioma.** Sair do inglês com a fonte trilha marcada deixava a tela
  anunciando "Curso de palavras · japonês · 0 palavras", sem jogo e sem motivo. A Sala já caía para
  as gravações; a gaveta e o recorte por baralho, não. E "Jogar só com este" num baralho de outro
  idioma ligava um recorte que a gaveta — que lista por idioma — não mostrava para desligar: agora
  o idioma do baralho vem junto.

## Quatro idiomas (segunda rodada)

| Idioma | Escala | Palavras | Com frase | Com glosa |
|---|---|---|---:|---:|---:|
| inglês | CEFR | 2.784 | 92% | embutida |
| alemão | frequência | 5.758 | 93% | 49% |
| francês | frequência | 5.752 | 93% | 58% |
| espanhol | frequência | 5.727 | 90% | 37% |

### A qualidade da glosa, medida

Amostra determinística de 60 (10 por faixa, espaçadas na lista), revisada **por modelo, não por
falante nativo humano** — a revisão humana continua pendente e está registrada como tal.

- **Antes das correções: 70%.** Erros como `negocio=loja`, `planear=planar`, `infiel=mouro`.
- **Depois: 90%** (54/60), com a cobertura caindo de 41% para 37%: a precisão subiu mais do que a
  cobertura desceu, e é a precisão que decide se a carta do jogo ensina ou confunde.

Três correções, nesta ordem de impacto:

1. **Palavra transparente não gera glosa.** Se o dicionário traduz `temor` por `temor`, as outras
   candidatas daquela entrada são acepções laterais — era daí que saíam `temor=insegurança` e
   `infiel=mouro`. Melhor buraco declarado que pista errada, e quem lê português já lê `temor`.
2. **O cognato desempata.** A tabela de traduções casa palavra com palavra sem sentido nem classe,
   e a primeira costuma ser lateral. Entre línguas irmãs a forma parecida é quase sempre a acepção
   central: `negocio` voltou a ser `negócio`. Só desempata entre candidatas que o dicionário já
   ofereceu — não inventa tradução por semelhança.
3. **Fora a metalinguagem e a sujeira de verbete.** `alta = "feminino de alto"`, `África:`,
   `cebola¹` — nota de dicionário não é pista, e o `¹` apareceria na carta.

**O cognato tem um custo, e ele apareceu na amostra**: `embarazo=embaraço` é falso amigo (é
*gravidez*). O desempate acerta na média entre es-pt e erra exatamente onde as duas línguas
divergiram — mais um motivo para a revisão humana.

## Frases: os jogos de frase abriram

As trilhas novas trazem exemplo do Tatoeba em ~90% das palavras **e a tradução dele em português**,
que é o que `fraseJogavel` exige — sem ela quem monta a frase não sabe qual frase montar.

| Par | Frases com tradução |
|---|---:|
| es-pt | 3.696 de 5.163 (72%) |
| fr-pt | 2.721 de 5.340 (51%) |
| de-pt | 2.373 de 5.370 (44%) |

Duas decisões fizeram esse número:

1. **O id da frase viaja pelo pipeline.** O Tatoeba liga frases por id, não por texto; `lerFrases`
   passou a devolver `{ id, frase }` e o índice a carregá-lo. Sem o id não há como achar o par.
2. **Ter tradução virou o critério mais pesado da escolha da frase.** Antes o pipeline escolhia a
   melhor frase pelo vocabulário e só então descobria se havia tradução: 20%. Uma frase traduzida
   com duas palavras difíceis vale mais que a frase perfeita que ninguém pode jogar — 72%.

O par vem do export `<iso3>-por_links.tsv` do Tatoeba (77 mil linhas para es-pt), não do `links.csv`
global de dezenas de milhões: mesma informação, três ordens de grandeza mais barata.

Verificado na tela, em espanhol: "Montar a frase — 99 disponíveis", com a pista *"Este ano,
esperamos uma boa colheita"* e as palavras `año cosecha buena Este una esperamos` para ordenar.

## Limites declarados

- **37% de cobertura de glosa** no espanhol, 58% no francês, 49% no alemão. Vem de Wikidata
  Lexemes (CC0) e do Wikcionário via Wiktextract (CC BY-SA), somando a via direta e a inversa. O
  número caiu de 41% para 37% de propósito, ao trocar cobertura por precisão (acima).
- **Nomes próprios** na lista de frequência (`harry`, `curtis`, `Tokio`) — vêm de legendas, e não
  há sinal barato que os separe de `Jesús` sem lista curada.
- **Glosa de classe ou acepção errada** (`qué=qual`, `interrogar=perguntar`, `período=era`): a via
  inversa casa palavra com palavra sem classe gramatical, e nesses casos o dicionário só ofereceu a
  lateral. Material para a revisão por nativo (tarefa 5.3).
- **Os jogos de escuta seguem fechados nos idiomas novos** — não por falta de dado, mas porque este
  navegador não tem voz em espanhol, francês nem alemão. A tabela de cobertura diz isso por idioma.
- **`en.json` continua em v1.** O carregador aceita as duas versões; migrar o inglês agora seria
  risco sem ganho.

## Verificação

- `npx tsc --noEmit` limpo.
- `vitest`: **2.715 passando, 0 falhando**.
- `playwright` (BASE_URL=3101): **8 passando, 0 falhando**.
- `node scripts/trilha/verificar.mjs`: índice e derivados batem com a origem, nos quatro idiomas.
- ESLint nos arquivos tocados: zero. (Os 44 avisos do repositório são anteriores e em telas que
  este trabalho não encostou.)

Dois testes e2e eram frágeis por motivo alheio ao que provam, e foram ancorados: um presumia que o
idioma vigente tinha trilha (o app é de usuário único, e o idioma é preferência de perfil gravada
no servidor — a sessão anterior decidia onde ele começava); o outro comparava um regex contra a
tela inteira, e casava o nome do baralho na lista da gaveta aberta.

## Peso: medido, não estimado

Build de produção com os quatro idiomas (`npm run build`, 2026-09-03).

**O que baixa ao abrir o site: 739 kB bruto** — `index` 376 + `vendor-react` 190 + CSS 173. **Nenhum
dado de idioma entra aí**, com uma exceção medida: `niveis/en.json` (24 kB), importado
estaticamente por `cefrWordlist` porque é o caminho quente. Verificado procurando as marcas de cada
arquivo dentro do chunk de entrada: trilha `en`, trilha `es`, `niveis/es` e glosas `es-pt` estão
todas fora.

**Cada idioma é um chunk separado, sob demanda:**

| Chunk | bruto | gzip |
|---|---:|---:|
| trilha es | 271 kB | 103 kB |
| glosas es-pt | 329 kB | 130 kB |
| níveis es | 44 kB | 21 kB |

Um usuário baixa **só o do idioma dele, uma vez**: ~239 kB gzip. Medido na tela: a trilha do
francês carregou em **122 ms**, e nenhum outro idioma foi buscado.

**Banco de dados: zero impacto.** A trilha é arquivo estático servido ao navegador; nada dela é
gravado. Só entram no banco os cartões que a pessoa **erra** e que são promovidos — e desde o F26
isso só acontece quando existe glosa do par dela.

**Os 29 MB do `dist/` não são da trilha**: 22,5 MB são o WASM do ONNX Runtime (Whisper e tradução
local) mais 1,5 MB dos workers. Os quatro idiomas somam 2,1 MB — 7% do total.

### O que escala mal, e onde está o limite

O custo por idioma é ~628 kB bruto. O problema não é o número de idiomas praticados; é que a glosa
é de um PAR:

| | repositório e deploy |
|---|---:|
| 28 idiomas × 1 nativo (pt) | ~17 MB |
| 28 idiomas × 3 nativos | ~40 MB |
| 28 idiomas × 5 nativos | ~57 MB |

O que o usuário baixa não muda (239 kB, só o par dele), e o banco continua fora disso. O que cresce
é o repositório, o tempo de build e o deploy. **Antes de passar de ~8 idiomas, os dados devem sair
do bundle para `public/`, servidos por `fetch` e cacheados pelo CDN** — o carregador já isola isso
num lugar só (`carregarTrilha`), então a troca é local.

## Quem não fala português

Levantamento de 2026-09-03. **A interface é 100% pt-BR e não há infraestrutura de i18n** — nenhum
`t()`, nenhum arquivo de tradução; as strings são literais no JSX, e até os nomes dos idiomas no
seletor são forçados para português (`Intl.DisplayNames(['pt-BR'])`), de modo que um alemão lê
"Alemão", não "Deutsch".

O que **já** é multi-idioma: a captura e a tradução de cartões (o destino é derivado de
`mine`/`studying`, não fixo), a régua de qualidade e o gate dos jogos (indexados pelo idioma
estudado, e declaram quando não há lista para ele).

O que **não** é:

- O onboarding pergunta o que a pessoa estuda, **não qual é o idioma dela** — fica `pt-BR` por
  default, e o ajuste "Meu idioma" está numa tela em português.
- As glosas só existem para nativo `pt`. Um alemão estudando espanhol tem a trilha, e ela é muda.
- As stopwords de `keywords.ts` misturam inglês e português numa lista só (defeito anterior,
  já criticado no próprio código).

**Um defeito silencioso foi corrigido agora**: a trilha v1 do inglês traz a glosa portuguesa
embutida, e ela era servida a qualquer nativo. Um alemão via `about → cerca de` — uma terceira
língua apresentada como resposta. Agora o carregador só entrega a tradução embutida quando o
índice diz que o par vale (`semGlosaDeOutroPar`), e o painel **diz o que está acontecendo**:

> Esta trilha ainda não tem tradução para alemão — só para português. Você pode praticar a escrita
> das palavras, mas os jogos de par ficam de fora e nada entra na sua revisão.

Antes, o gate de promoção do F26 recusava em silêncio: a pessoa errava palavras e nada era salvo,
sem explicação. Verificado na tela trocando "Meu idioma" para alemão.
