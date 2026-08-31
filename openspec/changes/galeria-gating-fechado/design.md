## Context

O enforcement real é `estadoDoItem` (`loja.ts:186-200`) — as brechas são caminhos que NÃO
passam por ele. A correção canaliza os caminhos para a régua existente em vez de criar outra.
Seeds ganhas não são dinheiro real: o objetivo é coerência de produto, não segurança bancária —
essa distinção vive na spec da economia de créditos.

## Correção durante a implementação (31/08)

B1/B5 foram reavaliadas com o catálogo na mão: paletas são um produto CURADO com escada própria
por estilo (teste `progressão gradativa` já prende claro/papel livres → meia-noite nv7); exigir o
item `tema-custom` (nv10) em toda paleta mataria essa escada. A leitura correta: `tema-custom`/
Estúdio vendem cores ARBITRÁRIAS. Fechaduras aplicadas: a régua do ESTILO entrou na própria
`aplicarPaleta` (não só no disabled do botão), e o Estúdio ganhou porta única com gate no App
(`abrirEstudio`). `faltaParaOPerfil` já checava o estilo — que é a régua certa sob esta leitura.
