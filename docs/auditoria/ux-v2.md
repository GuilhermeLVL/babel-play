# Auditoria UX v2 — usuário leigo, tela a tela

Data: 2026-08-31 · Mudança: `openspec/changes/auditoria-ux-e-economia-de-recompensas/`
Método: navegador (Chrome DevTools MCP, árvore de acessibilidade + screenshots) no `npm run dev:local`,
detector da skill impeccable sobre `src/components/{views,shell,ui}`, e leitura do código citado.
Régua: **DIREITO** (acessibilidade, dados do usuário — nunca tranca) × **RECOMPENSA** (estética —
nunca de graça), cruzada com a taxonomia E0–E3 (`openspec/changes/personalizar-v4/design.md:44-58`).

Status: varredura de telas COMPLETA (Hub, Capturar, Praticar, Minhas Mídias, Minhas Palavras,
Personalizar ×4 abas, Ajustes ×4 abas, Perfil ×3 abas, Plano, Sobre, Sessão/Análise, menu da conta).

---

## 1. Coerência entre telas (ícones, nomes, redirecionamentos)

### 1.1 A palavra "nível" designa duas escalas diferentes — CONFIRMADO no navegador
O cabeçalho de Personalizar diz **"NÍVEL 6"** (nível do app) e "PRÓXIMA RECOMPENSA · NÍVEL 7:
Partículas Estrelas". A aba Passe, na mesma tela, marca a posição do usuário como **"59 · você"**
e rotula cada slot "Nível 59 do passe…". O "nível 7" do cabeçalho NÃO é o "nível 7 do passe"
(que é "Cursor do sistema") — mesmo termo, duas réguas (app 1..N × passe 1..100 via `passeNivel`).
Um leigo não tem como saber qual "nível 7" é qual.
- Onde: `src/components/views/Loja.tsx` (cabeçalho) × `src/components/views/passe/PasseDeTemporada.tsx`.
- Correção sugerida: o passe fala em "etapa do passe" ou numera sem a palavra "nível"; o
  cabeçalho já usa "ETAPA" no Hub (`região Seu progresso` mostra "ETAPA 6") — aliás, **Hub diz
  "ETAPA" e Personalizar diz "NÍVEL" para o MESMO número** (terceira grafia do mesmo conceito).

### 1.2 "Biblioteca" tem dois significados e dois ícones
- Rota `/biblioteca` = tela "Minhas Mídias" (`Library.tsx`, ícone `Library` no nav).
- Aba "Biblioteca · 45" dentro de Personalizar = itens cosméticos possuídos (`Personalizar.tsx`,
  ícone `LibraryBig` em `Loja.tsx:255`).
Um leigo que ouça "veja na Biblioteca" tem 50% de chance de abrir a tela errada. O nav já evita
o termo (usa "Minhas Mídias") — falta renomear a aba de Personalizar (ex.: "Meu visual", termo
que o próprio texto do cabeçalho já usa: "O que é seu fica em Meu visual").

### 1.3 Ícone do nav "Personalizar" é uma sacola de compras
`navItems.ts:81` usa `ShoppingBag` para o item "Personalizar", cuja aba default é a Biblioteca
(o que é SEU). Sacola comunica loja/compra; a tela é primeiro guarda-roupa, depois loja.

### 1.4 Ícones sobrecarregados (mesmo símbolo, conceitos distintos)
| Ícone | Sentido 1 | Sentido 2 |
|---|---|---|
| `Trophy` | Conquistas/Desafios (`Loja.tsx:255`, `Conquistas.tsx:56`) | recorde/pontuação nos minijogos (`AntessalaDaRodada.tsx:474,691`, `BlitzGame.tsx:349`, `Recordes.tsx:46`, `ScratchReward.tsx`) |
| `Flame` | ofensiva/streak (`ShellBits.tsx:64`, `FaixaDeProgresso.tsx:95`) | combo dentro dos jogos (`BlitzGame.tsx:355,455`, `AntessalaDaRodada.tsx:475`, `Recordes.tsx:86`) |
| `Ticket` | Passe de Temporada (`Loja.tsx:252`, `PasseDeTemporada.tsx:120`) | cartela de bingo (`BingoPanel.tsx:81`) e uso em `LiveCapture.tsx:3218` |
`Sprout` (Seeds) está consistente em todo o app — o caso `Leaf` já foi eliminado.
Gravidade: baixa isoladamente, mas é a classe de problema que o dono relatou; vale padronizar
pelo menos Trophy (conquista) × Medal/Star (recorde) e Flame (streak) × Zap (combo).

