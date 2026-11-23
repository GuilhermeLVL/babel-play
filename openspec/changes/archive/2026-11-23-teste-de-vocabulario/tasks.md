## 1. Núcleo

- [x] 1.1 `palavrasPorNivel(lang)` em `src/core/learning/cefrWordlist.ts` e pseudopalavras curadas (`pseudopalavras.ts`)
- [x] 1.2 `montarTeste` (faixas A1 a C2, ~10 reais + 3 pseudopalavras por faixa, semente determinística)
- [x] 1.3 `andamentoDoTeste` (parada adaptativa) e `resultadoDoTeste` (nível, estimativa, correção por chute, o que marcar)
- [x] 1.4 Testes do núcleo: amostragem com semente, parada, penalidade de chute (`tests/teste-de-vocabulario-core.test.ts`)

## 2. Servidor e espelho

- [x] 2.1 `PUT /api/vocab/marcadas/lote` e `POST /api/vocab/marcadas/lote/desfazer` (validação em `server/validation.ts`)
- [x] 2.2 `marcarEmLote`/`desfazerLote` no repositório: uma transação sob `travarUsuario`, teto atômico, precedência
- [x] 2.3 Espelho sem conta e contrato da API (`api-contrato.json`)
- [x] 2.4 Testes: auth, validação, teto atômico (inclusive concorrente), precedência, isolamento
      (`tests/caracterizacao/vocab-marcadas-lote.test.ts`, `tests/efemero-palavras-marcadas.test.ts`)

## 3. Cliente e tela

- [x] 3.1 `marcarLotePalavras`/`desfazerLotePalavras` e `marcarLoteNoIndice`/`desfazerLoteNoIndice` (uma publicação)
- [x] 3.2 `TesteDeVocabulario.tsx` e a entrada em `PalavrasQueVoceConhece.tsx`; estilos em `etiquetas.css`
- [x] 3.3 i18n em `public/i18n/{en,es,ar}.json` e `npm run i18n`
- [x] 3.4 Teste da tela (`tests/teste-de-vocabulario-tela.test.tsx`)

## 4. Pendências

- [ ] 4.1 Convite na cobertura quando ela some por falta de histórico (decidir a navegação até o Vocabulário)
- [ ] 4.2 Outros idiomas: lista de níveis e pseudopalavras de cada um (`idiomasComTeste()` já os acolhe)
- [ ] 4.3 Dono: revisar a lista de pseudopalavras e ajustar os limiares com uso real
