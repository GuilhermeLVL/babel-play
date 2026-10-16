# Acessibilidade automática das telas do lançamento (15/10/2026)

Branch `test/acessibilidade-axe`, worktree `C:\Users\Guilh\dev\ei-acessibilidade`. Nada de interface ou
CSS foi alterado: este relatório registra o que a varredura achou e o que corrigir.

## O que se mede

A mesma varredura de Início e Ajustes (`tests/e2e/fundacao.e2e.ts`), agora num helper só,
`tests/e2e/_acessibilidade.ts`: `axe-core` injetado direto (sem `@axe-core/playwright`), tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, só impacto **sério** ou **crítico**, a marca
(`.font-marca`) de fora (a WCAG 1.4.3 isenta logotipos), e a tela varrida **parada** (as animações finitas
terminadas, as recompensas da chegada fechadas).

- `tests/e2e/acessibilidade.e2e.ts`, no computador (`desktop-1280`) e no celular (`mobile-375`): Capturar,
  Intérprete, Biblioteca, Cartões, Jogar, Planos, Perfil, Perfil na aba "Seus dados" (a conta),
  `/privacidade.html` e `/termos.html`. As rotas vêm de `src/lib/rotas.ts` (`SEGMENTO`); as páginas legais
  são os arquivos de `public/`, servidos na raiz. Cartões, Jogar e Biblioteca abrem com conteúdo (as
  fixtures `semearCartoes` e `semearSessaoComCartoes`). O tablet não roda: tem as telas do computador.
- `tests/e2e-publico/acessibilidade-porta.e2e.ts`, no modo público (`playwright.publico.config.ts`), no
  computador e no celular: a porta de entrada nos três modos (Entrar, Criar conta, Recuperar senha). Ela
  mora lá porque na suíte comum o login não monta (`dev:local` força `VITE_AUTH_REQUIRED=0`).

Caso que viola hoje é `test.fixme` **só no projeto em que viola**, com a violação como motivo; nos outros
projetos a mesma tela é teste normal e barra a regressão.

## Resultado

| Tela                       | Computador               | Celular   | Violação (regra do axe, seletor, contraste)                                                                                                                                                               |
| -------------------------- | ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Início, Ajustes (fundação) | passa                    | passa     | —                                                                                                                                                                                                         |
| Capturar                   | passa                    | passa     | —                                                                                                                                                                                                         |
| Intérprete                 | passa                    | passa     | —                                                                                                                                                                                                         |
| Biblioteca                 | **fixme**                | passa     | `color-contrast` em `.q-sobre.fs-bib-sobre` ("2 gravações · 6 min · 39 palavras", 12 px, 700): `#ae300e` sobre `#d9d5c8` = **4,42:1** (pede 4,5:1)                                                        |
| Cartões                    | **fixme**                | passa     | `color-contrast` em `.q-aba .n` (a contagem "18" da aba, 14 px, 700): `#777368` sobre `#ddd8ca` = **3,32:1** (pede 4,5:1)                                                                                 |
| Jogar                      | passa                    | passa     | —                                                                                                                                                                                                         |
| Planos                     | passa                    | passa     | —                                                                                                                                                                                                         |
| Perfil (aba Você)          | passa                    | passa     | —                                                                                                                                                                                                         |
| Perfil, aba "Seus dados"   | **fixme** (intermitente) | passa     | `color-contrast` em `.q-sobre` ("Sua conta", 12 px, 700), logo após trocar de aba: `#ae300e` sobre `#d9d5c8` = **4,42:1** (ver a causa 1)                                                                 |
| `/privacidade.html`        | **fixme**                | **fixme** | `color-contrast` em `.kicker`, `p:nth-child(30) > a`, `a[href="/"]`, `a[href$="termos.html"]`: `#7c5cff` sobre `#fafaf8` = **4,15:1**                                                                     |
| `/termos.html`             | **fixme**                | **fixme** | `color-contrast` em `.kicker`, `p:nth-child(9) > a[href$="privacidade.html"]`, `li:nth-child(3) > a[…]`, `p:nth-child(35) > a`: `#7c5cff` sobre `#fafaf8` = **4,15:1**                                    |
| Porta: Entrar              | **fixme**                | **fixme** | `color-contrast` em `.qen-rotulo > .qen-link` ("Esqueci"), `.qen-rodape > .qen-link` ("Criar uma conta"), `a[href$="termos.html"]`, `a[href$="privacidade.html"]`: `#ae300e` sobre `#d9d5c8` = **4,42:1** |
| Porta: Criar conta         | **fixme**                | **fixme** | `color-contrast` em `.qen-link` ("Entrar"); no celular também os dois `<a>` dos Termos e da Privacidade: `#ae300e` sobre `#d9d5c8` = **4,42:1**                                                           |
| Porta: Recuperar senha     | **fixme**                | **fixme** | `color-contrast` em `.qen-link` ("← Voltar ao login"): `#ae300e` sobre `#d9d5c8` = **4,42:1**                                                                                                             |

Toda violação achada é de **contraste de texto** (WCAG 1.4.3). Nenhuma de nome acessível, papel, rótulo
de formulário, idioma da página ou ordem de títulos.

## As três causas, e a correção sugerida

