Legenda: **[D]** depende do dono; **[R]** pede aparelho real. A mais arriscada (a qualidade da correção e a segurança) vem primeiro.

## 1. Provar que a correção presta, antes de qualquer tela

- [x] 1.1 Golden set `tests/fixtures/diario/` (40 entradas en/es: 20 com erro plantado, 10 sem erro, 5 com dado pessoal, 5 com
      sinal de risco) e o verificador offline (trecho no texto, no máximo 3 pontos, esquema).
      Verificar: `npx vitest run tests/diario-golden.test.ts` passa; entradas sem erro devolvem 0 pontos no validador de referência.
      Feito (25/11): `tests/fixtures/diario/golden.json` (40 entradas en/es) e `tests/diario-golden.test.ts` (verificador offline: esquema, trecho no texto, máximo 3 pontos, 0 pontos nas 10 sem erro, dado pessoal 5/5, risco 5/5 sem falso positivo nas 35 comuns, 20/20 pontos viram cartão).
- [ ] 1.2 Triagem de modelos e bancada da finalista com o prompt do diário (`src/lib/estudo/promptDoDiario.ts`, parte do
      `promptDaEscrita`), juiz por `claude -p`.
      Verificar: relatório em `docs/auditoria/` com falso positivo < 10%, trecho inválido < 5%, custo por retorno e o modelo
      vencedor; registrar o custo no `src/core/planos.ts` só como comentário até a decisão 1.
      ABERTA **[B]** (bancada única depois da Onda 4, 25/11): o prompt de produção já está em `src/lib/estudo/promptDoDiario.ts` e o golden set pronto; falta o script `scripts/eval-ia/diario.mjs` (no molde de `parceiro.mjs`), a triagem com juiz por `claude -p` e o relatório em `docs/auditoria/`. Nível provisório: `rapida` para todo plano (o mais barato dos elegíveis `zdr`; `server/ai/niveis.ts`).
- [ ] 1.3 **[D]** Aprovar o modelo vencedor e o custo declarado.
      Verificar: decisão datada em `docs/pendencias-do-dono.md`.
      ABERTA **[D]**. Decisão assumida: recomendação X do `decisoes-do-dono.md` item 31, 25/11 (cota compartilhada com `escritasMes`, en/es, mensagem de apoio cita o CVV 188, tela "Diário"); modelo vencedor e custo ficam para a bancada 1.2 (estimativa declarada: ~US$ 0,0004 por retorno, a medir).

## 2. A segurança de menores como portão

- [x] 2.1 `src/core/diario/sinaisDeRisco.ts` (puro, pt/en/es) com a mensagem fixa e o contador por categoria.
      Verificar: teste com o corpus de risco do golden set: 100% das 5 entradas de risco detectadas, 0 falso positivo nas 30
      entradas comuns; texto normalizado (acento, leetspeak, letra espaçada).
      Feito: `src/core/diario/sinaisDeRisco.ts` (pt/en/es, régua de `moderacao/normalizar`: acento, leetspeak, letra espaçada) e `MENSAGEM_DE_APOIO`. O contador por categoria é só log do servidor (`diario_sinal_de_risco`); o cliente não registra nada.
- [x] 2.2 Função `diario` em `funcoesDeIa.ts`, núcleo `pedirRetornoDoDiario` e rota `POST /api/ai/diario` atrás da flag
      `diario` (migração de semente PG e SQLite, desligada). Perfil protegido e sem conta recebem 403 `sem_plano` na v1.
      Verificar: testes de integração (flag desligada = 404 `recurso_indisponivel`; telefone no texto = 422 sem reservar cota;
      menor = 403; resposta fora do esquema = 502 e cota estornada; injeção fica entre os delimitadores).
      Feito: função `diario` (`funcoesDeIa.ts`, `niveis.ts`, `telemetriaDeIa.ts`, `pernasDaFuncao`), núcleo `server/ai/nucleo/diario.ts`, adaptador `server/ai/diario.ts`, rota `POST /api/ai/diario` e flag `diario` (migrações PROVISÓRIAS PG 0042 e SQLite 0081; o integrador renumera). Menor, idade não declarada e Grátis: 403 `sem_plano`; sinal de risco no servidor: 422 `sinal_de_risco` (defesa contra cliente adulterado). Constante `IA_DO_DIARIO_PARA_MENORES = false` (liberar é decisão do dono). Testes: `tests/integration/diario.test.ts`.
- [x] 2.3 Saída: retorno de perfil protegido passa por `moderarSaidaDoTutor` (para quando a IA do diário for liberada).
      Verificar: teste unitário com saída que viola a lista; vira a frase fixa e não oferece cartão.
      Feito com o mecanismo que já existe (`recusaSeSaidaBarrada`, teste em `tests/saida-filtrada-nucleo.test.ts`): saída barrada vira 502 `saida_filtrada` sem o texto e a tela mostra "Não deu para ler seu texto agora."; nenhum cartão é oferecido. A "frase fixa" da spec fica para quando a IA for liberada a menores (hoje o servidor recusa menor antes da IA).
