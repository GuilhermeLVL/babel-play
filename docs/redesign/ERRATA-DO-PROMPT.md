# ERRATA — LEIA ANTES DO RESTO DESTE ARQUIVO

> **Aceita pelo dono em 2026-09-11.** A seção 1 deste prompt descreve, em boa parte, as
> deficiências do **PROTÓTIPO**, não as do app. Cada afirmação abaixo foi medida no código desta
> branch. **Se o corpo do prompt discordar desta errata, vale a errata.**
>
> Quem relê este arquivo depois de uma compactação de contexto: as premissas marcadas
> **INVÁLIDA** já foram refutadas com `arquivo:linha`. Não as reintroduza como lacunas.

## Premissas corrigidas

| O prompt diz           | Correto                                                    | Evidência                                            |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Back em FastAPI/Python | **Express 4 + TypeScript**                                 | `server.ts`, `server/`, `package.json` dep `express` |
| —                      | Front React 19 + **Tailwind CSS 4** (`@tailwindcss/vite`)  | `package.json`, `src/index.css:2`                    |
| —                      | Testes: Vitest (unitários) + Playwright em **3 viewports** | `vitest.config.ts`, `playwright.config.ts:41-60`     |

## P0 da seção 1 marcadas INVÁLIDAS

| #   | Afirmação do prompt                                                                     | Veredito                                                 | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "**Não existe design system formal**: tudo é estilo inline"                             | **INVÁLIDA para o app** (verdadeira só para o protótipo) | Camada de tokens semânticos em `src/index.css:5-107`: `--canvas`, `--surface`, `--ink`, `--ink-muted`, `--ink-faint`, `--accent`, `--accent-soft`, `--accent-ink`, `--good`, `--warn`, `--rare`, `--error`, `--border-subtle`, `--font-display/body/mono`, raios e sombras. Ponte `@theme` do Tailwind 4 em `src/index.css:4` — os utilitários nunca carregam hex. **8 temas de cor** por `data-theme` (`src/lib/theme.ts:107`, `:87`) e **8 temas de fonte** por `data-fonte` (`src/lib/appearance.ts:48`). |
| 2   | "**Contraste reprovado** (WCAG 2.2 AA, recalcule)"                                      | **INVÁLIDA para o app**                                  | `tests/contrastePaletas.test.ts` mede os pares de token em **7 temas × claro/escuro** com limiar 4,5:1 e roda no `test:unit`. Os pares incluem `['accent-ink','canvas']` e `['accent-ink','surface']` (`:51-77`). Os hex reprovados que o prompt cita (`#8C867C`, `#F04E23` como texto) são do **protótipo**.                                                                                                                                                                                                |
| 3   | "**Acessibilidade ausente**: zero `aria-*`, zero foco, 47 `div` com `onClick`"          | **INVÁLIDA para o app**                                  | Descreve o protótipo. O app tem `role`/`aria-*` em uso (ex.: `shell/MobileNav.tsx:19` `aria-label="Navegação principal"`, tablist em `Analysis.tsx:717`), pilha de `Esc` (`src/lib/camadasDeEscape.ts:18`) e Ctrl+K (`CommandPalette.tsx:192`). **Era verdade que faltava a11y AUTOMATIZADA** — corrigido nesta rodada: `@axe-core/playwright` + `tests/e2e/acessibilidade.e2e.ts`.                                                                                                                          |
| 4   | "Zero `@media`: frame fixo de 1360×860"                                                 | **INVÁLIDA para o app**                                  | Dock mobile própria (`shell/MobileNav.tsx:19`, `md:hidden`), barra/rail em 4 posições (`StudioHeader.tsx:51`), E2E em 375/768/1280 (`playwright.config.ts:41-60`).                                                                                                                                                                                                                                                                                                                                           |
| 5   | "Ícones vêm de CDN"                                                                     | **INVÁLIDA**                                             | `lucide-react` via npm (`package.json`). Nenhum CDN de ícone no app.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6   | "O protótipo lista 18 jogos; **compare com os adapters que realmente existem**"         | **Comparado: os 18 existem**                             | `MinigameId` em `src/core/minigames/types.ts:18-21`; `MINIGAMES: Record<MinigameId, MinigameDef>` em `:147-181` (um por linha); mapa id→componente em `src/components/views/play/telaDoJogo.ts:17-35`; lista derivada que o servidor consome em `src/core/minigames/revelavel.ts:301`. **Nenhum jogo a implementar — a P3 do prompt é vazia.**                                                                                                                                                               |
| 7   | "Toasts 'em breve' contradizem a regra" e "**links mortos** com `href="#"`"             | **INVÁLIDAS para o app**                                 | Zero "em breve" em string de interface (as 19 ocorrências em `src/` estão dentro de comentários que documentam a remoção); zero `href="#"` ou vazio — `Sobre.tsx:27` tem guarda que não renderiza link sem destino.                                                                                                                                                                                                                                                                                          |
| 8   | "**Dados de mentira**"                                                                  | **INVÁLIDA como lacuna do app**                          | Já travado por `tests/semConteudoFabricado.test.ts` e `tests/contagemHonesta.test.ts`. Os dados falsos listados são do protótipo (ver `DESIGN-SPEC.md` §7.2).                                                                                                                                                                                                                                                                                                                                                |
| 9   | "Vocabulário usa New/Learning/Review; o app tem FSRS-5 real, **que inclui Relearning**" | **INVÁLIDA nos dois lados**                              | O agendador é de **estado contínuo** — `stability`, `difficulty`, `reps`, `lapses` (`src/core/learning/scheduler.ts:20-35`); "novo" é `stability === undefined` (`:109`). `relearning` não existe em `src/` nem em `server/`.                                                                                                                                                                                                                                                                                |
| 10  | "**Fontes vêm de CDN**, o que conflita com a promessa offline"                          | **VERDADEIRA — e corrigida**                             | Era real (`src/index.css:1`, 14 famílias do Google). Self-hospedadas via `@fontsource` nesta rodada; travado por `tests/fontesSemCdn.test.ts`.                                                                                                                                                                                                                                                                                                                                                               |

## P1/P2 da seção 6 que já existiam no app

Sessão com 4 abas (`Analysis.tsx:717-752`) e modal Exportar (`:703`); Loja com 4 abas
(`Loja.tsx:482-485`); Perfil com 3 abas (`Perfil.tsx:56`); busca Ctrl+K
(`BuscaGlobal.tsx` sobre `CommandPalette.tsx`); iChat em 3 estados (`App.tsx:400`); menu de conta
(`shell/MenuDaConta.tsx:95-158`); gaveta de Capturar, Foco Cheio, Bingo, Falantes
(`LiveCapture.tsx:1586`, `:2491`, `:2299`, `:2374`); Ajustes com 4 abas (`Settings.tsx:57-62`);
Importar com 4 fontes (`Library.tsx:619`); lobby facetado, Sala de Escolha, Recordes
(`Play.tsx:2988`, `:2733`, `:3355`); ranking global real (`server/routes/rank.ts:29-92`).

**Só Antessala e Raspadinha são `novo` de verdade** — e as duas já têm o dado pronto
(`montarRodada` devolve `previa` em `rodada.ts:89-93`; a economia é real).

## O que de fato sobrou como lacuna

Ver `LACUNAS.md`, reescrito a partir de medição. A matriz completa está em `PARIDADE.md`:
**27 `coberto`, 33 `gap-design`, 2 `novo`** — o protótipo cobre menos da metade do app.

---
