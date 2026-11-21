Legenda: [R] depende de aparelho real; [D] depende do dono (parecer, aprovação, compra). Sem marca, roda neste Mac ou no CI.

## 1. Diagnosticar e consertar a bancada

- [x] 1.1 Diagnóstico (sem consertar): na rodada de `medir.mjs` gravar, para cada hipótese de design.md ("Diagnóstico do bipe"),
      o que a separa: `sonda:ok`/`sonda:erro`, estado do `AudioContext`, nº de janelas em `aud`, RMS máximo, maior razão a
      2 kHz, instante de cada `gum` contra `__LAT_ARMADO`, e se o arquivo WAV existe e é PCM. Rodar uma vez neste Mac e
      registrar o resultado em `docs/auditoria/2026-11-20-bancada-bipe.md`. Verificar: o relatório nomeia UMA causa com evidência, ou
      diz que nenhuma das três se confirmou e quais dados faltam.
- [x] 1.2 `analisar.mjs` e `metricas-captura.mjs`: trocar o "bipe não encontrado" único por motivos distintos (`sem-sonda`,
      `sem-audio`, `sem-2khz`, `bipe-antes-da-sonda`). Teste unitário com um `lat` sintético por motivo. Verificar:
      `npx vitest run tests/<arquivo-da-bancada>` verde e a rodada inválida imprime o motivo.
- [x] 1.3 Consertar a causa de 1.1 (armar a sonda antes de abrir o dispositivo falso, ou criar o contexto no gesto e esperar
      `running`, ou validar o WAV antes do lançamento; o conserto segue a evidência). Verificar: três rodadas seguidas de
      `medir.mjs` neste Mac saem VÁLIDAS (âncora achada) e a repetição não muda o instante do bipe em mais de 20 ms.
- [x] 1.4 Rodada inválida nunca vira número: `rodar-matriz.mjs` e `comparar.mjs` recusam resultado com rodada inválida e dizem o
      motivo. Verificar: teste com um resultado sintético inválido sai com código 1.

## 2. Marcas e métrica (sem mudar comportamento)

- [x] 2.1 `marcasDeDesempenho.ts`: nomes e tipo do `detail` das marcas novas (`fala:fim`, `legenda:traduzida`,
      `modelo:{download,compilacao,aquecimento}:{inicio,fim}`) e limpeza das marcas consumidas. Teste: nenhuma marca aceita campo de
      texto (o tipo do `detail` não tem `string` livre além de `modelo` e `origem` de lista fechada).
- [x] 2.2 `frasy:fala:fim` no ponto do último quadro de voz do VAD (`systemAudio.ts`/`pipelineDeFala.ts`), com o `id` do balão.
      Verificar: teste de pipeline com áudio sintético mostra a marca no instante do último quadro de voz, não no da decisão.
- [x] 2.3 `frasy:legenda:traduzida` no `requestAnimationFrame` depois do commit da tradução final do balão, com `origem`.
      Verificar: teste de componente mostra a marca uma vez por balão, e nenhuma para parcial, fala sem tradução ou falha.
- [x] 2.4 `captureMetrics`: acumular `fimDaFalaAteLegendaMs` por fala (sem texto, teto de 200), `falhas` e `semTraducao`, e
      o tempo de carga por modelo e fase. Verificar: teste com falas de cache, nuvem, sem tradução e com erro dá as contagens da
      definição (D1).
- [x] 2.5 Marcas de carga por fase nos adaptadores (`whisperLocal`, Parakeet, Moonshine, `opusMtLocal`, `bergamotLocal`): download
      (bytes até o cache), compilação (criação da sessão ou do worker), aquecimento (1ª inferência descartada). Só marcas.
      Verificar: teste de cada adaptador vê as 3 fases em ordem, com o modelo da lista fechada.
- [x] 2.6 Overhead: teste que mede o custo por marca (`performance.now` em volta, 10 000 chamadas) e falha acima de 0,2 ms p95
      por chamada; sessão sintética de 200 falas retém ≤ 50 KB. Verificar: `npx vitest run` do arquivo.

