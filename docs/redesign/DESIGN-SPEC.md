# DESIGN-SPEC — Protótipo v3 → tokens do app

Fonte: `docs/redesign/source/prototipo-v3.html` (1710 linhas). Não renderizável (falta
`./support.js`, L6) — a especificação é lida do template `sc-if`/`sc-for` e da classe `Component`.
Ver D-001.

## 1. Valores brutos medidos no protótipo

Contagem por varredura do arquivo (script em `docs/redesign/`, reproduzível):

| Eixo | Distintos | Observação |
|---|---|---|
| Cores hex | **67** | 587 ocorrências no total |
| Tamanhos de fonte | **25** | de 9,5 px a 28 px, com meios pixels (10,5 · 11,5 · 12,5 · 13,5 · 14,5) |
| Raios de borda | **10** | 2 · 6 · 8 · 9 · 10 · 12 · 14 · 16 · 18 px · pill |

O prompt estimava ~40 hex / ~20 tamanhos / 10 raios. A medição real é pior nos dois primeiros
eixos. Tudo é estilo inline; só `.card`, `.btnPrimary` e `.btnGhost` são classes (L34-37).

## 2. O achado que muda o trabalho: 66% do protótipo já é token do app

Cruzando cada hex do protótipo com as custom properties de `src/index.css`:

**390 das 587 ocorrências de cor (66%) caem exatamente sobre um token que já existe no app.**

| hex | ocorr. | token do app |
|---|---|---|
| `#5E5A50` | 115 | `--ink-muted` |
| `#C6BFAC` | 42 | `--border-subtle` |
| `#F04E23` | 40 | `--accent` |
| `#26241F` | 39 | `--ink` |
| `#B93613` | 33 | `--accent-ink` |
| `#F5F2EA` | 28 | `--surface` |
| `#FBDDD3` | 21 | `--accent-soft` |
| `#3E6B44` | 17 | `--good` |
| `#E6E2D6` | 15 | `--canvas` |
| `#C92A2A` | 9 | `--error` |
| `#5B5EA6` | 6 | `--rare` |
| `#DCE7DB` | 5 | `--good-soft` |
| `#C98A12` | 5 | `--warn` |
| `#3D1105` | 4 | `--accent-contrast` |
| `#EBE7DB` | 4 | `--surface-hover` |
| `#F4E7CB` | 3 | `--warn-soft` |
| `#E1E1F2` | 1 | `--rare-soft` |

Isto é esperado: o `PROMPT.md` da rodada anterior
(`docs/design/auditoria-prototipo-v2/PROMPT.md`, seção "Mantenha") entregou ao Claude Design a
paleta real do app. **Portanto a F4 não é "criar o design system" — ele existe.
A F4 é fechar as lacunas derivadas abaixo e travá-las por lint.**

## 3. Órfãs: os 34% restantes, por família

Nenhuma é cor nova de verdade; são derivadas que faltam no `index.css`.

| Família | hex do protótipo | token derivado proposto |
|---|---|---|
| Superfície rebaixada / hover de fundo | `#EFEAD9` (x28), `#E5E1D4` (x13), `#DAD5C6` (x2) | `--surface-sunken` (e reuso de `--surface-hover`) |
| Fundo de campo | `#FFF` (x22) | `--field-bg` |
| Texto de 3º nível | `#8C867C` (x22), `#B8B2A2` (x5), `#4A4640` (x3) | **mapear para `--ink-faint` (`#7A7568`)** — ver §5 |
| Accent pressionado / escuro | `#D6431C` (x19), `#7A2A10`, `#8A2C14`, `#7A2A17` | `--accent-hover`, `--accent-deep` |
| Borda sobre accent-soft | `#F0C9BE` (x10), `#F5D9D3`, `#F0A28C` | `--accent-border` |
| Herói escuro de Capturar | `#1B1A18`, `#1C1A16`, `#2A2823`, `#38352D`, `#3A362E`, `#45423A` | reusar os tokens do **tema escuro já existente**, não criar paleta nova |
| Tinta sobre `good-soft` | `#2C4F30` (x3), `#BFDABD` (x2), `#8FBF95` | `--good-ink`, `--good-border` |
| Tinta sobre `warn-soft` | `#8A5F0D` (x9), `#332A15` | `--warn-ink` (já existe como `color-mix`) |
| Amostras do catálogo de temas | `#A855F7`, `#0EA5E9`, `#FF2ED1`, `#0C0A14`, `#151122`, `#0A0612`, `#150B24`, `#1E293B`, `#1F4C56`, `#ECFDF5`, `#10B981`, `#F9F0FF`, `#FAF5FF`, `#F4F8FA`, `#EBF1F5`, `#D6E4E9` | **nenhum** — são as miniaturas dos temas na tela Personalizar; vêm do catálogo real de temas do app, não de tokens |

## 4. Escala tipográfica proposta

25 tamanhos → 8 papéis. Os meios pixels (10,5 · 11,5 · 12,5 · 13,5 · 14,5) somam 92 ocorrências e
não sobrevivem: arredondam para o degrau vizinho.

