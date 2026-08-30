## 1. Bancada multi-modelo

- [ ] 1.1 Extrair `BASE`/`chaveDaGroq()` de `medir-traducao-llm.mjs:49-61` para uma resolução por
      provedor, aceitando `OPENROUTER_API_KEY` além de `GROQ_API_KEY`
- [ ] 1.2 Aceitar `--modelos a,b,c` e envolver a avaliação num laço por modelo, acumulando
      `resultados[]` no padrão de `medir-wer.mjs:180`
- [ ] 1.3 Falha de um modelo não interrompe a bateria: registrar erro por modelo e seguir
- [ ] 1.4 Marcar como inválido o modelo que falhar em mais de 10% dos casos, e excluí-lo do ranking
- [ ] 1.5 Ler preço do catálogo ao vivo do provedor, gravando valor e data no resultado; preço
      ausente vira "desconhecido", nunca zero
- [ ] 1.6 Template de prompt por família: comunicativo (padrão) e o formato documentado dos modelos
      dedicados a tradução, registrando no resultado qual foi usado

## 2. Juiz e métrica dupla

- [ ] 2.1 Rubrica de julgamento (adequação, naturalidade, registro) penalizando explicitamente a
      formalização de fala informal — o viés conhecido de juiz LLM
- [ ] 2.2 Passe de julgamento sobre as saídas já geradas, com juiz fixo e fora do conjunto avaliado
- [ ] 2.3 Relatar chrF++ e juiz lado a lado, e listar os casos em que as duas métricas discordam

## 3. Corpus

- [ ] 3.1 Primeira passada nos 16 casos atuais, com todos os candidatos, só para ELIMINAR
- [ ] 3.2 Ampliar `gold-traducao-v0.jsonl` para ~60 casos (~10 por categoria), mantendo o esquema
- [ ] 3.3 Baixar subconjunto en→pt do FLORES-200 (`Muennighoff/flores200`, devtest, ~200 frases)
      no padrão de `baixar-corpus.py`: dados fora do git, manifesto versionado
- [ ] 3.4 Segunda passada: finalistas no gold set ampliado e no FLORES

## 4. Confiança no resultado

- [ ] 4.1 Rodar cada finalista duas vezes e reportar a variação entre execuções
- [ ] 4.2 Declarar empate técnico quando a diferença entre modelos for menor que essa variação

## 5. Relatório

- [ ] 5.1 Gravar JSON bruto caso a caso em `docs/auditoria/eval/`
- [ ] 5.2 Escrever `docs/auditoria/eval-modelos-v1.md` com a tabela qualidade × custo por mil falas,
      exemplos das discordâncias, e o que os números NÃO provam
- [ ] 5.3 Registrar, por provedor recomendado, a política de uso do conteúdo para treinamento

## 6. Verificação

- [ ] 6.1 `npm run typecheck` e `npx vitest run` verdes
- [ ] 6.2 `openspec validate bancada-multi-modelo` passando