## 3. A bancada mede a nova métrica

- [ ] 3.1 `sonda.js` lê as marcas `frasy:fala:fim` e `frasy:legenda:traduzida` junto das existentes e as devolve no resultado.
- [ ] 3.2 `analisar.mjs` calcula `fimDaFalaAteLegendaMs` por fala com o `fim da voz no arquivo` (verdade da bancada) e com a
      marca de campo, e imprime p50/p75/p95, `falhas` e `semTraducao` por perfil e idioma. Verificar: teste com `lat` sintético de
      resultado conhecido.
- [ ] 3.3 `metricas-captura.mjs`: a métrica entra no resultado do perfil (`fimDaFalaAteLegendaMs.{p50,p75,p95}`) e em `tabela.mjs`.
- [ ] 3.4 Validação do marcador: em 3 rodadas válidas, o erro entre o `t_fim` de campo (VAD) e o fim da voz no arquivo, fala a fala,
      tem mediana e p95 ≤ 50 ms (critério de E-001). Verificar: o relatório da rodada traz o erro; se passar de 50 ms, o campo é
      declarado "VAD → tela" e o relatório diz isso.
- [ ] 3.5 Overhead medido na bancada: A = build sem as marcas, B = com elas (`intercalar.mjs`, ≥ 10 rodadas por lado); diferença
      pareada da métrica ≤ 5 ms (IC 95%), `framesLongos` e CPU no silêncio dentro das tolerâncias. Verificar: relatório em
      `docs/auditoria/`.
- [ ] 3.6 `ab.mjs`: diferença pareada por fala de p50/p75/p95 com IC 95% por bootstrap (10 000, semente fixa), recusa A/B com menos
      de 10 rodadas válidas por lado ou sem `criterio.md`. Verificar: teste com dados sintéticos de efeito conhecido (IC contém o
      efeito) e de efeito nulo (IC contém 0).

## 4. Linha de base oficial

- [ ] 4.1 `slo-captura.json`: métrica `fimDaFalaAteLegendaMs.{p50,p75,p95}` (`sentido: menor`, tolerância e folga) e campo `origem`
      (`medido`/`emulado`), `aparelho`, `commit`, `data` por perfil; `validarSlo` exige `origem`. Verificar: `comparar.mjs` valida o
      arquivo e o workflow `desempenho` continua passando (rodar os testes que leem o YAML se o workflow mudar).
- [ ] 4.2 Rodada de base neste Mac (`local-darwin`), N ≥ 10 válidas por perfil de desktop e o fraco simulado (este marcado
      `emulado`), regravada com `comparar.mjs --gravar-linha-de-base`; substitui os números provisórios do 1º texto. Verificar: a
      base nova reprova uma rodada com a tradução atrasada de propósito.
- [ ] 4.3 [D] Aceite do dono da linha de base (quem aprova a base é quem a commita) e relatório
      `docs/auditoria/2026-11-<dia>-linha-de-base-da-legenda.md`.
- [ ] 4.4 Tempo de carga: relatório com download/compilação/aquecimento por modelo (STT: Whisper tiny/base, Moonshine, Parakeet; MT:
      opus-mt, Bergamot), com cache frio e quente, no desktop. `docs/slo.md` ganha a seção da métrica.
- [ ] 4.5 [R] Rodada nos aparelhos reais (Android ~4 GB, iPhone ≥ 12, Quest 3) preenchendo a matriz; enquanto isso, as linhas ficam
      `emulado`. Verificar: nenhuma meta de celular/Quest é declarada cumprida com `origem: emulado`.

## 5. Telemetria de campo (atrás de flag desligada)

- [x] 5.1 Flag `rum_latencia`: migrações PG 0023 e SQLite 0065 (semente idempotente `ON CONFLICT DO NOTHING`, sem regra de
      plano, reversão `DELETE FROM flags`), snapshots, journals, `PainelFlags`, `docs/flags.md`, teste de baseline
      (`tests/integration/schema-pg-baseline.test.ts`). Verificar: a flag nasce desligada e o teste de flags passa.
