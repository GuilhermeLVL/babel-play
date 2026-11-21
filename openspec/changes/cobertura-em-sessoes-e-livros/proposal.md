## Why

A cobertura (o percentual de palavras do conteúdo que a pessoa já conhece; Paul Nation: 95-98% é um bom desafio, 98% ou mais é
tranquilo, abaixo de 95% é puxado) só aparece na Leitura ativa. LingQ e Migaku mostram isso em todo conteúdo. A pessoa que
importa uma legenda, grava uma sessão ou abre um livro não sabe se aquilo está no tamanho dela.

## What Changes

- **Sessão** (`Analysis`): uma linha no topo, "Você já sabe N% desta sessão", com o nível por extenso (Leitura tranquila, Bom
  desafio, Puxado) e "cerca de N palavras novas". Conta o texto ORIGINAL das falas no idioma da fala, nunca a tradução.
- **Livro** (leitor): a mesma linha para o capítulo em exibição ("deste capítulo"), com os parágrafos que o motor já tem no aparelho.
- **Qualquer idioma com espaço entre palavras.** Lematização só onde `candidatosDeLema` tem regra (en, pt, es, fr, it, de); nos
  outros, a chave exata. A elisão (`l'homme`, `d'água`) sai antes da conta.
- **Sem número onde ele seria errado:** idiomas sem espaço (ja, zh, th, lo, km, my), conteúdo com menos de 30 palavras, conta
  nova (menos de `SESSOES_MINIMAS_PARA_NOVA` sessões no idioma) e sem conta. Nesses casos não aparece nada.
- **Fora do caminho crítico:** a conta roda em tempo ocioso (`requestIdleCallback`), com teto de 60 mil caracteres (amostra
  espalhada pelo conteúdo; com amostra, "cerca de N palavras novas" não aparece). Nada sai do aparelho.
- Reaproveita `coberturaDoTexto`, `rotuloDaCobertura` e o índice de etiquetas; `useConhecimento` e `indiceDeEtiquetas` ficam
  intactos (o PR das marcadas "Já sei" troca uma linha em `useConhecimentoDoIdioma` e a cobertura nova herda as marcadas).

## Fora desta change

- Lista da Biblioteca: o texto das sessões não vem na lista (só `wordCount`); mostrar cobertura por item exigiria uma
  requisição por sessão. Fica como pendência (precisaria de um campo de cobertura ou amostra no resumo da lista).
- Catálogo e estante de livros: a ficha (`public/catalogo/fichas/`) é editorial em português, sem amostra do texto do livro; baixar
  o livro inteiro para a conta está fora de cogitação. Pendência: uma lista de frequência por livro gerada no build.
- Japonês, chinês e tailandês: exigem segmentador de dicionário com lemas; sem isso, nenhum número.

## Capabilities

### Modified Capabilities

- `leitura-ativa-acervo`: a cobertura passa a valer também para sessões e capítulos de livros.

## Impact

`src/core/leitura/coberturaDoConteudo.ts`, `src/hooks/useCoberturaDoConteudo.ts`, `src/lib/etiquetas/conhecimentoDoIdioma.ts`,
`src/components/CoberturaDoConteudo.tsx`, `Analysis.tsx`, `LeitorDoLivro.tsx`, catálogos de i18n.
