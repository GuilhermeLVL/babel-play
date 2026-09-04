## Why

O dono, usando o app como usuário leigo (31/08), identificou uma classe de problema que os testes
não pegam e que a implementação incremental criou: **incoerência entre telas**. Redirecionamentos
que não levam onde deveriam, ícones que mudam de significado, e — o mais grave — **funções antigas
que dão liberdade demais e furam a lógica de gamificação nova**. Exemplo do próprio dono: recursos
construídos antes do passe permitem chegar ao resultado final sem passar pela progressão, o que
esvazia a recompensa.

Junto disso, uma lacuna de desenho de economia: **moeda espalhada em dezenas de níveis do passe
faz o usuário sentir que "não ganhou nada"**. Recompensa diluída não é recompensa. Agrupar as
Seeds em blocos maiores, em níveis específicos, entrega a mesma quantidade com sensação de ganho.

Esta mudança é a ETAPA ANTERIOR a todo o resto da fila: auditar antes de continuar construindo,
porque parte do que existe vai precisar ser retrabalhada.

## What Changes

1. **Auditoria crítica na perspectiva do usuário leigo**, tela a tela, com três eixos:
   - *Coerência*: mesmo conceito = mesmo ícone, mesmo nome, mesmo lugar (o caso `Leaf` × `Sprout`
     das Seeds foi um sintoma, não o problema).
   - *Redirecionamento*: todo botão leva a algo que existe e faz sentido (o link morto para a aba
     `progressao` provou que a classe existe).
   - *Grau de liberdade*: o que cada tela DEIXA o usuário fazer, e se isso respeita a progressão.
2. **Matriz de liberdade × progressão**: para cada capacidade de edição do app, declarar em que
   nível/condição ela deveria estar disponível — e corrigir as que hoje estão soltas.
3. **Redesenho da curva de recompensa do passe**: agrupar moeda em blocos, definir o que cada
   nível entrega, aceitar retrabalho do que já está pronto.
4. **Tela de perfis salvos** (o usuário salva combinações do que já possui e recupera depois) —
   a base existe em `galeria/perfis.ts` (`salvarPerfil`, `perfisSalvos`, `faltaParaOPerfil`),
   falta a superfície própria e o fluxo completo.
5. **Botão "voltar ao visual original"** em Personalizar — restaurar o padrão do app com um
   clique, sem precisar desfazer item por item.

## Não-escopo

Implementar a economia de créditos comprados (spec própria) e os itens novos de catálogo — esta
mudança define O QUE e QUANDO, não produz arte.
