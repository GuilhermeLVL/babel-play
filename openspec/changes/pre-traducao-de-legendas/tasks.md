Legenda: **[D]** = ato ou decisão do dono; **[R]** = exige aparelho real.

## 1. Núcleo

- [x] 1.1 `src/core/traducao/preTraducaoDeLegendas.ts`: lotes, progresso, cancelamento, repetidas, falhas, legenda segura.
      Verificar: `tests/preTraducaoDeLegendas.test.ts`.

## 2. Adaptador local

- [x] 2.1 `src/gateway/preTraducaoLocal.ts`: só motores locais, confere o `engine`, sem opções de nuvem. Verificar:
      `tests/preTraducaoLocal.test.ts` (provedor de nuvem recusado; resposta de motor de nuvem descartada; nenhuma rede).

## 3. Flag

- [x] 3.1 Flag `pre_traducao_de_legendas`: PG 0032 e SQLite 0072 (numeração conferida contra a main), snapshots com `prevId`,
      journals, constante em `planos.ts`, `PainelFlags`, `docs/flags.md`, baseline. Verificar: nasce desligada.

## 4. Medição

- [x] 4.1 Tempo de 500 falas no Node com o motor local disponível (ver `docs/auditoria/2026-11-24-pre-traducao-de-legendas.md`).

## 5. Pendências

- [x] 5.1 Tela (`src/components/views/biblioteca/PreTraduzirLegenda.tsx`, dentro do painel de importar, atrás da flag): botão "Traduzir tudo no
      aparelho", aviso do download, progresso, cancelar, coluna bilíngue (textos i18n em en/es/ar). Layout simples, sem menu novo;
      o refinamento visual segue **[D]**. Verificar: `tests/preTraduzirLegenda.test.tsx`.
- [ ] 5.2 **[R]** Medir em celular real (opus-mt no Worker WASM): ms por fala e a tela responde durante o lote.
- [ ] 5.3 **[D]** Ligar a flag, depois do A/B de UX e da medição 5.2.
