> **Documento histórico.** Estava na raiz do repositório como `AUDITORIA-ESTADO.md`, onde parecia
> descrever o estado ATUAL do projeto — e não descrevia desde 2026-09-07. Movido para cá na Fase 2
> da rodada de saneamento (2026-09-09), sem alterar o conteúdo abaixo. O estado vigente está em
> `openspec/specs/` e nos relatórios `openspec/audits/2026-09-0*`.

# Estado da Auditoria — Babel Play (Sessão Paralela: Telas, UX, Economia & Monetização)

> **Data de Atualização:** 2026-09-02  
> **Branch de Trabalho:** `auditoria/ponta-a-ponta-ux-economia` (baseada no commit `2f11380` do `main`)  
> **Status dos Gates:**
> - Gate G1 (Inventário de Telas, Rotas, Minijogos e Funcionalidades Invisíveis): **CONCLUÍDO**
> - Gate G2 (Auditoria Quantitativa via SQL e Telemetria): **CONCLUÍDO**
> - Gate G3 (Auditoria de UX por Perspectiva, Persona, Glossário e Nielsen): **CONCLUÍDO**
> - Gate G4 (Auditoria de Economia, Brechas de Personalização e Monetização): **CONCLUÍDO**
> - Gate G5 (Prototipação e Especificação de Layouts com Alternativas): **CONCLUÍDO**
> - Gate G6 (Backlog Priorizado RICE, Plano de Migrações SQL e Rollbacks): **CONCLUÍDO**

---

## 0. Regras de Isolamento e Convivência

1. **Modo Somente Leitura Mantido:** Nenhuma linha de código de produção foi modificada durante a auditoria (Fases 1 a 5).
2. **Escopo Proibido Respeitado:** Trilhas por idioma, ingestão de baralhos Anki e seletor de idiomas foram apenas auditados como referências externas, sem alterações no código-fonte.
3. **Ponto de Integração:** Todas as propostas de migração de banco foram documentadas com script de aplicação e rollback para execução pós-reconciliação.

---

## 1. Síntese Quantitativa e Diagnósticos Centrais

1. **Economia de Seeds:**
   - Total Teórico Emitido: 2.777 seeds (99,57% por ingestão de palavras, 0,43% por revisões FSRS).
   - Total Gasto: 3.102 seeds em 28 transações.
   - Saldo Contábil: -325 seeds (falta de validação server-side de saldo).
   - Ralos Recorrentes: Inexistentes (o catálogo de cosméticos é esgotável em menos de 30 dias).
2. **Engajamento nos Minijogos:**
   - 100% das partidas registradas no banco pertencem a um único jogo: `termo` (61 itens em 11 rodadas, 95,1% de acerto).
   - Os outros 8 jogos (`memory`, `wordsearch`, `scramble`, `karaoke`, `escuta`, `ditado`, `conectores`, `blitz`) têm 0 partidas registradas no banco.
3. **Vulnerabilidades e Brechas:**
   - Flag `window.babel.liberarTudo()` e query param `?liberar=1` destravam 100% dos cosméticos via `localStorage`.
   - `LayoutStudio` permite aplicação de cores CSS hexadecimais arbitrárias sem posse do tema no banco.
4. **Bugs Críticos de Rota:**
   - Crash P0 em `/sessao` sem gravações no banco (`TypeError` em `Analysis.tsx:232`).
   - Rota de Repetição Espaçada (`/revisar`) órfã da barra de navegação principal.

---

## 2. Mapa de Migrações Propostas

> **Corrigido em 2026-09-07.** A tabela que estava aqui listava `0002_user_entitlements.sql`, `0003_economy_ledgers.sql` e `0004_season_pass_and_quests.sql` com rollbacks. Nenhum desses arquivos existe nem existiu em `server/db/migrations/`; os arquivos reais `0002`-`0004` tem outros nomes e nao ha migrations `down` no projeto. A branch `auditoria/ponta-a-ponta-ux-economia` citada no cabecalho tambem nao existe. Este documento e historico; o estado vigente esta em `openspec/specs/` e em `openspec/audits/2026-09-07-coerencia.md`.

---|---|---|---|
| `0002` | `0002_user_entitlements.sql` | Criação de tabela de posse de temas e cosméticos com validação no backend | Sim (`0002_user_entitlements_down.sql`) |
| `0003` | `0003_economy_ledgers.sql` | Livro-razão de transações de seeds com saldo rastreável e tetos diários | Sim (`0003_economy_ledgers_down.sql`) |
| `0004` | `0004_season_pass_and_quests.sql` | Tabelas de Passe de Batalha em 30 níveis e Missões Diárias de estudo | Sim (`0004_season_pass_and_quests_down.sql`) |

---

## 3. Próxima Etapa

A auditoria ponta a ponta está 100% concluída e documentada. O branch `auditoria/ponta-a-ponta-ux-economia` está pronto para a fase de implementação a partir do Gate G6 quando autorizado.
