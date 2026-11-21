Legenda: **[D]** = ato ou decisão do dono (ou de humano); **[R]** = exige aparelho real. Nenhuma tarefa de ligar (6.x) começa antes
dos portões 1 a 4 estarem marcados.

## 1. Portões e critério escrito (antes de qualquer número)

- [ ] 1.1 Escrever e commitar `criterio.md` dos três A/B (D6) e o protocolo do teste cego (D4) ANTES da primeira rodada.
      Verificar: `ab.mjs` aceita o critério (commit anterior à primeira rodada).
- [ ] 1.2 **[D]** Portão 1, licença: o dono lê o checklist (README dos pesos Mozilla = MPL-2.0; corpora não informados; sem campo
      no registro) e decide, por par, se o R2 pode hospedar. EuroNano segue ADIADO (TED2020 CC BY-NC-ND); contato com a Tether só
      com OK do dono. Verificar: decisão registrada em `docs/auditoria/` com a data.
- [x] 1.3 Catálogo: campos `licencaPesos`, `licencaDados` (`"não informada"` enquanto for o caso) e `aprovadoPeloDono` (padrão
      `false`) por par em `modelosDoBergamot.json`; `publicar-bergamot-no-r2.ts` recusa par sem `aprovadoPeloDono`. Verificar:
      teste do script em `--seco` recusa o par não aprovado.

## 2. Flag

- [x] 2.1 Flag `traducao_local_por_direcao`: migrações PROVISÓRIAS PG 0026 e SQLite 0068 (semente idempotente, sem regra de plano,
      reversão `DELETE FROM flags`), snapshots, journals, `PainelFlags`, `docs/flags.md`, baseline. Verificar: nasce desligada;
      numeração conferida contra a `main` no PR.
- [x] 2.2 Gate no uso: desligada, `parDoBergamot`/`bergamotOferecido` só atendem pt→en e o runtime é o 0.4.9, mesmo com
      `VITE_BERGAMOT_MODELOS_URL` definida. Verificar: teste em grade (flag × URL × par): só flag ligada + URL abre `paresDoCdn`.

## 3. Rota por direção e perfis

- [x] 3.1 Tabela pura da rota por direção em `src/core/` (D2) com veredito por par lido de dado; `routeMt` a consome. Verificar:
      testes de X→en, en→pt-BR e pivô nas duas situações do veredito (nenhuma mudança com a flag desligada).
- [x] 3.2 Confirmar por teste que o en→pt do opus-mt envia o alvo `pt_br` (token por id, `mtWorker.ts`). Verificar: teste do
      worker (ou do adaptador) que falha se o token mudar.
- [x] 3.3 Perfis: `bergamot-local` antes de `opus-mt-local` nos três perfis nativos; `resolveMt` com o caso novo compartilhando o
      `OpusMtLocal`; `registroDeMotores.ts` com `adapterId` próprio; perfil salvo só com `opus-mt-local` segue válido. Verificar:
      testes de perfis e de `resolveMt`; falha do Bergamot cai no opus-mt sem erro visível.

## 4. Laboratório: qualidade e variante

- [ ] 4.1 Rodar a bancada de qualidade (`scripts/eval-fala/bancada/mt.mjs` + `pontuar.py`) com `local:opus-mt` × `bergamot:<par>` em
      `fleurs:pt-en` e, ao fim da 4.2, nos demais X→en. Verificar: COMET e chrF++ com IC 95% pareado por par, gold junto.
- [ ] 4.2 Acrescentar corpora FLEURS `X→en` dos pares a publicar à bancada (hoje nenhum corpus tem origem em es e demais X;
      `baixar-corpus.py`). Verificar: o relatório lista n por par.
- [ ] 4.3 **[D]** Portão 2, teste cego pt-BR (D4): montar a planilha embaralhada e o gabarito; o dono recruta ≥ 2 avaliadores
      brasileiros; aplicar; calcular pt-PT por sistema, kappa e IC. Verificar: relatório com o veredito por sistema
      (`aprovado`, `reprovado`, `inconclusivo`); só `aprovado` muda a rota de en→pt.
- [ ] 4.4 Registrar o veredito no catálogo e no relatório. Verificar: com `reprovado` ou `inconclusivo` o en→pt segue opus-mt.

## 5. Laboratório: runtime, memória, latência e download

