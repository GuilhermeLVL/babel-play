## 1. Filtro local e interface

- [x] 1.1 `server/ai/moderacao/listasParaMenores.ts`: categorias e padrões pt/en/es, comentados
- [x] 1.2 `server/ai/moderacao/moderarSaidaDoTutor.ts`: normalização, detecção de contato, `ModeradorDeSaida`, cadeia
- [x] 1.3 Testes do filtro (`tests/filtro-tutor-menores.test.ts`): categorias com variantes, adulto, 49 respostas de aula
- [x] 1.4 Revisão do PR #135: falsos positivos (automutilação, dado pessoal, aliciamento, contato), citação só com
      explicação fora dela, aspas simples, domínios de exemplo, formato de telefone, teto de 20 mil caracteres, ponto
      `saida_filtrada` no Worker e a frase de cuidado reescrita

## 2. Tutor

- [x] 2.1 `conversarComTutor.ts`: moderar a saída (nuvem e Ollama) só para perfil protegido; frase fixa e `filtrada`
- [x] 2.2 `server/routes/tutor.ts`: a frase fixa não é assinada
- [x] 2.3 Log `tutor_saida_filtrada` (categoria, função, requestId), métrica `ia_saida_filtrada_total`, anotação do rastro
- [x] 2.4 Teste pela rota (`tests/integration/tutor-filtro-de-saida.test.ts`): barrado não chega ao cliente, sem
      assinatura, não volta ao modelo, log sem texto; corretor filtrado; adulto não filtrado

## 3. Cliente e i18n

- [x] 3.1 `IChat.tsx`: `filtrada` mostra a frase traduzida, sem origem e sem assinatura (`tests/ichat.test.tsx`)
- [x] 3.2 Catálogos `en`, `es`, `ar`; `xx` e cobertura regenerados

## 4. Próximas tarefas (fora deste change)

- [ ] 4.1 Filtrar as outras saídas de IA para perfil protegido: explicação (`explicarFrase.ts`), parceiro de leitura
      (`parceiroDeLeitura.ts`), alternativas, resumo e polimento
- [ ] 4.2 "Como respondo?" do assistente ao vivo (`assistenteAoVivo.ts`) é em fluxo: segurar o fluxo para perfil protegido
- [ ] 4.3 Opção C (moderação por IA) como segundo moderador da cadeia — decisão do dono, com custo medido
- [ ] 4.4 Dono: revisar as listas e acompanhar `tutor_saida_filtrada` por categoria nas primeiras semanas