- [ ] 5.2 Cliente: o lote `v: 2` só é montado com a flag ligada, `podeEnviar()` verdadeiro E perfil NÃO protegido; desligada, sai
      só o `v: 1` como hoje. Verificar: teste em grade (flag × consentimento × conta × menor × perfil protegido): só
      "ligada + consentimento + conta + não protegido" envia.
- [x] 5.3 Contrato `v: 2` em `server/routes/metricasCaptura.ts`: classe, idioma, motor e fase de lista fechada; baldes e contagens
      grampeados; `v: 1` segue válido. Verificar: teste com valor inventado (classe, idioma, motor) vira `outro` ou 400 e NÃO cria
      série; teste do corpo do payload sem campo de texto, id ou hora.
- [x] 5.4 `server/http/metricas.ts`: `captura_fim_da_fala_ate_legenda_ms{classe,idioma}` e `captura_carga_modelo_ms{classe,modelo,fase}`.
      Verificar: dois lotes de classes diferentes dão 2 séries e o scrape nunca tem id nem texto; `/metrics` desligado continua 404.
- [x] 5.5 Worker: verificar se o Analytics Engine está ligado; se sim, família `captura_latencia` (índice = classe), senão registrar em
      `docs/runbook.md` que o campo só existe no Express/self-host. Verificar: decisão registrada com a evidência.
- [x] 5.6 `docs/runbook.md`: como consultar o p75 por classe e a taxa de falha.
- [ ] 5.7 [D] Parecer de privacidade (LGPD art. 14, ECA Digital, política vigente) sobre o evento e sobre menores. BLOQUEANTE:
      sem ele, `rum_latencia` NÃO é ligada em produção. Se exigir consentimento do responsável, o campo fica só para adultos (ou
      some) e o laboratório segue só com a bancada.

## 6. Protocolo do laboratório

- [ ] 6.1 `docs/auditoria/protocolo-do-laboratorio-de-latencia.md`: o "Protocolo do laboratório" do design.md em forma de passo a
      passo com os comandos (`medir.mjs`, `intercalar.mjs`, `ab.mjs`, `comparar.mjs`), o modelo de `criterio.md`, a pasta de
      resultados, a matriz de aparelhos e a regra do "emulado".
- [ ] 6.2 Ensaio do protocolo: um A/B real e barato (ex.: a tolerância do próprio overhead de 3.5) seguindo o documento do começo ao
      fim. Verificar: quem não participou consegue repetir só com o documento (reler os comandos).
- [ ] 6.3 `openspec validate lab-medicao-legenda-traduzida`, `npm run typecheck`, `npm run lint`, `npx vitest run` dos arquivos
      tocados e `npx knip` sem export novo sem uso.

## Notas da implementação (fase 1, 2026-11-21)

- 1.1/1.3: nenhuma das três hipóteses do design se confirmou. A causa real: com `--eu en-US` a interface fica em inglês e
  `medir.mjs` procurava o botão "Iniciar captura" em português; a rodada morria antes de armar a sonda. Corrigido o botão;
  3 rodadas válidas seguidas, bipe a 4052–4064 ms (variação 12 ms). Relatório: `docs/auditoria/2026-11-20-bancada-bipe.md`.
  Pendência fora do escopo: o título em inglês ("Ready to caption") e, em `--modo mic`, a página fecha ~10 s após o clique.
- 2.1: `modelo` é string com o id constante do código (não união fechada); o servidor reduz valor fora da lista a `outro`.
- 2.1/2.6: as marcas não são apagadas ao serem lidas, só acima de 200 (a bancada lê no fim). A limpeza "ao consumir" entra
  na fase 2, quando `sonda.js` passar a consumir as marcas (3.1).
- 2.5: o worker do opus-mt não tem aquecimento (fase com duração 0); Parakeet abre sessões arquivo a arquivo (compilação
  começa no último download).
- 5.3: a carga de modelo usa os mesmos 9 baldes da legenda (até "acima de 10 s"), resolução baixa para download grande.