- [ ] 5.1 Script de build do WASM do `inference/` (Mozilla, `BERGAMOT_VERSION`), vendorizado sem modificação, com aviso MPL e
      `FONTES.md`; chave de build `antigo|novo`. Verificar: build com cada chave carrega pt-en e traduz.
- [ ] 5.2 Portão 3: A/B de memória e latência 0.4.9 × WASM novo no laboratório (D6.1), com o 2º modelo em sequência (issue #1488).
      Verificar: relatório com heap e pico da aba, p75 de ms/frase e erros do 2º modelo; só troca o runtime se a memória cair no
      IC 95% e não houver erro no 2º modelo.
- [ ] 5.3 A/B de `fimDaFalaAteLegendaMs`: opus-mt × Bergamot nos pares X→en (D6.2), `ab.mjs` pareado, taxa de falha ao lado,
      todo resultado marcado `emulado` enquanto não houver aparelho real. Verificar: tabela com p50/p75/p95 e IC, qualidade e
      memória lado a lado.
- [ ] 5.4 Medir download frio e quente por par (`carga-de-modelos.mjs`): a 2ª carga sai do Cache Storage sem rede. Verificar:
      bytes da rede por par no relatório e o texto do aviso de download conferindo com `mbDoDownload`.
- [ ] 5.5 **[R]** Portão 4, aparelho real: Android de entrada (~4 GB), iPhone ≥ 12 e Quest 3, sessão de 10 min com STT + MT locais
      (REQ-018: pico ≤ 1,2 GB no Android, 0 abas derrubadas no iPhone; p75 do MT ≤ 150 ms). Verificar: linhas com origem `medido`
      em `slo-captura.json`; sem elas, nenhum ganho de celular é declarado.

## 6. Publicar e ligar (só com os portões)

- [ ] 6.1 **[D]** Publicar os pares aprovados no R2 (`publicar-bergamot-no-r2.ts --seco` primeiro; depois sem `--seco`,
      segredo só no host) e definir `VITE_BERGAMOT_MODELOS_URL`. Verificar: a flag segue desligada e nada muda para as pessoas.
- [ ] 6.2 **[D]** Ligar a flag por etapa (desktop primeiro; celular só após 5.5), acompanhando a taxa de falha e o p75 de campo
      (quando `rum_latencia` estiver ligada). Verificar: reversão ensaiada (flag off; depois URL vazia).
- [ ] 6.3 Atualizar `docs/LANCAMENTO.md` (passo 8), `docs/alternativas-de-custo-e-eficiencia.md` (seção de MT local) e o relatório
      em `docs/auditoria/`. Verificar: `npm run lint`, `npm run typecheck` e `npm test` verdes na CI (não rodados nesta proposta).

## Notas da implementação (2026-11-21) — parte não bloqueada

Medido no laboratório (desktop, pt→en, Bergamot atual × opus-mt, 10 rodadas, diferença pareada com IC 95%):

- latência p50 por frase 13 ms × 87 ms (−74 [−74, −74]); p75 14,5 × 101 ms;
- RSS de pico 974 MB × 1.587 MB (−613 MB [−625, −603]); download frio 30,9 MB;
- chrF++ (Bergamot − opus-mt): fleurs pt-en +4,14 [2,39; 5,83]; es-en +0,30 [−1,60; 2,36] (empate);
  fleurs en-pt +5,38 [3,58; 7,10] e gold en-pt −0,83 [−4,48; 3,17] — en→pt segue PROIBIDO ao Bergamot até o teste
  cego pt-BR (risco pt-PT). COMET pendente (exige instalar `unbabel-comet` + ~2,3 GB).
  Parciais: 1.1 (critério escrito, não commitado: não houve A/B de latência na captura), 4.1 (só chrF++), 4.2 (só pt/es→en),
  4.3 (ferramenta do teste cego pronta, sem avaliadores), 5.3/5.4 (pares X→en não estão no R2).
  Bloqueadas: 1.2/4.4/6.x [D]; 5.1/5.2 dependência nova (runtime da Mozilla) — precisa de aprovação; 5.5 [R]; publicação
  no R2 recusada pelo script até `aprovadoPeloDono`.
  Relatório: `docs/auditoria/2026-11-21-traducao-local-por-direcao.md`. Migrações PG 0026 / SQLite 0068.