### 1. `--accent-ink` sobre o `--canvas` do desenho novo (Biblioteca, Perfil e a porta de entrada)

`--accent-ink: #AE300E` (`src/index.css:244`) foi medido contra o creme de antes. O desenho novo troca o
fundo para `--canvas: #d9d5c8` (`src/styles/quest.css:30` e `src/styles/questEntrada.css:25`, o bloco
`html[data-quest-novo='true'][data-theme='babel']:not(.dark)`), e ali o mesmo vermelho dá 4,42:1. Texto de
12 a 14 px, mesmo em negrito, é "texto normal" para a WCAG e pede 4,5:1.

Sugestão: redefinir `--accent-ink` nesse mesmo bloco das duas folhas, por exemplo `#a02c0d` (5,00:1 sobre
`#d9d5c8`, 5,16:1 sobre `#ddd8ca`, 6,10:1 sobre `--surface #edeae0`). É um tom do mesmo vermelho, mais
escuro, e só vale onde o fundo mudou. Um conserto resolve Biblioteca, o Perfil e os seis casos da porta.

No celular a Biblioteca passa porque a linha de totais sai do cabeçalho (`src/styles/polimento/seletor.css:102`).

**O mesmo par está escondido em outras telas.** O rótulo pequeno do cabeçalho (`.q-sobre`, "Sua conta" no
Perfil) usa a mesma cor sobre o mesmo fundo. Quase sempre o axe não decide o contraste ali: a camada de
polimento põe degradês que cruzam o cabeçalho (`.px-borda`, o desvanecer da borda, e `.px-aura`, o brilho
radial), e o axe devolve "não foi possível determinar o fundo por causa de um degradê" — um resultado "a
revisar", que o filtro sério/crítico não conta. Logo depois de trocar de aba o degradê ainda não está no
lugar, o axe mede o fundo liso e acusa os 4,42:1. Por isso o Perfil na aba "Seus dados" é `fixme` no
computador, e por isso uma tela que "passa" não prova que os seus rótulos `.q-sobre` passam: a mesma
correção de `--accent-ink` os cobre.

### 2. A contagem das abas com `opacity: 0.8` (Cartões)

`.q-aba .n` (`src/styles/quest.css:913`) desenha a contagem com `opacity: 0.8`. Sobre a pílula das abas
de Cartões (`.ct-abas.px-com-pilula`, fundo `--surface-sunken #DDD8CA`), o `--ink-muted #5E5A50` vira
`#777368` e mede 3,32:1. Sem a opacidade, o mesmo `#5E5A50` mede 4,83:1.

Sugestão: tirar a `opacity` de `.q-aba .n` e, se a hierarquia ainda pedir um tom mais apagado, usar uma
cor sólida (`var(--ink-muted)`) em vez de transparência. No celular as abas de Cartões têm outra arrumação
e a tela passa.

### 3. O roxo das páginas legais (`/privacidade.html`, `/termos.html`)

As duas páginas têm o próprio `:root` com `--accent: #7c5cff` (linha 9 de cada uma), usado no título
pequeno (`.kicker`) e em todos os links: 4,15:1 sobre `--bg #fafaf8`.

Sugestão: `--accent: #6a48ef` no claro (5,31:1 sobre `#fafaf8`, 5,55:1 sobre `#fff`). O escuro **não** foi
varrido pelo axe (a página segue `prefers-color-scheme` e o teste roda no claro); pela conta, o mesmo
`#7c5cff` sobre `#131313` dá 4,28:1, então o bloco escuro (linha 10) precisa do seu próprio `--accent`,
por exemplo `#9d85ff` (6,40:1).

## O que esta varredura não cobre

- **Tema escuro e os temas de Personalizar**: tudo foi medido no tema padrão claro.
- **Estados**: só o estado de chegada de cada tela. Capturar e Intérprete antes de começar (sem
  microfone nem modelo), as abas Progresso do Perfil e as outras abas de Planos e de Cartões, os
  diálogos, hover e foco ficam de fora.
- **O que o axe não decide sozinho**: a ordem do foco, o anúncio de mudanças ao leitor de tela, o
  alvo de toque (WCAG 2.5.8 entra pela tag `wcag22aa`, mas o axe só mede parte) e contraste sobre
  imagem ou gradiente (o axe marca como "a revisar", não como violação).
- **Impacto moderado e menor**: filtrados de propósito, como na fundação.

## Como rodar

```bash
# Suíte comum, só estes dois arquivos, nos dois projetos (servidor próprio, banco descartável):
PORT=3141 BASE_URL=http://localhost:3141 DATABASE_URL=file:/tmp/a11y.db \
  npx playwright test tests/e2e/acessibilidade.e2e.ts tests/e2e/fundacao.e2e.ts \
  --project=desktop-1280 --project=mobile-375

# A porta de entrada, no modo público (sobe o Supabase falso e o app na 3127):
DATABASE_URL_E2E_PUBLICO=file:/tmp/a11y-publico.db \
  npx playwright test -c playwright.publico.config.ts tests/e2e-publico/acessibilidade-porta.e2e.ts
```

Corrigida uma das causas, apague as linhas correspondentes de `VIOLAM_HOJE` nos dois arquivos de
teste: o caso deixa de ser `fixme` e passa a barrar a regressão.
