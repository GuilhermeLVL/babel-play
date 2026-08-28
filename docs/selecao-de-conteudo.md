# Seleção de conteúdo v2 — como cada jogo escolhe o que cai (2026-08-28)

## Princípios

1. **Uma memória por item, em todos os jogos.** `item_ref` = a palavra (jogos de palavra) ou o id
   da fala/frase (jogos de frase). O histórico (`/api/exercises/historico`) devolve por item:
   `vezes, erros, ultimoAcerto, ultimaEm, errosSeguidos, rodadasDesdeUltimoErro`.
2. **Erro volta espaçado**, não imediato (`core/learning/memoriaDeItens.ts`): 1º erro → 2 rodadas;
   2º seguido → 4; 3º → dia seguinte; **4º seguido → leech** ("difícil para você"): sai do sorteio e
   volta só na **rodada de resgate** (só ela + 2 fáceis). Um acerto zera a contagem.
3. **Rotação por jogo**: embaralhamento com semente `<jogo>:<dia>` dentro de cada camada — o mesmo
   acervo não rende as mesmas palavras em todos os jogos no mesmo dia; e a mesma rodada é
   reproduzível no dia (testável).
4. **Dificuldade mira 70-90% de acerto** (`core/minigames/autoDificuldade.ts`): modo Auto (padrão)
   sobe/desce um degrau a cada 3 rodadas do jogo, com o motivo na antessala. Novato começa em Fácil.
   Chips manuais continuam e assumem o controle ao serem tocados.
5. **Toda escolha tem motivo legível** na antessala ("Por que estas?": voltando por erro · vencidas ·
   novas · em aprendizado · firmes) e "Como funciona" gerado das constantes.

## A ordem de prioridade (`ordenarPorMemoria`)

(1) errando com janela vencida → (2) vencidas no agendador (FSRS) → (3) novas (cota ≥ 30% da
rodada) → (4) aprendendo → (5) firmes. Leeches ficam de fora; errando com janela aberta vai ao fim
(nunca some: acervo pequeno prefere repetir a ficar sem rodada). `evitar` (o que caiu nas últimas
rodadas, persistido por origem em `babel.vistas.<origem>`, teto 200) é EXCLUSÃO quando sobra
material, demoção quando não sobra.

## Por jogo

| jogo | unidade | precisa | fonte na trilha | memória |
| --- | --- | --- | --- | --- |
| memory, wordsearch, blitz, termo | palavra | tradução (memory/termo) | etapa atual + errando/vencidas | FSRS + memória |
| scramble | frase | frase | frases Tatoeba (`frasesDaTrilha`) | memória por id |
| karaoke, escuta, ditado | frase + áudio | áudio ou TTS | palavra falada por TTS | memória por id |
| conectores | frase | frase com conector | (bloqueado: só 4,5% das frases têm conector) | memória por id |

Trilha: a rodada recorta pela **etapa atual** (primeira com < 80% das palavras no caderno) mais o
que está voltando por erro ou vencido — a revisão espaçada natural. `cartoesDaTrilha` agora atribui
`difficultyScore` por CEFR curado + comprimento, então Auto e chips funcionam na trilha.

Composição: o fallback local passou a **balancear 50% médio / 25% fácil / 25% difícil** como o
servidor, e guarda os `cortes` que o servidor usou para rotular a faixa igual.

## Termo justo (`core/minigames/termo.ts`)

- Chave Unicode (`chaveDoTermo`): acentos ignorados, letras não-latinas preservadas; palavras com
  hífen/espaço ficam fora com motivo dito na antessala (`diagnosticoTermo`).
- **Sinônimos do acervo**: cada rodada carrega `alternativas` (outras palavras com a mesma
  tradução). Palpite = sinônimo → não gasta tentativa, orienta ("a desta rodada tem 6 letras e
  começa com S") e revela a 1ª letra. Pista ambígua nasce com a frase de contexto.
- **Quase**: a uma letra da resposta na última tentativa → aviso, sem gastar (1× por tabuleiro).
- Dica por tabuleiro (não por degrau); ouvir não é dica; acabar as tentativas não é "revelou";
  tempo por tabuleiro.

## Follow-ups

- Edição completa (Postgres): calcular `errosSeguidos`/`rodadasDesdeUltimoErro` em
  `exerciseResults.listarHistoricoPorItem` (mesma conta do servidor efêmero).
- Rodada de resgate com regras próprias por jogo (Duelo sem cronômetro) — hoje é a rodada normal
  restrita aos leeches + 2 fáceis.
