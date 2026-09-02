# Auditoria — pente-fino dos 9 minijogos pós-Anki (G2)

Documento vivo. Fichas S1–S13 do plano "Seletor facetado de Praticar jogando + pente-fino dos 9
minijogos pós-Anki", conferidas contra o código ATUAL (branch `eval/medicao-de-fala`, após os
commits `b1b23be..1a8432d` mais `2fb0697`). Cada linha citada foi confirmada por Grep/Read nesta
rodada; onde não foi possível confirmar, está marcado "não verificado" — nenhuma linha foi copiada
sem checar.

## Fichas

### S1 — Termo aplica a régua de FALA a baralho curado

- **Evidência (atual)**: `src/core/minigames/termo.ts:50-76` (`motivoForaDoTermo`) e
  `src/core/minigames/quality.ts:465-478` (`pistasDaTriagem`) — os dois pontos que reavaliavam com a
  régua de 42 chars/5 palavras. `quality.ts:470-478` traz um comentário explícito descrevendo o
  defeito antigo e a correção: `pistaUtil(c.translation ?? '', c.daAnki ? 'curado' : 'captura')`.
- **Classe**: mesma família do bug do contador; reprovava como `sem-pista` o que Memória/Duelo
  aceitavam.
- **Correção aplicada**: **Sim** — commit `dbbfa74` ("a régua certa chega ao Termo e aos
  contadores..."). Os dois pontos agora derivam a origem do cartão como `avaliarCartao` faz.
  `idiomasDisponiveis` (`src/core/minigames/source.ts:154`) herda a correção de graça, por já chamar
  `pistasDaTriagem`.
- **Teste que reproduz**: `tests/quality.test.ts` (cobre `pistaUtil`/`avaliarCartao`/`pistasDaTriagem`,
  não confirmado linha a linha); `tests/contagemHonesta.test.ts` (nome sugere cobertura do contador).
  Não localizado um teste específico chamado por "S1" no repositório.

### S2 — Caça-palavras não-latino: grade vazia, nota 1 silenciosa

- **Evidência (atual)**: `src/core/minigames/wordsearch.ts:55-65` (`normalizarPalavra`,
  `entraNaGrade`) e `:73-88` (`naoCouberamDeAntemao`, registra a palavra descartada em vez de
  sumir). `entraNaGrade` é exportada e usada em `src/core/minigames/estadoDosJogos.ts:5,226-227`.
- **Classe**: destruição silenciosa de memória.
- **Correção aplicada**: **Sim** — commit `dbbfa74` ("S2/S3 — alfabeto não-latino"). O caça-palavras
  agora declara `entraNaGrade` como verdade e reporta o que nunca tentou entrar via `naoCouberam`; o
  gate (`estadoDosJogos.ts`) bloqueia o jogo com o motivo `'alfabeto-nao-suportado'`
  (`estadoDosJogos.ts:256-257`, `312-313`, `376-380`) em vez de deixar a rodada esvaziar em silêncio.
- **Teste que reproduz**: `tests/poolDosJogosDePalavra.test.ts`, `tests/elegibilidade.test.ts` (com
  snapshot `tests/__snapshots__/elegibilidade.test.ts.snap`) — nomes compatíveis com a cobertura de
  elegibilidade por alfabeto; não confirmado se testam especificamente japonês sintético.

### S3 — Termo não-latino é insolúvel (teclado QWERTY fixo)

- **Evidência (atual)**: `src/core/minigames/termo.ts:24-41` — `chaveDoTermo` aceita `\p{L}` (linha
  25, comentário confirma "é a chave de COMPARAÇÃO"); `digitavelNoTermo` (linha 40-41) é a nova
  função que testa `/^[A-Z]+$/` sobre a chave, separando "comparável" de "digitável". Consumida em
  `estadoDosJogos.ts:4,227`. Não foi confirmado o estado do teclado em `TermoGame.tsx` (arquivo em
  `src/components/minigames/TermoGame.tsx`) linha a linha — não lido nesta rodada.
- **Classe**: rodada impossível sem gate.
- **Correção aplicada**: **Sim, via gate** — o jogo passa a ser bloqueado com
  `'alfabeto-nao-suportado'` quando o pool é 100% não-latino (mesma correção de S2, commit
  `dbbfa74`). Não verificado se o teclado do Termo ganhou algum modo alternativo para digitar
  não-latino — a correção parece ser "impedir a entrada no jogo", não "tornar o jogo jogável" em
  não-latino.
- **Teste que reproduz**: mesma cobertura de `tests/elegibilidade.test.ts` citada em S2; não
  localizado teste específico de teclado.

### S4 — Os 5 jogos de frase ignoram o chip de baralho / prévia com rótulo falso

- **Evidência (atual)**: `src/core/minigames/revelavel.ts:126-132` (`origemDoMaterial`, com o
  comentário "`declarada` vence sempre... não é corrigido por esta função"). Consumida a partir de
  `Play.tsx` (não relocalizado o call site exato nesta rodada).
- **Classe**: promessa falsa do recorte.
- **Correção aplicada**: **Parcial ("S4-mínimo"), como o próprio plano antecipava** — commit
  `b1b23be`: "jogo de FRASE vive de gravação, e a prévia dizia 'do baralho' com o TÍTULO da gravação
  ao lado... A regra virou função pura no core (`origemDoMaterial`, revelavel.ts), testável —
  `modalidade !== 'palavra'` é o discriminador exato dos cinco jogos de fala". Isto corrige o
  **rótulo da prévia** (honestidade da informação exibida), não o comportamento de fato de os 5
  jogos de frase ignorarem o chip — o próprio plano já registrava esse comportamento como dependente
  de F10 ("Frase do baralho alimentando os 5 jogos de frase"), que segue pendente conforme
  `docs/PROXIMOS-PASSOS.md` (item F10, "Hoje eles vivem das gravações; o caminho existe").
- **Teste que reproduz**: `tests/antessala.test.ts`, `tests/antessala-fases.test.tsx` (26 testes na
  antessala citados no commit `b1b23be`, "3 novos"). Não localizado teste isolado de
  `origemDoMaterial` por nome.

### S5 — Memória: pista de 160 chars vaza da carta

- **Evidência (atual)**: `src/components/minigames/MemoryGame.tsx:154` (`overflow-y-auto` no
  palco) e `:224` (degraus de fonte condicionais ao comprimento da pista — downscale), com `title`
  no verso para leitura completa (`:173+`).
- **Classe**: quebra visual.
- **Correção aplicada**: **Sim** — commit `dbbfa74`, verificado por leitura direta nesta
  rodada de auditoria (overflow + downscale presentes nas linhas acima).
- **Teste que reproduz**: não localizado (defeito visual, tipicamente sem teste automatizado).

### S6 — `exercise_results.origem` genérica; memória curta não reseta por baralho

- **Evidência (atual)**: `src/components/views/Play.tsx:140` (`chaveDaMemoriaCurta`, função nova
  única), usada em `Play.tsx:994` e `Play.tsx:1372`. Substitui os "TRÊS pontos" do plano que
  copiavam a chave.
- **Classe**: estatística contaminada.
- **Correção aplicada**: **Parcial** — commit `b1b23be`: "Agora é UMA função
  (`chaveDaMemoriaCurta`), usada na leitura e na gravação, com o baralho na chave." A `origem`
  persistida em `exercise_results` **continua `'baralho'` genérica de propósito** — o próprio commit
  diz: "A `origem` persistida em exercise_results segue 'baralho' de propósito: separar o histórico
  por baralho é decisão do modelo facetado, não deste conserto." Ou seja: a memória de sessão (não
  repetir a mesma palavra) foi corrigida; a estatística persistida por baralho **não foi**, e o plano
  já registrava essa divisão de escopo.