### 1.5 Duas moedas sem legenda fora do passe
Seeds (`Sprout`) e Créditos (`Coins`) coexistem; Créditos aparecem só no passe premium com o
aviso "disponível quando a loja de créditos abrir" (honesto), mas não há nenhum lugar que
explique a diferença das moedas. Ao abrir a loja de créditos, isso vira confusão certa.

### 1.6 Ids internos × rótulos × URL
Abas de Personalizar: ids `passe|personalizar|loja|conquistas`, rótulos Passe|Biblioteca|Loja|
Desafios, e a URL é sempre `/loja` sem sub-aba (deep-link impossível; o alias `progressao` já
precisou existir para não quebrar link antigo — sintoma). Corrigível expondo a aba na URL
(`/loja/passe` etc. em `rotas.ts`) e alinhando ids aos rótulos numa migração de alias.

### 1.7 O mesmo número tem três nomes: ETAPA × NÍVEL × nível
- Hub e Praticar: "**ETAPA** 6" (`FaixaDeProgresso`).
- Personalizar: "**NÍVEL** 6" e "Nível 6" (cabeçalho de `Loja.tsx`).
- Perfil → Progresso, NA MESMA ABA: região diz "ETAPA 6", os marcos do gráfico dizem
  "nível 2/3/4/5", e o rodapé "6 nível atual".
Escolher UMA palavra (o Hub sugere "etapa" para leigo) e usá-la em todo lugar; reservar outra
palavra para a posição no passe (ver 1.1).

### 1.8 Mesma tela, três nomes: Minhas Mídias × biblioteca × lições
Nav: "Minhas Mídias". Cabeçalho da tela: "Minha biblioteca de leitura". Kicker: "SUAS LIÇÕES
GUARDADAS". Hub: "Sessões Recentes" + botão "Ver biblioteca completa →". Quatro vocábulos
(mídia, biblioteca, lição, sessão) para o mesmo objeto. Decidir o termo canônico (sugestão:
"gravações", que a busca global já usa — "Buscar gravação, palavra ou tela") e alinhar.

### 1.9 Datas relativas inconsistentes
Hub: "Há 0 dias" para sessão de hoje; Minhas Mídias: "Ontem"/"Há 4 dias" para as mesmas
sessões. Unificar o formatador (hoje/ontem/há N dias) e nunca exibir "Há 0 dias".

### 1.10 Caminho de repositório na UI do usuário
Plano → "O que cada plano dá" termina com "os números completos estão em
`docs/auditoria/eval-producao-v1.md`" — referência de dev exposta ao leigo, sem link. Trocar
por texto simples ("medição própria publicada no repositório do projeto") ou por link real.

### 1.11 Duplicação de controles no DOM em Capturar
`/capturar` renderiza o cluster de controles duas vezes (variantes desktop+mobile ambas no
DOM): os botões "Buscar", "Tamanho do texto", etc. aparecem duplicados na árvore de
acessibilidade — leitor de tela anuncia tudo em dobro.

### 1.12 O que está COERENTE (não mexer)
- Menu da conta: 3 itens, todos levam a telas reais (Meu perfil, Plano e consumo, Ajustes).
- Ajustes → "Como o app se parece" é só um ponteiro para Personalizar — a duplicação de
  aparência que existia foi de fato eliminada; direitos (texto, som, claro/escuro) ficam na
  barra de controles, sempre à vista.
