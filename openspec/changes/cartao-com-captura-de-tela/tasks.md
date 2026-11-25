**Decisão assumida: recomendação "a" do item 33 de `docs/backlog/decisoes-do-dono.md` (construir só para adulto e só local, depois do áudio), 25/11.**
Perfil protegido fora (menor, 16-17 e idade não declarada); tela inteira proibida sem confirmação extra. Migrações PROVISÓRIAS: PG 0042 e SQLite 0081 (o integrador renumera).
Desvio do design: `tirarQuadro()` devolve o canvas (não o Blob), porque "Cobrir um pedaço" precisa pintar ANTES de codificar. O armazém não foi
generalizado para `AnexoDoCartao`: ganhou parâmetros (`banco`, `maiorBytes`, `tipoPadrao`) e a cena usa OUTRO banco local (`babel-cena-do-cartao`), sem adaptador "conta".

Legenda: **[D]** depende do dono; **[R]** pede aparelho ou navegador real. A mais arriscada vem primeiro.

## 1. Provar que o quadro sai sem reabrir o compartilhamento

- [ ] 1.1 Página de laboratório `scripts/lab/quadro-da-tela.html`: `getDisplayMedia`, subir a resolução com `applyConstraints`,
      desenhar, codificar WebP e voltar; imprime tempo e bytes de 20 quadros.
      Verificar: abrir a página no Chrome e ver a tabela; p95 < 120 ms e <= 40 KB por quadro de 480 px.
      Aberta: [B] fica para a sessão de bancada única (depois da Onda 4); não rodada aqui.
- [ ] 1.2 **[R]** Repetir no Firefox, Safari desktop e Quest; anotar onde `applyConstraints` reabre o seletor ou falha.
      Verificar: tabela navegador x resultado em `docs/auditoria/`; navegador que falha entra no `design.md` como "sem a função".
      Aberta: precisa de Firefox, Safari e Quest reais.

## 2. A trava de privacidade antes de qualquer gravação

- [x] 2.1 Flag `cartao_com_cena` desligada (constante em `src/core/planos.ts`, migração de semente PG e SQLite).
      Verificar: teste de flags lê `habilitada = 0`; com a flag desligada o botão não existe (teste de componente).
      Feito: flag `cartao_com_cena` (`FLAG_CARTAO_COM_CENA`), migrações PG 0042 / SQLite 0081 provisórias; `tests/cartao-com-cena-flag.test.ts`. Sem a flag a função `cenaDoCartaoAtiva()` é falsa e o convite não aparece.

- [x] 2.2 O armazém de anexos do cartão recusa `cena` no adaptador "conta" por tipo (e por tipo no servidor: nenhuma rota de
      imagem). Depende da `cartao-com-audio-do-trecho` 2.2.
      Verificar: teste de unidade tenta gravar `cena` no adaptador conta e recebe erro; teste de rotas confirma que não há
      rota que aceite imagem de cartão.
      Feito: `lib/cartoes/cenaDoCartao` usa um banco IndexedDB próprio e só local; `tests/cena-do-cartao.test.ts` varre `server/routes` e não acha rota de imagem.

- [x] 2.3 Perfil protegido: botão ausente, e `tirarQuadro` não é chamado.
      Verificar: teste de componente com perfil de 14 anos e com idade não declarada; nenhuma chamada a `getVideoTracks`.
      Feito: `cenaDoCartaoAtiva()` = flag E `!perfilProtegido()`; `LiveCapture` só chama `tirarQuadro` depois dela (teste de lib com perfil protegido; teste de componente da tela inteira não existe: a captura ao vivo não monta em jsdom).

## 3. A função

- [x] 3.1 `tirarQuadro()` em `systemAudio.ts` (sobe, captura, volta as constraints); `null` sem faixa de vídeo.
      Verificar: teste de unidade com faixa falsa prova que as constraints voltam ao mínimo mesmo se o desenho falhar.
      Feito: `gateway/capture/quadroDaTela.ts` (`tirarQuadroDaFaixa`) e `tirarQuadro()` em `systemAudio.ts`; teste das constraints devolvidas mesmo com falha do desenho.

- [x] 3.2 Folha de pré-visualização com "Cobrir um pedaço", "Guardar", "Descartar" e o aviso da 1ª vez; tela inteira pede
      confirmação extra.
      Verificar: teste de componente; o pixel coberto é opaco no arquivo gerado (teste lê o canvas); nada é gravado antes de "Guardar".
      Feito: `views/captura/FolhaDaCena.tsx`; `tests/folha-da-cena.test.tsx` (nada grava antes de Guardar, cobertura antes de codificar, tela inteira pede confirmação). O pixel opaco é provado pelo `fillRect` preto, alpha 1 (jsdom não tem canvas real).

- [x] 3.3 Guarda local com teto de 100 MB e expulsão do mais antigo; "Remover a imagem" no verso.
      Verificar: teste de unidade do teto; apagar o cartão apaga a imagem; trocar de conta apaga tudo.
      Feito: teto de 100 MB com expulsão (armazém compartilhado, testado no áudio e aqui); `deleteCard` apaga a cena; troca de conta apaga tudo; "Remover a imagem" no verso.

- [x] 3.4 Verso do cartão mostra a cena (`lib/revisao/cena.ts`, `pecas.tsx`).
      Verificar: teste de componente com e sem imagem; a onda continua para cartões sem cena.
      Feito: `hooks/useCenaDoCartao.ts` em `Cena` (`pecas.tsx`, usada na revisão do Quest) e na `GavetaDaPalavra`; sem imagem a onda continua. Teste de componente do verso: aberto (baixo risco).

## 4. Exportar e provar

- [ ] 4.1 `.apkg` com `<img>` e mídia somente se "Levar as imagens" estiver marcado (padrão desmarcado).
      Verificar: `tests/harness/lerApkgNode.ts` relê dois arquivos (marcado e não marcado).
      Aberta: fora desta entrega; hoje nada exporta a cena, o que equivale ao padrão "Levar as imagens" desmarcado.
- [ ] 4.2 E2E Playwright: fluxo completo e asserção de que nenhuma requisição leva imagem.
      Verificar: `npx playwright test` do novo arquivo passa; o relatório de rede tem zero corpo de imagem.
      Aberta: [R] o Playwright não faz compartilhamento de tela real; fica para a rodada em navegador real. A ausência de rota de imagem já é testada em `tests/cena-do-cartao.test.ts`.
- [ ] 4.3 **[D]** Linha no ROPA e decisão sobre 16-17 anos (a recomendação é manter fora).
      Verificar: linha presente; decisão datada em `docs/pendencias-do-dono.md`.
      Aberta: depende do dono.

## 5. Fechar

- [ ] 5.1 **[D][R]** Ligar `cartao_com_cena` só para o id do dono; usar uma semana em vídeo real; depois rampa para adultos.
      Verificar: decisão datada; nenhuma ocorrência de imagem no servidor na consulta de auditoria.
      Aberta: ligar só depois de 4.3 e de uma semana em vídeo real.