| Papel | px | Família |
|---|---|---|
| `label-mono` | 11 | IBM Plex Mono |
| `caption` | 12 | Inter |
| `body-sm` | 13 | Inter |
| `body` | 14 | Inter |
| `title-sm` | 16 | Archivo |
| `title` | 20 | Archivo |
| `display` | 24 | Archivo |
| `display-lg` | 28 | Archivo |
| marca | — | Silkscreen, **só no logo** |

## 5. Contraste: o que o protótipo reprova (WCAG 2.2 AA)

A recalcular e travar no teste já existente (`tests/contrastePaletas.test.ts`). O caso mais grave
é `#8C867C` sobre `#F5F2EA` = **3,23:1** em 22 ocorrências de texto pequeno — reprova o mínimo de
4,5:1. O app já tem a saída pronta: `--ink-faint` (`#7A7568`) no lugar. Pela hierarquia de decisão
do prompt (item 2), acessibilidade vence fidelidade pixel a pixel.

## 6. Raios

10 valores → 5 degraus: `sm` 8 · `md` 10 · `lg` 12 · `xl` 16 · `pill` 9999. O `2px` (x1) e o
`6px` (x1) são acidentes; `9px`(x18), `14px`(x8) e `18px`(x2) arredondam para o degrau vizinho.

## 7. Tela a tela

Cada tela é uma `sc-if` de primeiro nível no template. A navegação vem de `navDefs`
(`prototipo-v3.html:1434-1444`): 9 itens — Início, Capturar, Jogar, Biblioteca, Vocabulário,
Personalizar, Sobre, Planos, Ajustes.

| `sc-if` | Linhas | Tamanho | Tela |
|---|---|---|---|
| `showOnboarding` | 46–214 | 169 | Onboarding em 8 passos |
| `isInicio` | 215–263 | 49 | Início |
| `isCapturar` | 264–312 | 49 | Capturar |
| `isBiblioteca` | 313–348 | 36 | Biblioteca |
| `isSessao` | 349–460 | 112 | Sessão (4 abas + modal Exportar) |
| `isJogar` | 461–674 | 214 | Jogar (lobby + facetas + sessões de exercício) |
| `isPalavras` | 675–755 | 81 | Vocabulário + Revisar (FSRS) |
| `isProgresso` | 756–797 | 42 | **Progresso — órfã** (ver abaixo) |
| `isPersonalizar` | 798–880 | 83 | Personalizar |
| `isPlanos` | 881–920 | 40 | Planos |
| `isSobre` | 921–938 | 18 | Sobre |
| `isAjustes` | 939–984 | 46 | Ajustes |
| `importOpen` | 985–1024 | 40 | Modal Importar |
| `toastVisible` | 1025–1038 | 14 | Toast |

### 7.1 Progresso é órfã — confirmado

`goProgresso` é definido na classe `Component` mas **não aparece em `navDefs` nem em nenhum
`onClick` do template**: 0 ocorrências no template, 1 na lógica. A tela `isProgresso`
(L756–797) é inalcançável no protótipo. O changelog do próprio arquivo (L12) diz que o conteúdo
de CEFR/semana deve migrar para Vocabulário.

### 7.2 Dado fabricado no protótipo — lista fechada

Nada disto pode virar constante no código. Cada um precisa vir do dado real ou virar estado honesto.

| Tela | Texto no protótipo |
|---|---|
| Início | "Nível 12 · 340/500 XP", "14 palavras novas esperando", "20 palavras · 4 min", "Planos a partir de R$ 9,90/mês" |
| Biblioteca | "Palavras extraídas 2.057", "Tempo transcrito 6h 40min" |
| Sessão | "WPM 142", "Maior monólogo: 48s", "Vícios de linguagem: nenhum detectado" |
| Jogar | "Etapa 15 · 755/1500 XP", "4 dias", "86% de acerto médio nas últimas 5 sessões", "Melhor sequência: Karaokê da fala" |
| Vocabulário | "4 minutos", "14 novas", "2.057 no total" |
| Progresso | "Nível 12", "Ofensiva 9 dias", "Retenção 87%", "Palavras dominadas 612", "Meta da semana … de 7 dias" |
| Ajustes | "Seu ritmo medido: 132 ppm", "Alvo: 140 ppm", "500 MB de armazenamento" |

O protótipo acerta em dois pontos: já escreve "estimativa" ao lado da meta de comunicação
(L939+) e já usa `"—" quando não há timing confiável para a métrica` na Sessão (L349+).
Esses dois padrões são o modelo a generalizar.

### 7.3 Links sem destino

"Ver estatísticas detalhadas" (Início), "Privacidade" e "Termos" (Sobre).

### 7.4 Vocabulário: estados de palavra

O protótipo mostra **New / Learning / Review** (L675+). O FSRS-5 real tem quatro estados —
falta **Relearning**. A inventariar contra o agendador real do app antes de decidir o rótulo.