- Estados vazios honestos por toda parte ("Sem dados fabricados", "um ponto não é tendência").
- Plano: números medidos, sem promessa; "Self-host (tudo liberado)" declarado.
- Sobre: links todos válidos e externos corretos; privacidade/termos linkados.
- `Sprout` para Seeds é consistente em 100% dos usos.

### 1.13 Detector impeccable (varrida completa em views+shell+ui)
7 avisos, todos em telas antigas — coerente com a tese "fases diferentes":
- `Analysis.tsx:2347` e `Reading.tsx:1715,1739` — `border-l-4` (side-tab accent).
- `Analysis.tsx:906`, `Reading.tsx:2138,2141` — `animate-bounce`.
- `LiveCapture.tsx:3441` — `transition: height` (layout thrash).
Além disso `Analysis.tsx:1633-1665` monta abas à mão em vez de `ui/Abas.tsx` (divergência de
padrão de navegação interna).

## 2. Passe: economia e honestidade

### 2.1 Diluição confirmada visualmente
Na década 51–60, cinco slots seguidos mostram "+25" Seeds. As décadas 6–10 têm 5,6,7,8,8 slots
de moeda (derivados: são as sobras do catálogo por década em `passe.ts`); total 1613 Seeds em
42 slots de 10–50. É a sensação relatada: "vários níveis sem ganhar nada de verdade".

### 2.2 "resgatado" é declarado sem verificação — BUG de honestidade
`PasseDeTemporada.tsx:177-180`: o rótulo é `aberto ? 'resgatado' : 'nível N'`, onde `aberto` é
só `slotDestravado` (nível alcançado). O crédito real é assíncrono (`creditarSeeds`, idempotente
por `creditoId`) e pode falhar — a UI afirma "resgatado" antes/independente do resultado.
Observado ao vivo: slots marcados "resgatado" com **SEEDS = 0** no cabeçalho. Causa apurada
via `/api/metrics/profile`: `seedsCreditadas: 409`, `seedsGastas: 2120` — o saldo é clamp de um
histórico em que se gastou 5× o que foi creditado (gastos da fase pré-economia-v2, quando a
compra funcionava e o crédito não). Não é bug do passe, mas expõe dois problemas:
1. O rótulo "resgatado" continua mentindo por construção (afirma antes do resultado do crédito).
2. **Perfil → Progresso diz "615 ganhas no total" enquanto a API diz 409 creditadas** — duas
   fontes para o mesmo número. Apurar qual é a certa e unificar.
Recomendação extra: dado o histórico inconsistente, considerar um acerto único de saldo
(migração/documentação) para contas antigas, senão o usuário fica níveis inteiros vendo "+N
Seeds resgatadas" sem o saldo sair de 0 — a pior versão possível da sensação de "não ganhei nada".

### 2.3 Slot 101 / colisão de número
`slotsDoPasse()` devolve 101 entradas (década 3 tem 11 itens; o excedente reusa o número de slot
final da década). Invisível para o usuário hoje, mas quebra a promessa "100 níveis".

### 2.4 Defaults vendidos como recompensa (liga com o botão "voltar ao original")
O passe entrega como recompensa itens que são o PADRÃO do app: nível 7 "Cursor do sistema —
volta atrás garantida", nível 8 "Rastro desligado", níveis 2/3/21/22 posições de menu (a padrão
inclusa). Voltar ao padrão é DIREITO (desfazer uma escolha), não recompensa. Enquanto "voltar
ao visual original" não existir, o usuário que equipou um cursor pago e quer o normal de volta
depende de "ter ganho" o default no passe — incoerência direta com a spec desta mudança.

## 3. Inventário de capacidades de edição — matriz E0–E3 × DIREITO/RECOMPENSA

Legenda: DIREITO nunca tranca; RECOMPENSA nunca vem de graça. "Gate" = passa por
`acessoAoItem`/`estadoDoItem` (a régua única de `galeria/acesso.ts` + `loja.ts`).

