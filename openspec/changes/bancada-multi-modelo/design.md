## Context

Já existe `scripts/eval-fala/medir-traducao-llm.mjs`: mede UM modelo, usando o prompt real de
produção (`systemComunicativo`/`userComunicativo`, compartilhado com `server/ai/mtProxy.ts:82-84`) e
o chrF++ de `src/core/eval/chrf.ts`. A função `traduzir()` já fala OpenAI-compatible puro, então
serve para qualquer provedor sem alteração.

O padrão de runner que compara variantes numa rodada também já existe: `medir-wer.mjs` compara
modelo × dica de idioma e acumula `resultados[]`. Esta mudança copia essa forma em vez de inventar
outra.

Gold sets em disco hoje: `gold-traducao-v0.jsonl` (16 casos, campos `id, categoria, origem,
referencia, contexto[], nota`), `corpus-pt-br.jsonl` (48 áudios CORAA) e 7 cenários de diarização.

## Goals / Non-Goals

**Goals:**
- Rankear candidatos por **qualidade em fala espontânea pt-BR**, com custo medido ao lado.
- Produzir um resultado **auditável**: JSON bruto caso a caso, para que qualquer conclusão possa ser
  conferida sem repetir a bateria.
- Manter fidelidade ao produto: mesmo prompt, mesma temperatura, mesmo contexto de 3 falas.

**Non-Goals:**
- **Não** trocar o motor de produção. Isso é outra mudança, que consome estes números.
- **Não** medir latência como número de produção — camada gratuita tem limite de requisição, e
  latência ali não descreve o que o usuário veria.
- **Não** avaliar STT nesta mudança (fica em `medir-wer.mjs`, separada).

## Decisions

**1. Duas métricas, não uma.** chrF++ mede distância de superfície contra uma referência única, e
foi medido errando: marcou "Tá chovendo pra caramba" como fraca sendo a tradução mais natural do
conjunto. Entra um juiz LLM com rubrica (adequação, naturalidade, registro). O juiz é **fixo para
todos os candidatos** e **nunca um dos candidatos**, senão o teste vira autoavaliação. Onde as duas
métricas discordarem, a discordância vai para o relatório: é informação sobre o gold set, não
defeito.

**2. Funil em duas passadas, para não gastar corpus grande com candidato ruim.** Primeira passada
nos 16 casos atuais, com todos os candidatos, só para eliminar os obviamente fracos. Segunda passada
com os finalistas no gold set ampliado (~60 casos) mais o subconjunto do FLORES-200. Barato onde
pode, caro só onde decide.

**3. Preço vem do catálogo ao vivo, não de constante.** `medir-traducao-llm.mjs:119` tem hoje
`{entrada: 0.15, saida: 0.6}` fixo. Vira consulta ao endpoint de modelos do provedor, com o valor e
a data gravados no JSON de resultado. Este projeto já perdeu um modelo inteiro em dias; preço fixo
em código é dívida garantida.

**4. Custo medido, não tabelado.** O `usage` de cada resposta é somado por modelo. Nos modelos de
raciocínio a saída inclui os tokens de pensamento — medido: 133 contra 31 tokens no mesmo caso
conforme o `reasoning_effort`. Sem isso a comparação de custo entre um modelo de raciocínio e um
direto é falsa.

**5. Reprodutibilidade antes de pódio.** Cada candidato finalista roda **duas vezes**. Se a variação
entre execuções do mesmo modelo for da ordem da diferença entre modelos, não há ranking — e o
relatório diz isso, em vez de fingir uma ordem.

**6. Os modelos dedicados a tradução entram com o prompt DELES.** O `Hunyuan-MT` não tem system
prompt e usa um template próprio ("Translate the following segment into <lang>, without additional
explanation"). Forçá-lo ao nosso prompt comunicativo mediria a nossa capacidade de contrariá-lo, não
a dele de traduzir. Cada família usa o formato que seus autores documentam, e o relatório diz qual
foi usado — inclusive porque isso muda o custo de entrada.

## Risks / Trade-offs

- **16 casos não rankeiam 9 modelos.** É por isso que a primeira passada só **elimina**, nunca
  escolhe. Confundir as duas coisas seria produzir um pódio de ruído.
- **Juiz LLM tem viés conhecido** — costuma preferir texto mais longo e mais formal, o oposto do que
  queremos em fala. A rubrica precisa penalizar explicitamente a formalização, e a concordância
  entre juiz e chrF++ vira parte do relatório.
- **Camada gratuita limita requisições**, o que pode obrigar a serializar e alongar a bateria. É
  custo de tempo, não de dinheiro; aceitável.
- **O gold set é nosso**, não é benchmark público. Por isso o FLORES-200 entra ao lado: ele não
  mede fala, mas é comparável com o resto do mundo e serve de controle contra um gold set enviesado
  pelas nossas próprias intuições.
