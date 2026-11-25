Legenda: **[D]** depende do dono; **[R]** pede aparelho ou navegador real. A mais arriscada vem primeiro.

## 1. Provar que o quadro sai sem reabrir o compartilhamento

- [ ] 1.1 Página de laboratório `scripts/lab/quadro-da-tela.html`: `getDisplayMedia`, subir a resolução com `applyConstraints`,
      desenhar, codificar WebP e voltar; imprime tempo e bytes de 20 quadros.
      Verificar: abrir a página no Chrome e ver a tabela; p95 < 120 ms e <= 40 KB por quadro de 480 px.
- [ ] 1.2 **[R]** Repetir no Firefox, Safari desktop e Quest; anotar onde `applyConstraints` reabre o seletor ou falha.
      Verificar: tabela navegador x resultado em `docs/auditoria/`; navegador que falha entra no `design.md` como "sem a função".

## 2. A trava de privacidade antes de qualquer gravação

- [ ] 2.1 Flag `cartao_com_cena` desligada (constante em `src/core/planos.ts`, migração de semente PG e SQLite).
      Verificar: teste de flags lê `habilitada = 0`; com a flag desligada o botão não existe (teste de componente).
- [ ] 2.2 O armazém de anexos do cartão recusa `cena` no adaptador "conta" por tipo (e por tipo no servidor: nenhuma rota de
      imagem). Depende da `cartao-com-audio-do-trecho` 2.2.
      Verificar: teste de unidade tenta gravar `cena` no adaptador conta e recebe erro; teste de rotas confirma que não há
      rota que aceite imagem de cartão.
- [ ] 2.3 Perfil protegido: botão ausente, e `tirarQuadro` não é chamado.
      Verificar: teste de componente com perfil de 14 anos e com idade não declarada; nenhuma chamada a `getVideoTracks`.

## 3. A função

- [ ] 3.1 `tirarQuadro()` em `systemAudio.ts` (sobe, captura, volta as constraints); `null` sem faixa de vídeo.
      Verificar: teste de unidade com faixa falsa prova que as constraints voltam ao mínimo mesmo se o desenho falhar.
- [ ] 3.2 Folha de pré-visualização com "Cobrir um pedaço", "Guardar", "Descartar" e o aviso da 1ª vez; tela inteira pede
      confirmação extra.
      Verificar: teste de componente; o pixel coberto é opaco no arquivo gerado (teste lê o canvas); nada é gravado antes de "Guardar".
- [ ] 3.3 Guarda local com teto de 100 MB e expulsão do mais antigo; "Remover a imagem" no verso.
      Verificar: teste de unidade do teto; apagar o cartão apaga a imagem; trocar de conta apaga tudo.
- [ ] 3.4 Verso do cartão mostra a cena (`lib/revisao/cena.ts`, `pecas.tsx`).
      Verificar: teste de componente com e sem imagem; a onda continua para cartões sem cena.

## 4. Exportar e provar

- [ ] 4.1 `.apkg` com `<img>` e mídia somente se "Levar as imagens" estiver marcado (padrão desmarcado).
      Verificar: `tests/harness/lerApkgNode.ts` relê dois arquivos (marcado e não marcado).
- [ ] 4.2 E2E Playwright: fluxo completo e asserção de que nenhuma requisição leva imagem.
      Verificar: `npx playwright test` do novo arquivo passa; o relatório de rede tem zero corpo de imagem.
- [ ] 4.3 **[D]** Linha no ROPA e decisão sobre 16-17 anos (a recomendação é manter fora).
      Verificar: linha presente; decisão datada em `docs/pendencias-do-dono.md`.

## 5. Fechar

- [ ] 5.1 **[D][R]** Ligar `cartao_com_cena` só para o id do dono; usar uma semana em vídeo real; depois rampa para adultos.
      Verificar: decisão datada; nenhuma ocorrência de imagem no servidor na consulta de auditoria.
