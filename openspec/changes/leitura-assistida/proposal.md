> **Leitura assistida:** seleção confiável no leitor, tradução flutuante do trecho grifado, destaque pelo vocabulário da pessoa e IA
> de "Ajustar nível" (A1 a C2). Pedido do dono de 27/11/2026 (capturas 16 a 19). Pesquisa: `scratchpad/leitura-assistida/pesquisa.md`.

## O que já existe (não repetir)

- `src/lib/leitor/selecao.ts`: `palavraEm`/`palavraNoPonto` (caret + `Intl.Segmenter`), `fraseDoRange`, `citacaoDoRange`, `ouvirGestos`,
  `vigiarSelecao`; reconhecedor de gesto em `src/core/leitura/gestoDoLeitor.ts` (`toque|selecao|arrasto|longo|demorado|limpar|duplo`).
- `BarraDaSelecao.tsx` (cores, nota, traduzir, explicar), `PainelDaTraducao.tsx`, `CartaoDaPalavra.tsx`, `GlosaDoLeitor.tsx`,
  `ganchosDaPalavra.tsx` (stub das etiquetas do leitor).
- Estado das ferramentas de IA: `src/core/leitura/ferramentasDeIa.ts` (`em-breve > entrar > idade > plano > cota > sem-conexao`).
- Força 1 a 4 do cartão: `src/core/learning/forcaDoCartao.ts`; "Já sei"/"Ignorar" (`palavras-marcadas`); lista CEFR: `src/core/learning/cefrWordlist.ts`.
- IA do servidor: `server/ai/nucleo/*` (inclui `saidaFiltrada.ts`, `traduzirNoNivel.ts`, `explicarFrase.ts`), cascata e níveis em `server/ai/niveis.ts`.
- Change irmã `status-da-palavra-na-legenda` (flag `forca_na_legenda`): leva a força à legenda e ao leitor. Esta change a USA e não a repete.

## Why

1. **Escuta guiada (16.png):** o player cobre a transcrição no computador e destoa do resto.
2. **Seleção (17, 18):** a seleção pula coluna, pega texto a mais e exige retrabalho. É a maior dor e a base de tudo o que vem depois
   (tradução, vocabulário e IA agem sobre o trecho selecionado).
3. **Tradução:** hoje exige abrir painel e clicar; quem lê no dia a dia quer soltar o dedo e ver.
4. **Vocabulário (estilo LingQ):** a pessoa não vê, no texto, o que já descobriu. O LingQ resolve com cor por status, mas com status manual
   e "paginar infla o conhecido". Aqui a intensidade vem da força FSRS (derivada, sem status manual a manter).
5. **Nível:** texto acima ou abaixo do nível trava a leitura; reescrever no nível da pessoa, preservando o que ela já sabe, é o ganho prático.
6. **19.png:** o círculo vermelho com ponto é o cursor da gravação de tela do dono (aparece também em 17.png sobre "was"). Não é do app;
   NADA a corrigir.

## What Changes

Quatro fatias com donos de arquivo disjuntos, mais uma Fatia 0 (contrato) pequena que sai primeiro. Tudo novo atrás de flag NASCIDA
DESLIGADA e sem regra de plano. Design original mantido: polimento dentro dos tokens e componentes existentes, sem redesenho.

| Fatia | O que                                                                             | Flag                                             |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0     | Contrato (tipos, flags, pontos de encaixe no `Leitor.tsx`)                        | declara as 5 flags                               |
| A     | Player da escuta compacto; seleção firme (snap, gestos, alças, coluna, parágrafo) | `escuta_player_compacto`, `leitor_selecao_firme` |
| B     | Modo tradução e ações de leitura                                                  | `leitor_modo_traducao`                           |
| C     | Destaque por vocabulário e cartão da palavra                                      | `leitor_destaque_vocab`                          |
| D     | IA "Ajustar nível" e ações de IA de 1 toque                                       | `ia_ajustar_nivel`                               |

Ideias proativas entram como tarefas pequenas na fatia dona (ver `tasks.md`): % de palavras conhecidas antes do capítulo (C), 5 cartões
no fim do capítulo (C), régua de densidade (C), atalhos de teclado (B), exportar grifos com traduções (B), ditado de uma frase grifada (B).

## Fora do escopo

Redesenho; alças arrastáveis ao vivo no Safari antes de provar o gesto no WebKit; "Página conhecida" automática (só por botão; marcar ao
paginar é opt-in desligado, ver C); áudio novo (ditado e leitura usam o TTS atual); qualquer provedor Gemini.

## Impact

Menores: toda saída de IA nova passa por `saidaFiltrada` com perfil protegido; retenção zero (o servidor não guarda o texto do livro;
cache do ajuste fica no aparelho). Custo: modelo mais barato que não piora a UX, declarado por chamada (D); cotas só em
`src/core/planos.ts`. Migrações reservadas (uma por flag, na ordem da tabela): PG 0044 a 0048 e SQLite 0083 a 0087, para não colidir.
