## 1. OpenSpec

- [x] 1.1 proposal, spec delta (`acervo-anki`) e tasks

## 2. Núcleo e cliente

- [x] 2.1 `src/core/anki/paraAnkiConnect.ts`: papéis, mapeamento padrão pelo nome, escape de HTML, cloze, etiquetas, tetos
- [x] 2.2 `src/lib/anki/ankiConnect.ts`: cliente versão 6, prazo curto, erros tipados com mensagem acionável, lotes, duplicatas
- [x] 2.3 `src/lib/anki/ankiConnectPrefs.ts`: preferências no aparelho (localStorage com try/catch, leitura validada)

## 3. Interface

- [x] 3.1 `EnviarParaOAnki`: testar conexão, baralho, modelo, campos, enviar com progresso, resumo e parar
- [x] 3.2 `ExportarVocabulario`: formato "Anki no computador" só em desktop (e "Enviar selecionados" pela seleção)
- [x] 3.3 i18n em `public/i18n/{en,es,ar}.json` + `npm run i18n`

## 4. Segurança

- [x] 4.1 CSP: `connect-src` com `http://127.0.0.1:8765` e `http://localhost:8765`, documentado em `server/http/csp.ts`

## 5. Verificação

- [x] 5.1 Testes: cliente com `fetch` simulado, mapeamento, preferências, painel, CSP
- [x] 5.2 typecheck, lint, vitest dos tocados, `rotas-sem-caracterizacao` sem rota nova
- [ ] 5.3 Teste manual com Anki real e AnkiConnect (a fazer pelo dono: Chrome e Firefox; conferir o Safari)
