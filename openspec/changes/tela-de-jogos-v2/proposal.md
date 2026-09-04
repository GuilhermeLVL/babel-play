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
reconstruiu algo pronto — registrado em `docs/PROXIMOS-PASSOS.md`, seção "Armadilhas já pagas".

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
