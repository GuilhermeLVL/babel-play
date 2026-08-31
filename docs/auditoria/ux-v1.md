# Auditoria de UX — carga cognitiva, duplicidade e descobribilidade

Rodada em 2026-08-31, com o app RODANDO nos dois lados: produção (babel-play.pages.dev) e local
(build completo), tela a tela, pela árvore de acessibilidade — que é o que um leitor de tela
anuncia e uma boa aproximação do que um usuário processa.

---

## A descoberta que reorganiza tudo: produção não é "mais nova" — é a edição leve

A percepção de que "a produção tem melhorias que o local não tem" tem uma explicação precisa: **o
que está no ar é a edição leve** (`build:leve`), que corta deliberadamente — menu de 7 itens, sem
conta, onboarding de duas perguntas, perfil etário calmo por padrão — enquanto o local roda o
build completo, no perfil "pro", com tudo ligado. O deploy é um build ANTERIOR deste mesmo
repositório; nenhum código lá é mais novo que o daqui.

**A consequência prática:** o caminho não é "trazer código da produção", é **trazer a calma da
leve para a edição completa** — que é o que esta rodada começou a fazer.

## O que foi medido e corrigido (verificado no navegador, antes e depois)

| Achado | Antes | Depois |
|---|---|---|
| Dois tutores para UM painel | "BabelBot" no cabeçalho + "iChat" flutuante abriam o MESMO chat com nomes diferentes | Uma porta só (o balão, que carrega contexto); rótulo corrigido — dizia "Business English" num app de qualquer idioma |
| Enxame de ícones no cabeçalho | 8 botões de ícone soltos | 6 — som/animações/desempenho viraram um popover "Conforto visual" com rótulos e estado EM PALAVRAS |
| Jargão corporativo no Hub | "PAINEL DE PERFORMANCE", "20 palavras **venceram no agendador**" | "Seu estudo", "20 palavras **prontas para revisar**" |
| Botão gritado triplo | "RELATÓRIO EXECUTIVO" + "VISUALIZAR RELATÓRIO DE PERFORMANCE DETALHADA" + "Expandir" — o leitor de tela lia os três | "Estatísticas detalhadas · Retenção, tempo de estudo e evolução semanal" |
| **Planos inalcançáveis** | Só atrás do menu do avatar — nem o dono do produto achou | Botão "Ver planos e preços" no bloco Plano de Ajustes + linha discreta no Hub para quem está no Grátis |

## O que a auditoria REFUTOU (e vale registrar)

**"355 botões na tela de Sessão" exagerava o problema visual.** Os 240 botões por trecho (3 × 80)
já são revelados só no *hover*, com `tabIndex={-1}` e razão documentada (correção F7 de uma
auditoria anterior). Eles existem na árvore de acessibilidade, mas não na tela — a poluição visual
ali é menor do que a contagem sugeria. Medir pela árvore superestima; olhar só a tela subestima; é
preciso os dois.

## Backlog de UX — visto, não feito (em ordem de valor)

1. **Sobreposição de CTAs no Hub**: o pilar "Exercícios" e a seção "20 palavras prontas para
   revisar" pedem a mesma ação com dois botões diferentes ("Abrir exercícios" / "Revisar agora").
   Fundir a seção no status do pilar é a correção — cirurgia média no Hub.
2. **`border-l-4` como indicador de trecho ativo** na Sessão — a listra lateral é um vício de
   design; como marca ESTADO (linha em reprodução), trocar por fundo tonal exige cuidado com os
   12 pares tema × modo.
3. **Barra "Seu progresso"**: NÍVEL/XP/OFENSIVA/SEEDS em caixa alta minúscula, quatro conceitos de
   gamificação de uma vez — candidata a simplificação no perfil sênior.
4. **Revisar os perfis kids/sênior** com o mesmo pente fino de linguagem que o "pro" recebeu.
5. **Tela de Ajustes** (651 linhas): auditoria própria — é a maior densidade de opções do app.

## Método

- Árvore de acessibilidade das telas nos DOIS ambientes (produção leve × local completo).
- Registro de produto (`impeccable`): a ferramenta desaparece na tarefa; familiaridade conquistada;
  consistência sobre surpresa; um vocabulário de componente por superfície.
- Cada correção verificada no navegador DEPOIS de aplicada — a tabela acima é de estados
  observados, não de intenções.