- [x] 2.4 Nada guardado: nenhum texto no banco, no log nem no cache.
      Verificar: teste do núcleo lê o log capturado e só encontra contagem de pontos e tipos.
      Feito: `tests/integration/diario.test.ts` ("nenhuma linha de log tem o texto enviado nem o retorno") e o teste do sinal de risco (o log só leva a categoria).

## 3. A tela e o histórico local

- [x] 3.1 Rota `/diario` (não entra no trilho), editor com contador 20 a 200 palavras, rascunho só no aparelho, prompt do dia.
      Verificar: teste de componente (botão desativado com 12 palavras; rascunho volta ao reabrir; zero requisição com o rascunho).
      Feito: `src/components/views/diario/Diario.tsx` e `PortaoDoDiario.tsx`, rota `diario` (`/diario`, fora do trilho), rascunho no `localStorage` (`frasy.diario.rascunho`), prompt do dia. Testes: `tests/diario-tela.test.tsx`.
- [x] 3.2 Conferir sozinho (local) para Grátis e perfil protegido, com as palavras que a pessoa está aprendendo usadas.
      Verificar: teste de componente; nenhuma chamada de IA; menor não vê "Ver planos".
      Feito: "Conferir sozinho" (palavras, palavras do caderno que a pessoa usou, frases sem ponto), sem IA; o perfil protegido nunca vê "Ver planos" (`src/lib/diario/acesso.ts`). As palavras usadas vêm do índice de etiquetas (caderno e "Já sei") no idioma escolhido.
- [x] 3.3 Histórico no IndexedDB (entradas, retornos, cartões criados), "Apagar o diário" e apagamento na troca de conta.
      Verificar: teste de unidade com IndexedDB falso.
      Feito: `src/lib/diario/historico.ts` (IndexedDB `babel-diario`, teto de 200 entradas), "Apagar o diário" com confirmação e apagamento na troca de conta. Testes: `tests/diario-historico.test.ts` (com `fake-indexeddb`).
- [ ] 3.4 **[D]** Rodada de teste do corpus de risco com o dono antes de liberar para 12 a 17 anos.
      Verificar: decisão datada; sem ela, a IA continua só para adulto.
      ABERTA **[D]**. Sem a rodada com o dono, a IA continua só para adulto (`IA_DO_DIARIO_PARA_MENORES = false`).

## 4. A ponte para o cartão

- [x] 4.1 `pontoParaCartao` e "Guardar como cartão" (um toque; "Guardar os três" no fim), com `bulkAddCards`, origem `diario`,
      etiqueta "do diário", dedup por `normKey`.
      Verificar: teste de unidade (lacuna não contém o `exemplo` inteiro; ponto sem trecho é recusado); teste de integração
      do `bulk-add` (repetido vira `skipped` com motivo legível).
      Feito: `src/core/diario/pontoParaCartao.ts` (lacuna por `makeCloze` sobre a frase CORRIGIDA; recusa com motivo quando o exemplo reaparece na frase) e "Guardar como cartão"/"Guardar os três" pelo `bulkAddCards`. DESVIO: a origem "diário" é a etiqueta `do-diário` (PUT `/api/vocab/:id/etiquetas`), sem campo novo e sem mexer em `vocab_occurrences.origin_kind`; a deduplicação por (palavra, idioma) é a do servidor. Se o dono quiser `origin_kind = diario`, mexe no repositório do vocabulário.
- [x] 4.2 "Isto estava certo" (descarta o ponto, sem cartão) e exportar o diário em `.txt`.
      Verificar: teste de componente; o `.txt` é gerado no navegador, sem rede.
      Feito: "Isto estava certo" (some o ponto e registra no histórico local) e "Exportar o diário (.txt)", gerado no navegador.
- [ ] 4.3 O cartão aparece na revisão com a origem "do diário" e o verso com a dica.
      Verificar: teste de componente do verso (`revisao/pecas.tsx`).
      ABERTA: o verso do cartão leva o exemplo e a dica (testado em `diario-tela.test.tsx`), mas falta o teste de componente do verso em `revisao/pecas.tsx` com a etiqueta "do diário".

## 5. Fechar

- [x] 5.1 Cartão "Escreva sobre o seu dia" no Início e na aba Hoje, só com a flag. Verificar: teste de componente com flag
      ligada e desligada.
      Feito: linha "Escreva sobre o seu dia" no Início só com a flag (`tests/diario-no-inicio.test.tsx`). Pendente: o mesmo atalho na aba Hoje de Cartões.
- [ ] 5.2 **[D][R]** Staging só para o id do dono; usar uma semana em celular real; depois rampa para adultos.
      Verificar: decisão datada; métricas de sucesso lidas (conversão para cartão, "estava certo", custo por retorno).
      ABERTA **[D][R]**: ligar a flag só no staging do id do dono é ato do dono, depois da bancada 1.2 e da decisão 1.3.
