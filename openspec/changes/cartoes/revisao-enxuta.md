# A revisão enxuta e as práticas (10/10/2026)

Especificação: `docs/prototipos/cartoes-enxuto.html` (fontes em `cartoes-enxuto-src/cartoes2.js`,
`cartoes4.js` e `cartoes4.css`). O CSS é copiado por `scripts/polimento/trazer-css.mjs` (quinta pasta);
a marcação está em `src/components/views/revisao/` e as contas em `src/lib/revisao/`.

## O que entrou

- **A. Revisão com o mínimo em tela** (`RevisaoDoQuest.tsx`, `Study.tsx`): topo com voltar, barra, "10 / 26",
  desfazer e "…"; a linha de instrução (3 primeiros cartões) ou de aviso, com o lugar sempre reservado; a
  frente com uma fileira; o verso com uma fileira de notas (4, ou 2 pelo ajuste novo "Botões de resposta");
  a folha do "…" (`FolhaDoMais.tsx`); a linha de teclas só com teclado; gestos no celular.
- **B. Cena no verso** (`lib/revisao/cena.ts`, `pecas.tsx`): frase, quem falou, tempo, "Abrir na sessão", na
  versão de onda. Nada é lido na frente; o áudio só desce no toque (`lib/revisao/falaOriginal.ts`).
  "Juntar a cena" para cartão trazido cuja palavra está numa sessão da pessoa (uma consulta de ocorrências).
- **C. Minha voz** (`Gravador.tsx`, `FolhaMinhaVoz.tsx`, `lib/revisao/vozGuardada.ts`): sem nota; guardar
  desligado de fábrica e só no aparelho (IndexedDB); palpite do aparelho desligado até a pessoa ligar e só
  onde o perfil pode usar o reconhecimento do navegador.
- **D. Dizer antes de virar**: um de cada três cartões, "Agora não" e o interruptor na folha.
- **E. Praticar de outro jeito** (`FolhaPraticar.tsx`, `Pratica.tsx`, `lib/revisao/pratica.ts`): Falar, Ouvir
  e escrever, Completar e Jogo rápido sobre um recorte de cartões.
- **F. Palavra que não entra** (`FolhaDasSaidas.tsx`): a linha e três saídas (trocar a frase, rever a cena,
  descansar 30 dias).
- **G. Fim da sessão enxuto**: 3 números, o ganho creditado, o que mudou, missão e sequência quando existem,
  dois botões.

## O que cada prática grava

| Prática | O que vai ao servidor |
| --- | --- |
| Falar, Ouvir e escrever, Completar | No fim da prática, uma nota por cartão em `POST /api/vocab/:id/review`: Bom (3) se lembrou, Errei (1) se não, com `origem: 'pratica:<tipo>'` e `formato: <tipo>`. Sair no meio não grava nada. |
| Jogo rápido | A rodada abre no Jogar com `semAgenda`: nenhuma nota vai ao agendador. O resultado do jogo (`/rodada`) e o XP dele continuam valendo. |
| Minha voz, Dizer antes de virar | Nada. |
| Deixar para amanhã, Descansar 30 dias | `PATCH /api/vocab/:id` com `adiarAte`: só a data de vencer. Sem linha em `review_logs`. |

## Como abrir a folha das práticas de outra tela

```ts
onChangeView('study', { praticar: { origem: 'hoje' | 'baralho' | 'selecao' | 'escaparam' | 'sessao', rotulo, ids?, sessionId? } })
```

Sem `ids`, a revisão resolve o recorte: os cartões da sessão (`sessionId`) ou os que vencem agora. Já ligado:
o baralho "Tudo" e os baralhos de sessão (aba Baralhos) e o fim da sessão. Hoje e a seleção de Palavras
ainda não chamam.

## O que ficou de fora, e por quê

- **Treinar o ouvido, Desafiar um amigo, Bônus de hoje, Ver todos os jogos**: pedem dado ou servidor que não
  existe (pares de som, convite, bônus) ou um saguão do Jogar que receba recorte.
- **Bandeira, Perguntar ao tutor** (folha do "…"): o cartão não tem campo de bandeira; o tutor não abre com
  uma palavra. O terceiro botão grande é "Suspender".
- **Escrever um lembrete seu** (palavra que não entra): o cartão não tem campo de nota.
- **A cena de vídeo**: o app não guarda quadro; a cena é sempre a de onda.
- **A tabela de revisões, uma a uma**, nas informações do cartão: não há rota que liste o histórico; aparecem
  as contagens.
- **Quem erra revê na mesma sessão** e **a fila de notas guardada sem rede**: são os itens 2.4 e 2.5 desta
  change. A linha "Sem rede" existe e manda de novo as notas que não foram gravadas enquanto a tela está
  aberta; nada fica guardado depois de fechar.
- **O limite de erros do aviso** é fixo em 8 (o ajuste "Avisar de palavra difícil" é o item 8.2).

## Prova

`scripts/polimento/roteiros/revisao-enxuta-*.json` (gerados por `_gerar-revisao-enxuta.mjs`) com o banco de
`scripts/polimento/semear-revisao.mjs`; `scripts/polimento/ver-revisao.mjs` percorre os estados e tira as
capturas. Testes: `tests/revisaoEnxuta.test.ts`, `tests/revisaoEnxutaTela.test.tsx`,
`tests/questRevisao.test.tsx`, `tests/caracterizacao/vocab-adiar-e-pratica.test.ts`.
