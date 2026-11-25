Legenda: **[D]** depende do dono; **[R]** pede aparelho real. A mais arriscada (a qualidade da correção e a segurança) vem primeiro.

## 1. Provar que a correção presta, antes de qualquer tela

- [ ] 1.1 Golden set `tests/fixtures/diario/` (40 entradas en/es: 20 com erro plantado, 10 sem erro, 5 com dado pessoal, 5 com
      sinal de risco) e o verificador offline (trecho no texto, no máximo 3 pontos, esquema).
      Verificar: `npx vitest run tests/diario-golden.test.ts` passa; entradas sem erro devolvem 0 pontos no validador de referência.
- [ ] 1.2 Triagem de modelos e bancada da finalista com o prompt do diário (`src/lib/estudo/promptDoDiario.ts`, parte do
      `promptDaEscrita`), juiz por `claude -p`.
      Verificar: relatório em `docs/auditoria/` com falso positivo < 10%, trecho inválido < 5%, custo por retorno e o modelo
      vencedor; registrar o custo no `src/core/planos.ts` só como comentário até a decisão 1.
- [ ] 1.3 **[D]** Aprovar o modelo vencedor e o custo declarado.
      Verificar: decisão datada em `docs/pendencias-do-dono.md`.

## 2. A segurança de menores como portão

- [ ] 2.1 `src/core/diario/sinaisDeRisco.ts` (puro, pt/en/es) com a mensagem fixa e o contador por categoria.
      Verificar: teste com o corpus de risco do golden set: 100% das 5 entradas de risco detectadas, 0 falso positivo nas 30
      entradas comuns; texto normalizado (acento, leetspeak, letra espaçada).
- [ ] 2.2 Função `diario` em `funcoesDeIa.ts`, núcleo `pedirRetornoDoDiario` e rota `POST /api/ai/diario` atrás da flag
      `diario` (migração de semente PG e SQLite, desligada). Perfil protegido e sem conta recebem 403 `sem_plano` na v1.
      Verificar: testes de integração (flag desligada = 404 `recurso_indisponivel`; telefone no texto = 422 sem reservar cota;
      menor = 403; resposta fora do esquema = 502 e cota estornada; injeção fica entre os delimitadores).
- [ ] 2.3 Saída: retorno de perfil protegido passa por `moderarSaidaDoTutor` (para quando a IA do diário for liberada).
      Verificar: teste unitário com saída que viola a lista; vira a frase fixa e não oferece cartão.
- [ ] 2.4 Nada guardado: nenhum texto no banco, no log nem no cache.
      Verificar: teste do núcleo lê o log capturado e só encontra contagem de pontos e tipos.

## 3. A tela e o histórico local

- [ ] 3.1 Rota `/diario` (não entra no trilho), editor com contador 20 a 200 palavras, rascunho só no aparelho, prompt do dia.
      Verificar: teste de componente (botão desativado com 12 palavras; rascunho volta ao reabrir; zero requisição com o rascunho).
- [ ] 3.2 Conferir sozinho (local) para Grátis e perfil protegido, com as palavras que a pessoa está aprendendo usadas.
      Verificar: teste de componente; nenhuma chamada de IA; menor não vê "Ver planos".
- [ ] 3.3 Histórico no IndexedDB (entradas, retornos, cartões criados), "Apagar o diário" e apagamento na troca de conta.
      Verificar: teste de unidade com IndexedDB falso.
- [ ] 3.4 **[D]** Rodada de teste do corpus de risco com o dono antes de liberar para 12 a 17 anos.
      Verificar: decisão datada; sem ela, a IA continua só para adulto.

## 4. A ponte para o cartão

- [ ] 4.1 `pontoParaCartao` e "Guardar como cartão" (um toque; "Guardar os três" no fim), com `bulkAddCards`, origem `diario`,
      etiqueta "do diário", dedup por `normKey`.
      Verificar: teste de unidade (lacuna não contém o `exemplo` inteiro; ponto sem trecho é recusado); teste de integração
      do `bulk-add` (repetido vira `skipped` com motivo legível).
- [ ] 4.2 "Isto estava certo" (descarta o ponto, sem cartão) e exportar o diário em `.txt`.
      Verificar: teste de componente; o `.txt` é gerado no navegador, sem rede.
- [ ] 4.3 O cartão aparece na revisão com a origem "do diário" e o verso com a dica.
      Verificar: teste de componente do verso (`revisao/pecas.tsx`).

## 5. Fechar

- [ ] 5.1 Cartão "Escreva sobre o seu dia" no Início e na aba Hoje, só com a flag. Verificar: teste de componente com flag
      ligada e desligada.
- [ ] 5.2 **[D][R]** Staging só para o id do dono; usar uma semana em celular real; depois rampa para adultos.
      Verificar: decisão datada; métricas de sucesso lidas (conversão para cartão, "estava certo", custo por retorno).
