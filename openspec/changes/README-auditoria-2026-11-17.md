# Ordem de execução: changes da auditoria de qualidade de 17/11/2026

Origem: auditoria multiagente de 17/11/2026, com os achados conferidos por um revisor. Os achados estão em
`reports/auditoria-qualidade/achados.json` e as evidências nas subpastas por frente. A pasta é local, fica na worktree
`pendencias-ao-alcance` e não é versionada. Cada change tem `proposal.md` (prioridade, esforço, riscos, o que precisa do
dono), `design.md`, `specs/*/spec.md` (critérios medidos, com o script ou teste que mede) e `tasks.md`. Nada foi
implementado.

| #   | Change                         | Prioridade                     | Esforço                | Achados                             | Precisa do dono                                                                                                     |
| --- | ------------------------------ | ------------------------------ | ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `legenda-segura-para-menores`  | P0                             | médio (2–3 d)          | COMP-02                             | listas, categoria `palavrao` para menor de 12, travar no protegido                                                  |
| 2   | `traducao-sem-rota-no-celular` | P0 (rota e linha honesta) / P1 | médio (3–4 d)          | CEL-01, CEL-08, COMP-03, CONV-06    | `VITE_BERGAMOT_MODELOS_URL` e pares no R2 de produção; texto do aviso                                               |
| 3   | `modelos-confiaveis-e-offline` | P1                             | médio a grande (5–7 d) | DISP-01, 02, 03, 04, 05, 06, LB-06  | credencial do R2 e variáveis; UptimeRobot; forma da observabilidade; beacon do Cloudflare; aprovar o service worker |
| 4   | `conversa-de-verdade`          | P1                             | médio a grande (6–8 d) | CONV-01, 02, 03, 04, 07, 08, 09, 11 | download maior no celular; STT em nuvem no Intérprete para quem paga; gravar falas reais                            |
| 5   | `carga-rapida-no-celular`      | P1 (1º texto: P2)              | médio a grande (5–7 d) | LB-01, LB-02, LB-03, CEL-03, CEL-04 | base `local-darwin` no SLO; limite de 20 MB; legenda do navegador para o adulto                                     |

## Ordem recomendada e por quê

1. **`legenda-segura-para-menores`**: risco de conformidade (ECA Digital) já visto em produção. Não depende do dono para
   começar (só para aprovar as listas) e não conflita com as outras.
2. **`traducao-sem-rota-no-celular`**: o par mais usado por quem viaja não funciona e a tela finge que traduziu. Muda
   `traducaoDaFala.ts`, que escreve pelo setter que a change 1 envolve: fazer depois dela.
3. **`modelos-confiaveis-e-offline`**: começar pelas partes sem dependência do dono (mensagens humanas e cura do cache),
   em paralelo com a 2, porque os arquivos são outros. O espelho no R2 também barateia a 2 (Bergamot e opus-mt do mesmo
   bucket).
4. **`carga-rapida-no-celular`**: a entrada enxuta (`App.tsx`) é independente e pode correr em paralelo com a 3. O
   progresso honesto do download toca `ModelPrepPanel.tsx`, então vem depois do cartão da change 2.
5. **`conversa-de-verdade`**: a maior e a que mais mexe no pipeline (`pipelineDeFala.ts`, Intérprete). Vai por último
   para não disputar arquivos com a 2 e a 5. Os bugs de atribuição (dono gravado, trecho com direção) podem ser
   adiantados, porque são pequenos e isolados.

Regras: changes que tocam `pipelineDeFala.ts`, `traducaoDaFala.ts` ou `ModelPrepPanel.tsx` não rodam em paralelo. Toda
change termina com as rodadas da auditoria repetidas contra o staging, e os números vão no PR.
