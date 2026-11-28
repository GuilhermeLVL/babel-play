## 1. Simulação (a mais arriscada primeiro: a legenda mudar de cor sem a pessoa pedir)

- [x] 1.1 Script `scripts/etiquetas/simular-forca.ts` (rodado com `npx tsx`; TS para importar o núcleo): lê um deck e imprime a tabela de transição (etiqueta antiga para nova) e a
      % que muda, para 2 ou 3 mapas candidatos, incluindo 30 dias simulados sem revisão. Verificar: rodar contra a fixture do corpus
      Anki e testes do script; a saída mostra 0 oscilações para o mapa escolhido.
      Feito sobre deck sintético (o corpus Anki não tem estabilidade FSRS): `docs/auditoria/2026-11-25-status-da-palavra-simulacao.md`; 0 oscilações, mas 47,9% mudam (> 15%), então rever com o deck real em 1.2.
- [ ] 1.2 **[D]** (decisão assumida: recomendação 35, mapa 1 / 2-3 / 4, 25/11; falta rodar com o deck do dono) Rodar a 1.1 com um export do deck do dono e decidir o mapa final. Verificar: tabela anexada em `docs/` e o mapa
      escolhido escrito em `design.md`.

## 2. Núcleo e índice (atrás da flag)

- [x] 2.1 Teste de caracterização do índice e das etiquetas ATUAIS (flag desligada), antes de qualquer alteração. Verificar:
      `npx vitest run tests/etiquetas*` verde sem mudar nenhum teste existente.
- [x] 2.2 `src/core/vocabulario/etiquetas.ts`: `forca` no índice do caderno (maior força quando a chave repete), e função pura
      `etiquetaDaForca` com a tabela de correspondência. Verificar: testes por faixa (1, 2, 3, 4), rebaixamento por 3 esquecimentos
      e chave repetida em dois cartões.
- [x] 2.3 `src/lib/etiquetas/indiceDeEtiquetas.ts` passa `forca` na saída do índice e usa `etiquetaDaForca` só com a flag
      `forca_na_legenda`. Verificar: teste com a flag ligada e desligada (nesta, snapshot idêntico ao de hoje).
- [x] 2.4 Flag `forca_na_legenda` (migração PG e SQLite como as outras; nasce desligada) e leitura no cliente. Verificar: teste de
      flags e `npm run migracoes:conferir`.

## 3. Superfícies

- [x] 3.1 (27/11: `data-forca` também na legenda da captura (`HistoricoDoPrototipo`/`TextoComMarcas`) e na folha da frase (`FolhasDoPrototipo`); teste em `tests/forca-na-legenda-superficies.test.tsx`) `data-forca` nos nós de palavra da legenda, da janela flutuante e da folha da frase (sem mudar `data-etiqueta` nem o que
      a região `aria-live` anuncia). Verificar: teste de componente de que o texto acessível não muda e que o atributo existe.
- [x] 3.2 (27/11: o stub `HistoricoNaFolha` de `ganchosDaPalavra.tsx` mostra `ForcaDaPalavra` no cartão do leitor, flag `forca_na_legenda`, dentro de "Mais"; `etiquetaDaPalavra` do leitor segue stub; teste em `tests/leitor-forca-no-cartao.test.tsx`) Gaveta e cartão da palavra na legenda e no leitor mostram `ForcaDaPalavra`. Verificar: teste de componente com força 1 a 4.
- [x] 3.3 Glosa do leitor: some em força >= `FORCA_QUE_APAGA_A_GLOSA` (3) ou na hora com "Já sei" (flag ligada). Verificar: teste do
      módulo da glosa (força 2 mantém, 3 apaga, "Já sei" apaga) e o fluxo do spec `leitor-glosa` sem regressão com a flag desligada.
- [x] 3.4 Promoção sem toque: depois de uma revisão, a etiqueta muda na próxima releitura do índice, sem toast nem som. Verificar:
      teste que simula a revisão (estabilidade 2,9 para 3,1) e confere que a etiqueta troca de `salva`/`aprendendo` sem nova gravação
      na tabela de marcadas.
- [x] 3.5 Contraste do tom `aprendendo` nos dois temas e nos três fundos da janela flutuante. Verificar:
      `node scripts/etiquetas/contraste.mjs` todos >= 4,5:1.
- [x] 3.6 Textos novos (se houver) em `en`/`es`/`ar` e `npm run i18n`. Verificar: portões de i18n.

## 4. Fechamento

- [x] 4.1 Teste de tabela: a faixa da legenda e a do catálogo concordam para 1.000 cartões sintéticos. Verificar: o teste passa
      e prende `LIMIAR_FAMILIAR_DIAS`/`LIMIAR_FIRME_DIAS` como fonte única.
- [x] 4.2 Sem regressão de desempenho ao montar o índice de 20.000 cartões. Verificar: microbench no teste ou `slo-captura.json`.
- [ ] 4.3 **[R]** Legenda real no celular com a flag ligada e um deck de verdade: palavras nas quatro forças aparecem como
      combinado e nada pisca. Verificar: captura de tela e anotação no PR.
- [x] 4.4 **[D]** (decisão assumida: recomendação 35, `contarConhecidas`, cobertura e moldura do cartão ficam como estão, 25/11; `chavesConhecidasPorForca` é só da glosa) Decidir se `contarConhecidas` e a cobertura passam a usar força >= 3 (hoje: aprendendo + dominada + Já sei) e se a
      moldura do cartão converge para a força. Verificar: decisão escrita; se "sim", uma change própria (mexe em números que a
      pessoa já viu).
- [ ] 4.5 **[D]** (ato do dono; migrações provisórias PG 0033 e SQLite 0073, o integrador pode renumerar) Ligar `forca_na_legenda` (dono primeiro, depois todos). Verificar: `flags listar` e uma semana sem relato de
      "mudou a cor sozinha" que a promoção não explique.
