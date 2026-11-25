## Abordagem escolhida: a força vira a fonte única da legenda e do leitor, mapeada para as tintas que já existem

```
VocabCard (stability, reps, lapses) --forcaDoCartao--> forca 1..4 --> índice do caderno (guarda forca)
   forca 1 -> data-etiqueta="salva"        (tom do acento)
   forca 2,3 -> data-etiqueta="aprendendo" (tom verde)
   forca 4 -> silenciosa (sem tinta, como "dominada")        + data-forca em todas, para teste e gaveta
```

- Reaproveita as seis etiquetas, o CSS (`etiquetas.css`) e os portões do ponto "nova para você". A precedência não muda: cartão
  do caderno > marcação ("Já sei", "Ignorar") > ponto.
- Pura e sem relógio: a força depende só de estabilidade, repetições e esquecimentos; a etiqueta não muda com a passagem do
  tempo, só com uma revisão. Isso elimina o "piscar" da `dominada` por retenção.
- Atrás de `forca_na_legenda`. Desligada, o índice e as etiquetas são exatamente os de hoje (teste de caracterização antes de mexer).
- A glosa do leitor lê a mesma força: some em força >= 3 (constante nomeada), ou na hora com "Já sei".
- A moldura do cartão (`pelesDeCartao`) e o catálogo ficam como estão nesta change; a convergência total é a decisão do dono 1.

## Alternativa descartada: quatro tons, um por força

Pintar cada força com uma cor própria na legenda. Descartada: a legenda já é denso texto traduzido ao vivo, quatro tintas viram
ruído; cor sozinha não basta para acessibilidade (WCAG 1.4.1) e cada tom novo precisa passar AA nos dois temas e nos três fundos
da janela flutuante; e o valor está em "isto ainda é fraco ou já é firme", que três níveis (pinta forte, pinta fraco, silêncio)
já dizem. A força exata mora na gaveta da palavra, onde há espaço para texto.

## Método rápido (skill `ciclo-rapido`)

1. **Simular antes de qualquer UI**: script offline que lê um deck (fixture do corpus Anki em `tests/harness/lerApkgNode.ts` e um
   export do dono) e compara, palavra a palavra, a etiqueta da régua antiga com a da nova (tabela de transição e % que muda).
   Nenhuma tela, nenhuma flag, nenhum servidor.
2. **Triagem curta**: 2 ou 3 regras candidatas para o mapa (por exemplo: 1-2 salva, 3 aprendendo, 4 silenciosa; ou a proposta
   1 / 2-3 / 4), medidas na mesma simulação com a métrica "palavras que mudam" e "palavras que oscilam em 30 dias simulados de
   inatividade". Parar na primeira que não oscilar e mudar <= 15%.
3. **Só a finalista na verificação visual**: contraste (`scripts/etiquetas/contraste.mjs`) e uma passada em celular real, nada de
   rodada longa.

Não há medição de latência: a leitura da força é uma conta por palavra no índice já carregado; o teste de desempenho só confere que
montar o índice de 20.000 cartões não passa do orçamento de `slo-captura.json` (sem regressão de frames longos).
