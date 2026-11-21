## 1. Núcleo

- [x] 1.1 `coberturaDoConteudo`: trechos, idioma qualquer, sem número em idioma sem espaço ou com menos de 30 palavras, elisão, amostra
- [x] 1.2 `textosNoIdioma`: só as falas no idioma do conteúdo
- [x] 1.3 Testes em `tests/cobertura-em-sessoes-e-livros.test.tsx` (pt, fr, ja/zh/th, curto, amostra, ru sem lematizador)

## 2. Hooks e componente

- [x] 2.1 `useConhecimentoDoIdioma` (par de `useConhecimento` para qualquer idioma, mesmo índice de etiquetas)
- [x] 2.2 `useCoberturaDoConteudo`: tempo ocioso, portão de honestidade (conta e sessões)
- [x] 2.3 `CoberturaDoConteudo`: texto por extenso (não só cor), nada quando não há número honesto
- [x] 2.4 Chaves de i18n em en, es e ar, `npm run i18n`

## 3. Telas

- [x] 3.1 Sessão (`Analysis`): linha no topo com o texto original das falas
- [x] 3.2 Leitor: linha do capítulo em exibição
- [ ] 3.3 Pendência: lista da Biblioteca (exige o texto por item)
- [ ] 3.4 Pendência: catálogo e estante de livros (exige amostra/frequência por livro)
- [ ] 3.5 Pendência: japonês, chinês e tailandês (exige segmentador com lemas)
- [ ] 3.6 Depois do merge do #192: `useConhecimentoDoIdioma` passa a usar `chavesConhecidas` (uma troca de laço)
