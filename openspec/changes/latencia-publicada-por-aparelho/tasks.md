## 1. Simulação e agregador (a mais arriscada primeiro: o número ser honesto)

- [x] 1.1 Simulador de lotes `v: 2` sintéticos (`tests/harness/`) e função pura `agregarLatencia` em `src/core/` (soma de baldes,
      p50/p75 pelo limite do balde, taxa de falha, piso `N_MIN`). Verificar: teste com distribuições conhecidas (erro <= meio
      balde); célula com 199 falas sai `insuficiente` e com 200 `ok`; o p75 NÃO é a média de p75 de dois lotes.
- [x] 1.2 Leitor das duas fontes (Prometheus `/metrics` e SQL do Analytics Engine) atrás de uma interface, com o SQL do runbook
      §3.2. Verificar: teste com respostas gravadas das duas fontes produzindo o mesmo `latencia.json`.
- [x] 1.3 `scripts/producao/publicar-latencia.mjs` com `--dry-run` e validação do contrato (`v: 1`, listas fechadas, sem campo
      extra). Verificar: dry-run contra dump local, saída conferida contra a consulta manual.

## 2. Superfícies (atrás da flag)

- [x] 2.1 Flag `latencia_publicada` (migração PG e SQLite como as outras flags; nasce desligada) e leitura do arquivo em
      `src/data/rotas/`. Verificar: teste de flags; com a flag desligada, nenhuma requisição ao arquivo.
- [x] 2.2 Selo no app (perto do Iniciar da captura e do `ModelPrepPanel`), textos em `en`/`es`/`ar` e `npm run i18n`. Verificar:
      teste de componente (célula `ok`, `insuficiente`, falha de rede = sem selo, leitor de tela) e portões de i18n.
- [x] 2.3 Página `/desempenho` em `scripts/site/` (definição da métrica, ressalvas, tabela). Verificar: teste do gerador do site
      e `npm run build`; a página some do sitemap com a flag desligada ou sem dados.
- [x] 2.4 Painel do dono no admin (p95 só com `n` >= 1.000, carga de modelo por fase, taxa de falha). Verificar: teste de
      componente com `latencia.json` fixo.
- [x] 2.5 Revisão do texto pela skill `copy-br-etica` (sem promessa, urgência nem "garantido"). Verificar: frases aprovadas
      anexadas em `docs/`.

## 3. Operação

- [x] 3.1 Workflow semanal (cron) que roda o agregador e publica o arquivo. Verificar: `scripts/validar-workflows.mjs`, os
      testes que leem o YAML e uma execução manual no staging.
- [x] 3.2 Seção no `docs/runbook.md` (gerar, reverter: desligar a flag e apagar o arquivo) e linha em `docs/flags.md`. Verificar:
      `npm run lint` e leitura cruzada com §3.2.

## 4. Dados reais e decisão

- [ ] 4.1 **[D]** Parecer de privacidade sobre ligar `rum_latencia` em produção e sobre publicar o agregado (o mesmo parecer de
      `roteador-adaptativo-em-sombra` 5.2). Verificar: parecer anexado em `docs/auditoria/`.
- [ ] 4.2 **[D]** Criar o token de leitura do Analytics Engine como segredo do Action (nunca versionado). Verificar: o dry-run do
      agregador lê a fonte de staging.
- [ ] 4.3 **[R]** Triagem no staging: ligar `rum_latencia` e rodar a captura em um celular bom e um fraco reais. Verificar: as
      células das duas classes aparecem no dry-run com `n` crescendo e o selo mostra o mesmo valor da consulta manual.
- [ ] 4.4 **[D]** Ligar `latencia_publicada` em produção depois de uma semana com >= 6 células `ok`. Verificar: `flags listar`,
      selo visível num aparelho real e `/desempenho` publicado.

## Notas da execução (Onda 2, 25/11)

- Decisão assumida: recomendação da decisão 36 de `docs/backlog/decisoes-do-dono.md` (token de leitura como segredo do Action;
  ligar `latencia_publicada` só após uma semana com 6 ou mais das 15 células `ok`), 25/11. Decisão 5 (parecer único): assumida a
  recomendação (manter `roteador` só no staging); o parecer em si segue [D] aberto (4.1).
- Migrações PROVISÓRIAS: PG 0035 e SQLite 0075 (`flag_latencia_publicada`); o integrador renumera.
- 1.1: o piso exige `n >= 200` falas E 200 legendas medidas (célula só de falhas não publica). A linha `todos` por classe é a soma
  de baldes das células (nunca média de p75) e alimenta o selo quando o idioma não tem célula `ok`.
- 1.2: as respostas "gravadas" dos testes são montadas dos mesmos lotes sintéticos (`tests/harness/simuladorDeLatencia.ts`); a
  conferência contra o Prometheus e o Analytics Engine reais fica para 4.2/4.3.
- 2.1: o app só pede o arquivo com `latencia_publicada` E `rum_latencia` ligadas; URL por `VITE_LATENCIA_URL`.
- 2.2: selo em `EscolhaDoMicrofone` (folha do início) e `PainelDoPreparo` (`ModelPrepPanel`); textos en/es/ar no catálogo.
- 2.3: `/desempenho` sai só com a flag em `SITE_FLAGS_DE_VENDA`, `SITE_LATENCIA_ARQUIVO` válido/fresco e uma célula `ok`.
- 2.4: sem aba nova: seção no Resumo do admin. p95 (>= 1.000 falas) e carga por fase vêm de um arquivo PRIVADO
  (`latencia-dono.json`, `VITE_LATENCIA_DONO_URL`); sem ele o painel usa o público e avisa. Onde hospedar o privado atrás de
  acesso é decisão do dono.
- 3.1: `publicar-latencia.yml` (cron semanal); upload ao R2 só com `LATENCIA_PUBLICAR=1`. A execução manual no staging fica para 4.2.
- 2.5: frases aprovadas em `docs/auditoria/2026-11-25-copy-da-latencia-publicada.md`.
- Abertas: 4.1 [D] parecer; 4.2 [D] token; 4.3 [R] aparelhos reais; 4.4 [D] ligar em produção.
