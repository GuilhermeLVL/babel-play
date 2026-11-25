# Texto da latência publicada, revisado (skill `copy-br-etica`)

Change `latencia-publicada-por-aparelho`, tarefa 2.5. Revisão de 25/11/2026 sobre o selo do app, a página `/desempenho` e o
painel do dono. Critério: fato com ressalva, sem promessa, sem urgência, sem comparação com outro produto, sem preço.

## Frases aprovadas (selo, `SeloDeLatencia.tsx`)

- "Em aparelhos do seu tipo ({tipo}), metade das legendas traduzidas aparece em até {tempo}."
- "A legenda não saiu em cerca de {taxa} das falas."
- "Medido de forma anônima, nos últimos {dias} dias, em adultos que aceitaram enviar métricas. O seu aparelho pode variar."

Por quê: diz o que foi medido (mediana, "metade das legendas") e mostra a taxa de falha ao lado, para o número bom não virar
promessa. A ressalva diz quem foi medido (adultos que aceitaram) e que o aparelho da pessoa pode variar. Sem "garantido",
"sempre", "rápido como", "só hoje". O selo nunca aparece com amostra pequena (menos de 200 falas) nem como "estimativa".

## Página `/desempenho` (`scripts/site/desempenho.ts`)

Aprovada com as seções "O que está sendo medido", "Por tipo de aparelho e idioma" e "O que estes números não são" (não é garantia;
descreve adultos que aceitaram métricas; é aproximado ao limite da faixa; sem dados pessoais). Célula sem amostra diz
"Amostra ainda pequena para publicar" e não mostra número.

## Pontos para o dono revisar antes de ligar a flag

- A frase do selo menciona "adultos que aceitaram enviar métricas": confirmar com o parecer de privacidade (`rum_latencia`) se a
  redação pode ser a mesma em Política de Privacidade.
- O selo aparece também para menores (é só leitura de arquivo estático, sem coleta nova). Decisão assumida: mantido; a ressalva
  deixa claro que a medição é de adultos. Se o parecer pedir outra coisa, esconder o selo com `perfilProtegido()`.
