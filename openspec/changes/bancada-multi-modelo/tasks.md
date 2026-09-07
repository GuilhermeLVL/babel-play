> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 2 tarefas abertas: 3.4 bloqueada por conta/creditos de provedor, 5.3 e pesquisa. Achado A31 (7 clientes LLM, `OLLAMA_URL` e `gemini-2.0-flash` cravados) e tratado em `servicos-sem-duplicata`; nada aqui depende dele.

## 1. Bancada multi-modelo

- [x] 1.1 Extrair `BASE`/`chaveDaGroq()` de `medir-traducao-llm.mjs:49-61` para uma resolução por
      provedor, aceitando `OPENROUTER_API_KEY` além de `GROQ_API_KEY`
- [x] 1.2 Aceitar `--modelos a,b,c` e envolver a avaliação num laço por modelo, acumulando
      `resultados[]` no padrão de `medir-wer.mjs:180`
- [x] 1.3 Falha de um modelo não interrompe a bateria: registrar erro por modelo e seguir
- [x] 1.4 Marcar como inválido o modelo que falhar em mais de 10% dos casos, e excluí-lo do ranking
- [x] 1.5 Ler preço do catálogo ao vivo do provedor, gravando valor e data no resultado; preço
      ausente vira "desconhecido", nunca zero
- [x] 1.6 Template de prompt por família: comunicativo (padrão) e o formato documentado dos modelos
      dedicados a tradução, registrando no resultado qual foi usado

## 2. Juiz e métrica dupla

- [x] 2.1 Rubrica de julgamento (adequação, naturalidade, registro) penalizando explicitamente a
      formalização de fala informal — o viés conhecido de juiz LLM
- [x] 2.2 Passe de julgamento sobre as saídas já geradas, com juiz fixo e fora do conjunto avaliado
- [x] 2.3 Relatar chrF++ e juiz lado a lado, e listar os casos em que as duas métricas discordam

## 3. Corpus

- [x] 3.1 Primeira passada nos 16 casos atuais, com todos os candidatos, só para ELIMINAR
- [x] 3.2 Ampliar `gold-traducao-v0.jsonl` para ~60 casos (~10 por categoria), mantendo o esquema
- [x] 3.3 Baixar subconjunto en→pt do FLORES-200 (`Muennighoff/flores200`, devtest, ~200 frases)
      no padrão de `baixar-corpus.py`: dados fora do git, manifesto versionado
- [ ] 3.4 Segunda passada: finalistas no gold set ampliado e no FLORES — **BLOQUEADO**: conta
      do OpenRouter sem saldo (parou na 84ª de 800 chamadas, HTTP 402)

## 4. Confiança no resultado

- [x] 4.1 Rodar cada finalista duas vezes e reportar a variação entre execuções — feito em 3
      voltas nos 16 casos; falta repetir no corpus grande (ver 3.4)
- [x] 4.2 Declarar empate técnico quando a diferença entre modelos for menor que essa variação

## 5. Relatório

- [x] 5.1 Gravar JSON bruto caso a caso em `docs/auditoria/eval/`
- [x] 5.2 Escrever `docs/auditoria/eval-modelos-v1.md` com a tabela qualidade × custo por mil falas,
      exemplos das discordâncias, e o que os números NÃO provam
- [ ] 5.3 Registrar, por provedor recomendado, a política de uso do conteúdo para treinamento —
      pendente: só faz sentido depois de haver um provedor recomendado (ver 3.4)

## 6. Verificação

- [x] 6.1 `npm run typecheck` e `npx vitest run` verdes
- [x] 6.2 `openspec validate bancada-multi-modelo` passando
