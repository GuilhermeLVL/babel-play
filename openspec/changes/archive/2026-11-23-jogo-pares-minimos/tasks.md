## 1. Dados

- [x] 1.1 Listas curadas de pares mínimos para en, es, fr, de, it e pt (>= 15 cada) com o contraste rotulado
- [x] 1.2 Teste dos dados: sem duplicata, palavras diferentes, contraste preenchido e com dois sons diferentes

## 2. Core

- [x] 2.1 `sortearRodada`: só o idioma-alvo, sem repetir par/palavra, equilibra lado tocado e posição
- [x] 2.2 `conferirPar` e `resumirContrastes` (junta o mesmo contraste, ordena pelo que mais errou)
- [x] 2.3 Registrar `paresMinimos` em `MINIGAMES` (`doIdioma`, `writesSrs: false`)
- [x] 2.4 Gate (`estadoDoJogo`) e montagem (`montarRodada`) concordando; motivos `sem-voz` e `sem-lista-do-idioma`
- [x] 2.5 Sem bônus de velocidade (`SEM_BONUS_DE_VELOCIDADE`)

## 3. Tela

- [x] 3.1 `ParesMinimos.tsx`: Ouvir, Ouvir devagar, duas opções grandes (teclas 1 e 2)
- [x] 3.2 Feedback com os dois sons e o contraste (texto, ícone e forma além da cor) e ouvir as duas palavras
- [x] 3.3 Resumo no fim: "Seu ouvido confunde /x/ e /y/"; avanço só pelo botão, sem relógio
- [x] 3.4 Catálogo: carta (kids/pro/senior), ícone, arte, como se joga, textos, efeitos, maestria, Quest

## 4. i18n e testes

- [x] 4.1 Chaves em `public/i18n/{en,es,ar}.json` e `npm run i18n`
- [x] 4.2 Testes do core e dos dados (`tests/paresMinimos.test.ts`) e do componente (`tests/paresMinimos.test.tsx`)
- [x] 4.3 Atualizar goldens e contagens que enumeravam 20 jogos
- [x] 4.4 e2e da Trilha e da Personalizar (estática) verdes

## 5. Pendências

- [ ] 5.1 Revisão das listas por falante nativo (sobretudo de, fr e pt-BR) e dos rótulos fonéticos
- [ ] 5.2 Listas para outros idiomas (ja, ko, ru, ar...) e filtro por contraste ("treinar só /θ/ × /s/")
- [ ] 5.3 Verificar no navegador real a qualidade da voz sintetizada por idioma (algumas vozes mudam o som)