- **Teste que reproduz**: não localizado teste isolado de `chaveDaMemoriaCurta`.

### S7 — Duelo: enunciado sem clamp, palco sem overflow

- **Evidência (atual)**: `src/components/minigames/BlitzGame.tsx:411` (`min-h-0 overflow-y-auto`
  no palco, com o porquê comentado em `:406-409` — item flex sem `min-h-0` não encolhe abaixo do
  conteúdo) e `:478` (degraus de fonte do enunciado). Verificado por leitura direta nesta rodada.
- **Classe**: quebra visual.
- **Correção aplicada**: **Sim, segundo o commit** `dbbfa74` (mesma mensagem de S5: "...e empurrava
  as alternativas do Duelo para fora de um palco sem rolagem: clamp... e a cadeia flex do Duelo
  ganhou o `min-h-0`"). Não re-verificado diretamente no arquivo nesta rodada.
- **Teste que reproduz**: não localizado.

### S8 — `word` do Anki sem teto de comprimento na projeção

- **Evidência (atual)**: `server/db/repositories/vocab.ts:815-837` (`projetarDoAnki`), linha 837:
  `const motivoDeTamanho = foraDoBulkAdd(palavra)`; import de `foraDoBulkAdd` em `vocab.ts:7`.
  Comentário em `vocab.ts:834` referencia explicitamente o defeito antigo ("virava um
  botão-parágrafo no Duelo").
- **Classe**: falta de teto.
- **Correção aplicada**: **Sim** — commit `7e0972a` ("S8 — palavra sem teto na projeção... agora
  aplica `foraDoBulkAdd`... e anota o motivo na nota em vez de projetar").
- **Teste que reproduz**: `tests/integration/anki-projecao.test.ts` (nome compatível).

### S9 — `acervoDaFonte` devolve `usaveis` sem o recorte do chip; gate usa `jogaveis` recortado

- **Evidência (atual)**: resumo-verdade introduzido no commit `1a8432d`, no `Play.tsx` (linhas não
  relocalizadas individualmente nesta rodada — a mensagem do commit é explícita: "o acervo exibido
  passa pelo MESMO predicado da rodada, então 'Seu baralho', o Mapa, as cartas de jogo, a pílula e o
  resumo derivam de um conjunto só... 599 em TODOS os pontos, onde antes o painel dizia 847 e o
  gate 599 na mesma tela").
- **Classe**: contador incoerente.
- **Correção aplicada**: **Sim** — commit `1a8432d`, descrito acima; é o mesmo commit que faz a
  UI facetada usar `passaNoFiltro` para tudo que a tela exibe.
- **Teste que reproduz**: `tests/integration/filtro-composicao.test.ts`, `tests/filtroDaPratica.test.ts`
  — cobrem o predicado `passaNoFiltro` usado tanto pela exibição quanto pela composição, conforme o
  commit `0b796eb` (teste de paridade SQL × predicado, "18/18" citado na mensagem).

### S10 — `limparCampo` decodifica só 6 entidades; furigana mantém colchetes

- **Evidência (atual)**: `server/import/anki.ts:135-158` (`limparCampo`); linha 158:
  `.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\[[^\]]*\]/gu, '$1')` — remove
  colchetes de furigana só quando seguem caractere CJK, conforme comentário nas linhas 146-158
  ("`[informal]` numa definição sobrevive").
- **Classe**: resíduo de texto.
- **Correção aplicada**: **Sim** — commit `7e0972a` ("S10 — `limparCampo` só desfazia 6
  entidades: decodificação numérica genérica + tabela pequena de nomeadas... e furigana... perde os
  colchetes SÓ quando eles seguem caractere CJK"). Sobre a parte de cloze do plano ("`lacunas`
  extraídas não alimentam jogo nenhum, `clozePrompt`/`Answer` ficam null de propósito") — **não
  verificado** se isso mudou; o plano já descrevia como decisão deliberada, não defeito a corrigir.
- **Teste que reproduz**: não localizado teste isolado de `limparCampo`.

### S11 — Idioma do baralho carimbado pelo idioma do lobby no import

- **Evidência (atual)**: `server/import/anki.ts:876-897` — tabela de assinaturas de escrita
  (`'kana'`, `'hangul'` etc., linha 883: `{ escrita: 'kana', regex: /[\p{Script=Hiragana}\p{Script=Katakana}]/u }`),
  com comentário nas linhas 878-881 e 896-897 explicando a ordem de checagem (kana antes de han) e o
  motivo (deck japonês típico é majoritariamente kanji/Han, então dominância pura erraria). Também
  presente em `server/db/repositories/vocab.ts`, `server/routes/import.ts`, migração
  `server/db/migrations/0019_seletor_facetado.sql` (coluna `src_lang_base`).
- **Classe**: armadilha de rotulagem.
- **Correção aplicada**: **Sim** — commit `7e0972a` ("S11 — importar um deck japonês com o lobby em
  inglês carimbava `srcLang='en'` em todas as notas, silenciosamente. Agora a rota compara o
  cabeçalho com a ESCRITA real do conteúdo... Kana é assinatura exclusiva do japonês... Hangul→'ko'
  pela mesma lógica. O que sobra sem assinatura... fica NULL com aviso na resposta").
- **Teste que reproduz**: `tests/integration/anki-projecao.test.ts`, `tests/idiomaDaRodada.test.ts`
  (nomes compatíveis; conteúdo não lido linha a linha).

### S12 — Escuta: dedupe de alternativas via `normalizarPalavra` A–Z, sobra 1 alternativa em não-latino

- **Evidência (atual)**: `src/core/minigames/escuta.ts:48-59` — nova função `chaveDeTexto` (linha
  59), com comentário nas linhas 48-53 explicando que `normalizarPalavra` (de `wordsearch.ts`)
  "descarta tudo que não é A–Z — em japonês, coreano..." e que a chave nova "não perde nenhuma
  escrita". Usada em `escuta.ts:110` (dedupe de distratores) — diferente de `escuta.ts:170`, que
  ainda usa `normalizarPalavra` com fallback (`normalizarPalavra(s) || s.trim().toLowerCase()`,
  comentado nas linhas 166-170) para outro propósito (comparação de resposta dita).
- **Classe**: menor.
- **Correção aplicada**: **Sim** — commit `dbbfa74` ("S12 — o dedupe de alternativas da Escuta usava
  a normalização A–Z do caça-palavras... Chave própria que funciona em qualquer escrita").
- **Teste que reproduz**: `tests/escuta.test.ts`.

### S13 — Janela de corrida na inicialização (idioma denuncia resposta no Duelo)

- **Evidência (atual)**: `src/components/views/Play.tsx:1428-1435` — comentário explícito ("NADA DE
  COMPOR ANTES DO BARALHO CHEGAR... o carregador resolve os dois no MESMO commit (batching do React
  19)... Compor aqui disparava uma requisição com idioma vazio, e idioma vazio DESLIGA o filtro no
  servidor: a mesma brecha (E4.4)... Auditoria S13.") e a guarda `if (deck == null) return;` na
  linha 1435.
- **Classe**: janela de corrida.
- **Correção aplicada**: **Sim** — commit `b1b23be`. A composição não dispara mais antes de `deck` e
  `fonte.lang` chegarem juntos (o carregador em `Play.tsx:1162-1184` resolve baralho e idioma no
  mesmo efeito, com `Promise.all`).
- **Teste que reproduz**: `tests/antessala.test.ts` / `tests/antessala-fases.test.tsx` (citados no
  commit como "26 testes na antessala, 3 novos"); não confirmado qual teste especificamente cobre a
  janela de corrida.

## Nota honesta sobre o dataset real

Confirmado no código: o commit `1a8432d` registra textualmente "o dataset real não exibe delta
porque os 847 em inglês estão todos vencidos — a exclusão de item futuro está provada no teste de
paridade (caso 'cherry')". Isto é consistente com o caso degenerado descrito na tarefa: com 847/847
cartões do baralho de teste vencidos, ligar/desligar o recorte "pedindo revisão" não produz nenhuma
mudança visível no navegador, porque todos os cartões já pertencem ao recorte. A semântica do
filtro (excluir itens NÃO vencidos) é provada pelo teste de paridade SQL × predicado citado nos
commits `0b796eb` e `1a8432d` ("caso 'cherry'" no teste, não relocalizado literalmente nesta
rodada em `tests/integration/filtro-composicao.test.ts`), não pela observação de produção.

## Tabela final — defeito → estado → commit responsável

| Defeito | Estado | Commit responsável |
|---|---|---|
| S1 — régua de fala no Termo/contadores | Corrigido | `dbbfa74` |
| S2 — caça-palavras não-latino (grade vazia) | Corrigido | `dbbfa74` |
| S3 — Termo não-latino insolúvel | Corrigido (via gate; teclado em si não verificado) | `dbbfa74` |
| S4 — jogos de frase ignoram chip / prévia falsa | Corrigido só o rótulo da prévia ("S4-mínimo"); comportamento de fundo é follow-up (F10) | `b1b23be` |
| S5 — Memória sem clamp | Corrigido (verificado por leitura direta) | `dbbfa74` |
| S6 — memória curta / origem genérica | Corrigido só a memória de sessão; `origem` em `exercise_results` segue genérica por decisão declarada | `b1b23be` |
| S7 — Duelo sem clamp/overflow | Corrigido (verificado por leitura direta) | `dbbfa74` |
| S8 — `word` sem teto na projeção | Corrigido | `7e0972a` |
| S9 — acervo vs gate discordando | Corrigido | `1a8432d` |
| S10 — entidades/furigana em `limparCampo` | Corrigido (parte de cloze não verificada, e não era defeito no plano) | `7e0972a` |
| S11 — idioma do baralho carimbado às cegas | Corrigido | `7e0972a` |
| S12 — dedupe da Escuta em A–Z | Corrigido | `dbbfa74` |
| S13 — janela de corrida na inicialização | Corrigido | `b1b23be` |

Defeitos de fundação facetada citados no plano mas fora da numeração S1–S13 (ex.: `dueToday` global
sem filtro de idioma/aba/chip, unificação dos dois seletores de idioma — D5/Q3) permanecem
registrados como follow-up em `docs/auditoria/seletor-de-conteudo-v1.md`, não como parte desta
tabela de 13 itens.