| Capacidade | Onde | Grau | Classe | Gate hoje | Veredito |
|---|---|---|---|---|---|
| Tamanho do texto (barra) | `ControlCluster` | — | DIREITO | livre | ✅ correto |
| Som/animações/desempenho | `MenuDeConforto` | — | DIREITO | livre | ✅ correto |
| Claro/escuro | barra de controles | — | DIREITO | livre | ✅ correto |
| Perfil de exibição (kids/pro/senior) | `Personalizar.tsx:415` seção "tela" | — | DIREITO (acessibilidade) | livre | ✅ correto — mas mora dentro de uma tela de recompensas; ver §4.4 |
| Posição do menu | mesma seção | E0 | RECOMPENSA | item `posicao` | ⚠️ a posição PADRÃO precisa ser sempre aplicável (direito de desfazer); as demais, recompensa — ver §2.4 |
| Idiomas, meta, motores IA, privacidade | `Settings.tsx` | — | DIREITO (função/dados) | livre | ✅ correto |
| Nome/objetivo/gostos do perfil | `Perfil → Você` | — | DIREITO (dados) | livre | ✅ correto |
| LGPD (Seus dados) | `Perfil → Seus dados` | — | DIREITO (lei) | livre | ✅ correto |
| Renomear sessão/conversa/falantes | Analysis/IChat/LiveCapture | — | DIREITO (dados do usuário) | livre | ✅ correto |
| Upload de mídia/capa, import de baralho | `Library.tsx`, `BaralhoAnki` | — | DIREITO (dados) | livre | ✅ correto — conteúdo de estudo, não estética |
| Tema pronto | `Personalizar.tsx:248` | E0 | RECOMPENSA | ✔ nível/Seeds | ✅ |
| Paleta (6 estilos × 30 matizes) | `Personalizar.tsx:278` | E1 | RECOMPENSA | ✔ por estilo | ✅ (claro/papel livres = base de graça, ok) |
| Fonte | `Personalizar.tsx:319` | E0 | RECOMPENSA | ✔ | ✅ |
| Partículas | `Personalizar.tsx:327` | E0 | RECOMPENSA | ✔ | ✅ |
| Editor de pack de emojis | `Personalizar.tsx:336` | E2 | RECOMPENSA | ✔ editor + por emoji | ✅ |
| Cursor de emoji | `Personalizar.tsx:368` | E1 | RECOMPENSA | ✔ | ✅ |
| Rastro (forma × paleta, emojis) | `Personalizar.tsx:381` | E1 | RECOMPENSA | ✔ | ✅ |
| Aprimoramentos (intensidade) | aba Loja | E1 | RECOMPENSA | ✔ degraus de Seeds | ✅ |
| Perfis salvos (salvar/aplicar/apagar) | `Personalizar.tsx:206` | E2 | mista | aplicar ✔ (`faltaParaOPerfil`); salvar livre | ✅ desenho certo: salvar é dado do usuário (direito), aplicar respeita posse |
| Estúdio de Cores & Layout | `LayoutStudio.tsx` | E3 | RECOMPENSA | ✔ só na ENTRADA | ⚠️ ver §4.1 |
| Tema customizado (4 tokens) | `applyCustomColors` | E3 | RECOMPENSA | ✔ item `Tema Customizado` | ✅ |
| Voltar ao visual padrão | NÃO EXISTE | — | DIREITO | — | ❌ o direito de desfazer não tem superfície; hoje o "default" é vendido no passe (§2.4). É a task 3.2 desta mudança |

**Conclusão da matriz**: a régua única segurou quase tudo — as capacidades de estética passam
por `estadoDoItem` e as de acessibilidade/dados são livres. Os furos reais são poucos e
específicos (§4), mais o direito ausente (reset).

## 4. Funções antigas que furam a gamificação (com custo de correção)

