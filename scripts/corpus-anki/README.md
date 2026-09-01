# corpus-anki — medição do gate G2

Ferramentas para medir baralhos Anki REAIS contra o importador (`server/import/anki.ts`), a régua
de qualidade (`src/core/learning/quality.ts`) e a elegibilidade de minigames
(`src/core/minigames/types.ts`). Existe para responder, com número, as perguntas do gate G2:
quantas notas, quanto tempo, quanta memória, quantas passam na régua, quantas alimentam cada jogo.

## Como rodar

```bash
npx tsx scripts/corpus-anki/medir.ts --dir "C:/caminho/com/apkgs" [--saida docs/pesquisa/motor-anki/corpus.json]
```

- `--dir` (obrigatório) — pasta com os `.apkg`/`.colpkg`/`.txt` a medir. Veja `baixar.md` para como
  obter baralhos reais para testar.
- `--saida` (opcional) — caminho do JSON com as métricas completas. Sem ele, o script só imprime a
  tabela no stdout.

Diretório vazio ou inexistente não é erro fatal na primeira leitura (mensagem clara), mas um
diretório inexistente sai com código 1; um diretório vazio sai com código 0 e nada para medir.

## O que cada coluna da tabela significa

| coluna | significado |
|---|---|
| `arquivo` | nome do arquivo (truncado a 32 chars) |
| `notas` | notas lidas do baralho (antes da régua) |
| `aprov.` | quantas passam em `avaliarCartao` (a régua de qualidade do app) |
| `%` | `aprov. / notas` |
| `jogos` | quantos dos 9 minigames (`MINIGAMES` em `types.ts`) têm material suficiente |
| `ms` | tempo de leitura (`lerApkg`/`lerTextoAnki`), em milissegundos |
| `MB` | pico de `process.memoryUsage().rss` amostrado durante a leitura |

O JSON de saída (`--saida`) carrega tudo isso mais: `formatoInterno` (qual `collection.anki2/21/
21b` o baralho usa), `campos` (nomes dos campos do baralho), `temMidia`, o histograma de descarte
por `MotivoDescarte` (`sem-pista`, `pista-ruim`, `gramatical` etc.), a elegibilidade detalhada por
`MinigameId` (itens disponíveis vs. `minItems` exigido), e uma amostra de 3 notas (frente/verso
truncados) para inspeção humana. Arquivos que falharam na leitura aparecem em `erros`, sem
interromper a medição dos demais.

## Suposições e aproximações (leia antes de confiar nos números)

- **Idioma do cartão**: inferido do NOME DO ARQUIVO por palavras-chave (japonês, chinês, árabe,
  russo, inglês etc.); sem pista reconhecida, assume `en`. A régua roda com `exigirIdioma: false`,
  então isso só afeta qual lista de palavras gramaticais (`ehGramatical`) é aplicada — não faz um
  cartão bom ser reprovado, só pode deixar passar uma palavra gramatical se o idioma inferido
  estiver errado.
- **Elegibilidade do Termo**: aproxima a régua real (`motivoForaDoTermo` em
  `src/core/minigames/termo.ts`), que também varia por faixa de dificuldade (facil/medio/dificil).
  Aqui é medida só a faixa `medio` (4–6 letras, sem hífen/espaço), a mais permissiva das três —
  suficiente para dizer "há material", não para reproduzir a escada inteira do jogo.
- **`.colpkg`** (backup completo do Anki) é lido pelo mesmo caminho que `.apkg`: ambos são ZIPs
  com `collection.anki2/21/21b` dentro. Não testado contra um `.colpkg` real nesta rodada — se a
  estrutura divergir, o erro aparecerá isolado em `erros`, sem derrubar o lote.

## Baralhos NUNCA entram no repositório

Só este script, `baixar.md` e o JSON de métricas (`--saida`) são versionados. Os `.apkg`/`.colpkg`
em si ficam numa pasta fora do repo — são grandes e têm licença do autor original do baralho, não
do app. Veja `baixar.md` para a lista de baralhos candidatos e como baixá-los.
