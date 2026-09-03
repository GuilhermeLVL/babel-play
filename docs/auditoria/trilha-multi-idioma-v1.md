# Trilha multi-idioma — o que ficou em pé

Medido em 2026-09-02, no worktree `multi-idioma`, servidor na porta 3101.

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

## Frases: metade do caminho

As trilhas novas trazem exemplo do Tatoeba em ~90% das palavras, e isso está no dado e no índice.
**Não destrava os jogos de frase ainda**, e a tela diz a verdade ao continuar bloqueando: "Montar a
frase" exige a TRADUÇÃO da frase (`fraseJogavel`), sem a qual quem joga não sabe qual frase montar.
A tradução vem do `links.csv` do Tatoeba, que cruza os ids das sentenças — é o próximo passo, bem
definido e independente.

Tentei soltar essa exigência e reverti: sem a tradução o jogo perde a referência, e a mudança
trocaria um bloqueio honesto por um exercício ambíguo.

## Limites declarados

- **41% de cobertura de tradução** no espanhol (59% na faixa 1). Vem de Wikidata Lexemes (CC0) e
  do Wikcionário via Wiktextract (CC BY-SA), somando a via direta e a inversa. Os 59% da faixa 1
  são o que sustenta os jogos de par no começo da trilha.
- **Nomes próprios** na lista de frequência (`harry`, `curtis`, `Tokio`) — vêm de legendas, e não
  há sinal barato que os separe de `Jesús` sem lista curada.
- **Glosa de classe errada** (`ver=visão`, `isla=quarteirão`): a via inversa casa palavra com
  palavra sem classe gramatical. Material para a revisão por nativo (tarefa 5.3).
- **`en.json` continua em v1.** O carregador aceita as duas versões; migrar o inglês agora seria
  risco sem ganho.

## Verificação

- `npx tsc --noEmit` limpo.
- `vitest`: **2.707 passando, 0 falhando**.
- `playwright` (BASE_URL=3101): **8 passando, 0 falhando**.
- `node scripts/trilha/verificar.mjs`: índice e derivados batem com a origem, nos dois idiomas.
- ESLint nos arquivos tocados: zero. (Os 44 avisos do repositório são anteriores e em telas que
  este trabalho não encostou.)

Dois testes e2e eram frágeis por motivo alheio ao que provam, e foram ancorados: um presumia que o
idioma vigente tinha trilha (o app é de usuário único, e o idioma é preferência de perfil gravada
no servidor — a sessão anterior decidia onde ele começava); o outro comparava um regex contra a
tela inteira, e casava o nome do baralho na lista da gaveta aberta.
