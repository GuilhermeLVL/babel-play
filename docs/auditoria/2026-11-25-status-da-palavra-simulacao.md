# Simulação do mapa força -> etiqueta (status-da-palavra-na-legenda, tarefa 1.1)

Data: 25/11/2026. Script: `npx tsx scripts/etiquetas/simular-forca.ts` (offline, sem tela, sem flag, sem rede).
Entrada: deck sintético determinístico (semente 1, 5.000 cartões: ~25% sem revisão, o resto com estabilidade log-uniforme de
0,3 a 250 dias, 20% com esquecimentos). O corpus Anki de teste (`tests/fixtures/*.apkg`) não traz estabilidade FSRS, então não
serve de entrada; o deck do dono entra como JSON (`--deck`), tarefa 1.2 **[D]** (aberta).

## Resultado (sintético, 5.000 cartões)

| Mapa (força -> etiqueta)    | Mudam contra hoje | Oscilam em 30 dias sem revisar |
| --------------------------- | ----------------- | ------------------------------ |
| **1 / 2-3 / 4 (escolhido)** | 47,9%             | 0                              |
| 1-2 / 3 / 4                 | 50,2%             | 0                              |
| 1 / 2 / 3-4                 | 29,1%             | 0                              |
| Régua de hoje (com relógio) | -                 | 2.104 (42,1%)                  |

Transição do mapa escolhido: salva -> salva 1.275; aprendendo -> aprendendo 221; aprendendo -> silenciosa 109; silenciosa ->
aprendendo 2.287; silenciosa -> silenciosa 1.108.

## Leitura

- Oscilação: a régua de hoje faz 42% das palavras do deck sintético trocarem de etiqueta só com 30 dias sem revisar (a retenção
  cai). Qualquer mapa por força dá 0, por construção (a força não lê o relógio). Isso é o ganho da change.
- Quantas mudam: 47,9% passa do critério de 15% do design. A causa é uma só: hoje `dominada` = fase Review com retenção >= 0,8,
  e uma palavra de estabilidade 2 a 20 dias, revisada há pouco, tem retenção alta e fica silenciosa; por força ela é 2 ou 3 e
  passa a pintar de `aprendendo` (silenciosa -> aprendendo: 2.287). O deck sintético tem muita estabilidade entre 3 e 21 dias, então o
  número do deck real pode ser bem diferente. **Não dá para concluir com dado sintético**: a decisão sobre rever limiares fica
  para a tarefa 1.2 com o deck do dono.
- Decisão assumida em 25/11 (`docs/backlog/decisoes-do-dono.md`, item 35): mapa 1 / 2-3 / 4. O mapa 1 / 2 / 3-4 muda menos (29%),
  mas deixa a palavra "Familiar" (força 3, estabilidade de 3 a 21 dias) silenciosa na legenda, contra o que o catálogo mostra.
  Se o deck do dono confirmar mudança excessiva, é a alternativa a considerar. A flag `forca_na_legenda` fica desligada.