### 4.1 `liberadoTudo()` — o furo estrutural
`desbloqueios.ts` expõe `ativarLiberacaoTotal()`; `estadoDoItem` (loja.ts:143) curto-circuita
TUDO quando ligado, e o dev:local roda como "Self-host (tudo liberado)" (visível na tela Plano).
Como usuário final não deveria alcançar isso, o furo é de EMPACOTAMENTO: garantir que nenhum
caminho de UI/console documentado ligue a flag em produção (hoje é localStorage — qualquer um
com DevTools liga). Custo: baixo para esconder de UI; decidir se aceita o bypass via DevTools
(app local-first, trapaça só prejudica o próprio jogador) e REGISTRAR a decisão. Recomendo
aceitar e documentar — é coerente com "privado de verdade".

### 4.2 `LayoutStudio` (E3) confia só na porta de entrada
Nenhuma checagem interna; qualquer render direto do componente entrega o editor completo.
Hoje o único caminho é o botão gateado, então não há exploit por UI — mas é o padrão que a
spec galeria-gating-fechado proíbe ("todo caminho passa pela régua"). Custo: baixo — uma
checagem `acessoAoItem('estudio')` no mount com fallback honesto (~10 linhas + teste).

### 4.3 Defaults como recompensa no passe (= §2.4)
"Cursor do sistema", "Rastro desligado", posição de menu padrão aparecem como slots do passe.
Furam ao contrário: transformam DIREITO em recompensa. Custo: médio — sai junto do redesenho
da curva (tarefa 2.x): defaults saem da trilha, viram estado inicial garantido, e o slot que
ocupavam recebe item/moeda de verdade.

### 4.4 Direito morando em tela de recompensa
O perfil de exibição (kids/pro/senior — acessibilidade) vive DENTRO de Personalizar, entre
itens trancáveis. Não tranca (correto), mas o endereço confunde a classe: leigo entende que
"perfil senior" é mais um cosmético. Custo: baixo — mover a seção "tela" para Ajustes (que já
aponta para Personalizar; a seta inverte) ou duplicar o atalho como DIREITO explícito.

### 4.5 O que NÃO fura (verificado)
- Ajustes não oferece segundo caminho de aparência (só o ponteiro).
- Equipar passa por `equiparItem` que revalida `estadoDoItem` — sem bypass por perfil salvo
  (`faltaParaOPerfil` cobre paleta por estilo, tema, pack por emoji, cursor, rastro, partículas).
- Presets de perfis mostram "Falta: X: Nível N ou M Seeds" — recompensa explicada, não trancada
  em silêncio. Padrão exemplar, inclusive para o passe copiar.

## 5. Redirecionamentos

Verificados ao vivo: menu da conta (3 itens ok), "Ver no Passe" (abre a aba passe), Hub →
"Ver biblioteca completa" (abre /biblioteca), "Ver Análise" (abre /sessao/<id>/transcricao),
alias `progressao → passe` funcionando. Nenhum link morto encontrado NESTA varredura — o do
cabeçalho já havia sido corrigido (commit a17b947).
Pendência estrutural (1.6): sub-aba de Personalizar não vai à URL — deep-link e recarga sempre
caem na aba default.

## 6. Prioridade sugerida das correções (tarefa 4.x)

1. **Curva do passe + defaults fora da trilha** (§2.1, §2.4/4.3) — é a dor relatada.
2. **Reset "voltar ao visual original"** (§3, task 3.2) — devolve o direito ausente.
3. **Vocabulário único**: etapa×nível×nível-do-passe (1.1/1.7) e mídias×biblioteca (1.2/1.8) —
   baixo custo, alto ganho de coerência.
4. **Honestidade do slot** (§2.2): "resgatado" só após crédito confirmado; conciliar 615×409.
5. Ícones sobrecarregados (1.4), datas (1.9), caminho de repo na UI (1.10), aba na URL (1.6),
   cluster duplicado no DOM (1.11), gate interno do Estúdio (4.2), seção "tela" (4.4),
   avisos do detector (1.13).
