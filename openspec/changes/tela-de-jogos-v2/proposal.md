## Why

A tela `Praticar / Jogar` é a **menos gamificada** de um app em formato de jogo, e a auditoria de
01/09 (`docs/auditoria/tela-de-jogos-v1.md` — 48 achados confirmados de 49, cada um submetido a um
cético que tentou refutá-lo abrindo o código) mostrou que o problema não é falta de recurso: é
excesso de mobiliário sobre recursos que já existem.

Medido na tela rodando: **317 palavras, 57 botões, e 27 deles (47%) servem só para reordenar cartas**.
São **3 telas cheias** entre abrir "Jogar" e ver o primeiro item.

E **11 achados são defeitos de correção**, não de gosto:

- o botão "Jogar" da Sala de Escolha **não joga** — `SalaDeEscolha.tsx:364` chama `aplicarEscolha`
  (`Play.tsx:1136`), que nunca chama `pedirParaJogar`;
- na trilha, **acertar não conta na memória** enquanto o cabeçalho e as fichas prometem que conta —
  o cartão nasce com `id: ''` (`trilha.ts:147`) e cai no ramo `drill`;
- **falha de rede aparece como "Você ainda não salvou palavras"** — `Play.tsx:937-952`, onde no ramo
  de erro `deck` nunca sai de `null`.

A separação "trilha × conteúdo capturado" **já existe e é exclusiva** (`src/core/minigames/source.ts:23`
e `:74-98`, com o servidor concordando em `server/db/repositories/vocab.ts:476-486`). Ela só não
aparece: vive dentro de um modal atrás do link `trocar`. É a segunda vez que o projeto quase
reconstruiu algo pronto — registrado em `docs/historico/PROXIMOS-PASSOS.md`, seção "Armadilhas já pagas".

## What Changes

- **Consertar as promessas quebradas** (11 defeitos), independentes entre si e do redesenho.
- **A fonte vira a primeira leitura**: abas Trilha / Minhas gravações / Difíceis no topo, cada uma com
  faixa de contexto própria. A trilha passa a parecer curso (etapa N de M, o trecho, quanto falta).
- **Um clique até jogar**: inverter dois defaults (`salaAberta`, `pularSempre`). As duas saídas de
  volta **já existem** em `Play.tsx:2054` e `:2479` — é default, não construção.
- **O cromo sai da carta**: reordenar e fixar viram o modo "Organizar" da grade; o `?` vira detalhe.
- **As 9 artes viram sistema**: cor = família do jogo (palavra / frase / escuta), silhueta = jogo,
  **uma** metáfora por carta. Hoje três artes são o mesmo desenho e duas desenham sobre o fundo.
- **Bloqueio pela porta**, não pela falta; descrição e motivo passam a mudar com a fonte.
- **Ficha e antessala viram uma folha só**, com fatos diferentes de zero.
- **Multi-idioma**: a trilha deixa de ser inglês-fixo (três pontos de troca), com faixas por
  frequência rotuladas como tal, e os jogos ganham o caminho para a rodada mista.

Protótipo navegável já validado no Chrome: `docs/prototipos/jogos-redesign.html` — **189 palavras e
32 botões** no estado padrão, com o mesmo conjunto de recursos.

## Impact

- `src/components/views/Play.tsx` (2.611 linhas), `play/jogos.tsx`, `play/IconesPixel.tsx`
- `src/components/minigames/`: `ArteDosJogos.tsx`, `SalaDeEscolha.tsx`, `AntessalaDaRodada.tsx`,
  `ComoSeJoga.tsx`, `ScratchReward.tsx`
- `src/core/minigames/`: `source.ts`, `estadoDosJogos.ts`, `types.ts`, `wordsearch.ts`, `itemSource.ts`
- `src/core/learning/`: `trilha.ts`, `cefrWordlist.ts`, `quality.ts`, `cloze.ts`
- `src/data/trilha/` (dado novo por idioma), `src/lib/tts.ts`
- **Sem migração de banco**: o progresso da trilha é derivado por interseção, nunca gravado.

## Revisão de 25/11/2026

- **Estado: pronta para executar, mas só depois de `polimento-movimento`; vale reduzir o escopo.** Dos 48 achados da auditoria, os 11 defeitos de correção (bloco 1) e as artes, as abas de fonte, os defaults, o modo Organizar, o bloqueio pela porta e as trilhas em es, fr, de e it estão feitos. Abertas: 2.6b, 2.8, 2.9, 2.10, 4.7 e 5.2. Das seis, duas viraram quase conferência: 4.7 (o bloqueio de `Intl.Segmenter` caiu; `segmentacao.ts` cobre ja, zh e th) e 2.6b (a ficha "Como se joga" e o nível por jogo vieram do polimento).
- **O que ficou velho:** a "Sala de Escolha" e a "faixa de contexto" foram substituídas pela ficha de conteúdo (seletor único com Cartões e Biblioteca); o protótipo `docs/prototipos/jogos-redesign.html` cedeu ao desenho do polimento; `Play.tsx` tem 4.037 linhas (era 2.611) e as referências de linha do design estão todas defasadas; `TermoGame.tsx` virou `TermoDoPrototipo.tsx`. O PR #202 zerou o bônus de velocidade, então qualquer folha nova não o cita. Specs ganharam quatro requisitos novos.
- **Esforço: M** (era "6 tarefas"): 2.9 (inventário refeito) e 2.10 (fundir o painel) são o miolo; 5.2 é P; 4.7 é P mais conferência em aparelho; 2.6b e 2.8 são P a M.
- **Valor para quem usa: médio.** Menos mobília na tela e menos "Jogar" que não joga; 5.2 destrava o Termo para es, de e pt; 4.7 abre jogos de frase para ja e zh. Sem custo de IA nem mudança de plano.
- **Dependências:** `polimento-movimento` ANTES (os dois mexem em `Play.tsx`, na antessala e na pausa); `cartoes` (a ficha de conteúdo é compartilhada); `modelo-do-aluno-e-dados` 3.3 (seletor único dos jogos) depois desta. Arquivos de conflito: `src/components/views/Play.tsx`, `src/components/minigames/{SalaDeEscolha,AntessalaDaRodada,TermoDoPrototipo}.tsx`, `src/components/views/PainelTrilha.tsx`, `src/core/minigames/desbloqueio.ts`.
- **Decisões do dono:**
  1. Fundir `PainelTrilha` e a faixa de contexto (2.10): (a) fica o painel, que tem a informação melhor, e a ficha de conteúdo mostra só o resumo de uma linha (recomendado); (b) fica só a ficha; (c) manter os dois e arquivar a tarefa.
  2. Escopo: (a) fechar só 5.2, 4.7 e 2.6b, e arquivar 2.8, 2.9 e 2.10 como "absorvidas pelo polimento" (recomendado, depois de conferir o inventário); (b) fazer tudo; (c) arquivar a change inteira agora e abrir uma nova só para o teclado do Termo.
  3. Coreano: (a) fora do escopo até haver segmentação e teclado de hangul no Quest (recomendado); (b) planejar agora.
