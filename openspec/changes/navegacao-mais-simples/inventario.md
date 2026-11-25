# Inventário real de destinos e menus (lido do código em 25/11/2026, main `897c9d25`)

Fontes: `src/components/shell/navItems.ts`, `TrilhoDoQuest.tsx` (938 linhas), `EscolhaAoVivo.tsx`, `AbasDePraticar.tsx`,
`src/lib/polimento/celular.ts`, `src/lib/rotas.ts` (593 linhas), `src/types.ts` (`ViewType`), `views/Settings.tsx`,
`views/ajustes/*`, `views/quest/InicioDoQuest.tsx`. Os números de toques abaixo vêm da leitura do código; a medição por
navegador é a tarefa 1.1 e substitui estes números.

## 1. Destinos (o que existe)

`ViewType` tem 23 valores: `hub`, `capture`, `interprete`, `study`, `play`, `library`, `livros`, `analysis`, `settings`,
`reading`, `metrics`, `cartoes`, `profile`, `sobre`, `loja`, `planos`, `estatisticas`, `ajuda`, `diagnostico`, `admin`,
`leitor`, `leituraAtiva`, `naoencontrado`. Destes, 12 são itens de navegação (`TODOS_OS_ITENS` / `NAV_ITEMS`):

| Item           | Rótulo (pro)                        | Onde aparece hoje                                           |
| -------------- | ----------------------------------- | ----------------------------------------------------------- |
| `hub`          | Início                              | trilho, barra do celular                                    |
| `capture`      | Capturar (no trilho vira "Ao vivo") | trilho, barra                                               |
| `interprete`   | Intérprete                          | dentro da escolha "Ao vivo"; ladrilho no Início             |
| `play`         | Jogar                               | trilho, barra                                               |
| `library`      | Biblioteca                          | trilho (desktop); "Mais" (celular)                          |
| `livros`       | Livros                              | trilho (desktop; pedido do dono em 27/10); "Mais" (celular) |
| `cartoes`      | Cartões                             | trilho, barra (com selo do dia)                             |
| `estatisticas` | Progresso                           | trilho (desktop); "Mais" (celular)                          |
| `loja`         | Personalizar                        | "Mais"                                                      |
| `sobre`        | Sobre                               | "Mais"                                                      |
| `planos`       | Planos                              | trilho (desktop); faixa do "Mais"; Início; Ajustes, Conta   |
| `settings`     | Ajustes                             | pé do trilho (desktop); "Mais"                              |

Fora de `NAV_ITEMS` e só no "Mais": Perfil, Ajuda e suporte, Diagnóstico (headset), Leituras (flag `leitura_ativa`),
Administração (papel admin). Não são destino de menu: `analysis` (Sessão, 4 abas), `study`, `reading`, `metrics`, `leitor`,
`naoencontrado`.

## 2. Primeiro nível, por formato

**Desktop e tablet (trilho lateral).** `NO_TRILHO` = Início, Ao vivo, Cartões, Jogar, Biblioteca, Livros, Progresso, Planos
(8). No pé: Buscar, Ajustes, Voz de leitura, Mais (4). **Até 12 botões.** Quando a altura não comporta, `useTrilhoCompacto`
liga `data-compacto` e o CSS esconde o texto (`quest.css:159-175`): só ícones, com a dica ao apontar ou focar. A queixa
"12 ícones sem rótulo" é exatamente este estado.

**Celular (barra de cinco, `NO_TRILHO_NO_CELULAR`).** Início, Ao vivo, Cartões, Jogar, Mais = 5. `AbasDePraticar` põe as
abas Cartões e Jogos no alto das duas telas.

## 3. Segundo nível

| Lugar                                     | O que tem                                                                                                                                 | Itens                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Escolha "Ao vivo" (`EscolhaAoVivo`)       | Legendar, Intérprete, Legenda flutuante (só com captura rodando e janela)                                                                 | 2 a 3                        |
| Painel "Mais" (`TrilhoDoQuest`, `q-mais`) | abas Destinos e Avisos; ladrilhos; faixa Planos e Premium; interruptores (tema, som, desempenho, vibração do Quest); Entrar, Sair, Buscar | ~8 a 12 ladrilhos e comandos |
| Ajustes                                   | Idiomas, Aparência, Notificações, Processamento, Privacidade, Conta                                                                       | 6 abas, ~2,8 mil linhas      |
| Personalizar (`loja`)                     | Coleção, Maestria, Temporada, Conquistas, Loja (com `recompensas_v2`) ou 2 áreas clássicas                                                | 5 ou 2                       |
| Sessão (`analysis`)                       | transcrição, leitura, jogos, métricas                                                                                                     | 4                            |
| Cartões                                   | Hoje, Palavras, Memória (`ABAS_DE_CARTOES`; Estudar em `/cartoes/estudar`)                                                                | 3                            |
| Planos                                    | assinar, assinado, cancelar, assinatura                                                                                                   | 4 subtelas                   |
| Início (`InicioDoQuest`)                  | ladrilhos: Capturar, Cartões, Jogar, mais; avisos                                                                                         | ~8                           |

## 4. Duplicatas e atalhos

- **Planos**: trilho (desktop), faixa do "Mais", cartão no Início, Ajustes (Conta), menu do avatar, busca. Seis portas.
- **Ajustes**: pé do trilho e ladrilho do "Mais".
- **Idioma e voz**: Ajustes, Idiomas; botão "Voz" no trilho; "idioma da interface" no "Mais" (plano de `cartoes` 9.3).
- **Retenção e progresso**: Progresso (Estatísticas) e Cartões, Memória.
- **Capturar x Intérprete**: duas views, uma porta ("Ao vivo") que pergunta qual.

## 5. Toques até as 7 tarefas (estimativa pelo código, a partir do Início)

| Tarefa                        | Desktop                          | Celular                    |
| ----------------------------- | -------------------------------- | -------------------------- |
| T1 Legendar o que assisto     | Ao vivo, Legendar, iniciar = 3   | 3                          |
| T2 Conversar (Intérprete)     | Ao vivo, Intérprete, iniciar = 3 | 3                          |
| T3 Rever os cartões de hoje   | Cartões, "Revisar agora" = 2     | 2                          |
| T4 Jogar                      | Jogar, escolher jogo = 2         | 2                          |
| T5 Ver meu progresso          | Progresso = 1                    | Mais, Progresso = 2        |
| T6 Trocar o idioma de legenda | Ajustes, Idiomas = 2             | Mais, Ajustes, Idiomas = 3 |
| T7 Abrir um livro             | Livros, livro = 2                | Mais, Livros, livro = 3    |

## 6. O que o histórico ensina

Cada item do trilho entrou por um pedido do dono, por boa razão e em data própria (comentários em `navItems.ts` e
`TrilhoDoQuest.tsx`). Não existe regra de teto. A solução precisa ser uma regra (orçamento de navegação), não só um corte.

## 7. Lacunas desta leitura (a tarefa 1.1 fecha)

- Quantos itens aparecem de fato por perfil (kids, pro, senior), por flag ligada e por plano.
- O tempo real até a primeira ação, em celular de verdade.
- Quantas vezes cada destino é aberto hoje (telemetria de navegação; não há; ver decisão do dono sobre medir por agregado).
