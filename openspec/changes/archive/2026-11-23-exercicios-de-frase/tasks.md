## 1. Core

- [x] 1.1 `compararFrase` com diff por palavra (certa, trocada, faltando, sobrando) e nota 0..100
- [x] 1.2 Tolerância: caixa, pontuação e acento (configurável); idiomas sem espaço por caractere
- [x] 1.3 `frasesElegiveis` (tamanho, duplicata, tradução para a retradução) e `dicaDaFrase`
- [x] 1.4 Registrar `retraducao` e `ditadoDeFrase` em `MINIGAMES` (`writesSrs: false`, modalidade `frase`)
- [x] 1.5 Gate (`estadoDoJogo`) e montagem (`montarRodada`) concordando; ditado de frase exige voz

## 2. Tela

- [x] 2.1 `ExercicioDeFrase.tsx`: campo com rótulo, Enter confere, dica, ver o original, "Ouvir de novo"
- [x] 2.2 Resultado com marca e texto alternativo por palavra, resumo e nota
- [x] 2.3 Opção de acento guardada no aparelho; tela vazia amigável
- [x] 2.4 Catálogo: cartas (kids/pro/senior), ícone, arte, explicação, textos, efeitos, maestria
- [x] 2.5 Sem relógio: avanço pelo botão "Próxima frase"; nota só pelo resultado

## 3. i18n e testes

- [x] 3.1 Chaves em `public/i18n/{en,es,ar}.json` e `npm run i18n`
- [x] 3.2 Testes do core (igual, acento, pontuação, trocada, faltando, sobrando, japonês)
- [x] 3.3 Teste de componente (Enter, dica, diff com texto alternativo, relatório, tela vazia)
- [x] 3.4 Atualizar goldens e contagens que enumeravam 18 jogos

## 4. Pendências

- [ ] 4.1 Frases da Trilha (Tatoeba) para os dois jogos
- [ ] 4.2 Decidir se o `ditado` antigo e o `ditadoDeFrase` devem se fundir (hoje há sobreposição)
- [ ] 4.3 Verificar no navegador real (voz sintetizada em ja/zh, teclado do Quest)
