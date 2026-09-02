# Suíte e2e (Playwright)

## Como rodar

```bash
npm run test:e2e        # roda a suíte inteira (headless, Chromium)
npm run test:e2e:ui     # abre o modo UI do Playwright (útil para debugar)
```

O `playwright.config.ts` sobe o app sozinho (`npm run dev:local`, porta 3100, sem login) via
`webServer` e espera responder antes de começar. Se você já tem `npm run dev:local` rodando num
terminal, o Playwright reaproveita esse servidor (`reuseExistingServer`, fora de CI) em vez de
subir um segundo — não precisa parar o seu.

## Por que esta suíte é mínima

Esta é a **primeira** suíte e2e do projeto. As dependências (`@playwright/test`, `playwright`,
`@axe-core/playwright`) já estavam instaladas, mas não havia `playwright.config.ts` nem uma pasta
`e2e/` — a verificação de UI da casa sempre foi feita por inspeção manual via **Chrome DevTools
MCP** (`new_page`, `take_snapshot`, `evaluate_script`, `take_screenshot` — ver
`docs/HANDOFF-PROXIMA-SESSAO.md`).

Uma suíte nova, robusta e sólida vale mais do que uma ambiciosa e frágil. Por isso `fumaca.e2e.ts`
cobre só o que **existe e está estável hoje**:

- a casca do app carrega (sem tela em branco, sem exigir login);
- a navegação principal aparece com os rótulos reais do perfil padrão (sênior —
  `src/lib/profile.ts`, decisão "leitura ampliada como padrão");
- clicar em "Praticar" leva à tela de jogos (`/jogar` — `src/lib/rotas.ts`) e ela renderiza.

Os seletores usam papel/acessibilidade (`getByRole`) e nunca CSS de classe, para não quebrar a
cada ajuste de estilo.

## Baralhos do Anki (`baralhos.e2e.ts`)

Cobre o caminho de ingestão de baralhos Anki, que amadureceu depois de `fumaca.e2e.ts` ter sido
escrita. Sem criar dado (não faz upload de `.apkg`/`.txt` pelo teste — leria o que já estiver no
ambiente):

- **Sempre verificável**: o lobby (perfil sênior, `/jogar`) tem o botão "Anki"; clicar nele abre a
  tela de importação (`BaralhoAnki.tsx` — botão "Escolher arquivo"); "Voltar aos jogos" retorna ao
  lobby.
- **Condicional a já existir baralho importado**: o botão "Baralhos" só existe na faixa quando
  `listarBaralhosAnki()` devolve ao menos um baralho (`Play.tsx`, `temBaralhosAnki`). Quando ele
  não existe no ambiente, os dois testes que dependem dele chamam `test.skip()` com a razão —
  nunca fingem passar. Quando existe: abrir "Baralhos" mostra o cabeçalho da tela
  "Baralhos do Anki", e o cartão do baralho expõe "Jogar só com este" (se há nota ativa) ou o
  saldo "N de M ativadas". Clicar em "Jogar só com este" volta ao lobby com o nome do baralho na
  faixa (substituindo o rótulo genérico "Baralhos").
- Um diálogo de recompensa/conquista (`RecompensaDesbloqueada.tsx`) pode aparecer sobreposto,
  às vezes em fila (uma recompensa por vez, cada uma animando com atraso) — o teste fecha por
  `aria-label="Fechar"` quantas vezes for preciso antes de interagir com o lobby.

Rodado de verdade contra o ambiente local (sem baralho importado nele): 3 passaram (casca +
Anki), 2 pulados com a razão de ausência de baralho — nunca "verde forçado".

## O que esta suíte NÃO cobre (de propósito)

- **Captura de áudio, jogos individuais, SRS, loja/créditos**: fluxos reais, mas que dependem de
  estado (gravação existente, XP, sessão) — fora do escopo de um teste de fumaça. Merecem specs
  próprias quando o fluxo estiver maduro.
- **Verificação visual/exploratória de UI**: continua sendo feita por MCP chrome-devtools
  (`take_snapshot`, `take_screenshot`), como sempre foi nesta casa. Esta suíte é a **rede de
  segurança do caminho feliz** — prova que a casca e a navegação básica não quebraram —, não um
  substituto para a inspeção visual.

## Convenção de arquivos

- `*.e2e.ts` nesta pasta → Playwright (`testMatch` em `playwright.config.ts`).
- `tests/*.test.ts` (fora desta pasta) → Vitest (`npm run test`).

As duas suítes convivem em `tests/` sem colidir porque cada runner só enxerga o seu padrão.
