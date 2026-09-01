## 1. Cromas — a variação de cor que se desbloqueia

- [x] 1.1 `galeria/cromas.ts`: catálogo de matizes, preço por raridade, posse e as 4 vias
- [x] 1.2 Compra idempotente com `gastarSeeds` (spendId `croma:<item>:<matiz>`)
- [x] 1.3 Posse derivada do servidor (`reason LIKE 'croma:%'`), como a da Loja — sem tabela nova
- [x] 1.4 Aplicação: partículas (`ParticleCanvas`), rastro (`croma:<forma>:<matiz>`, forma nova de
      id em `rastroDoMouse.ts`) e tema (acento do tema trocado pelo matiz)
- [x] 1.5 Testes: croma nunca tira acesso que já existia; compra não duplica; o croma do rastro
      resolve sem passar por uma paleta da galeria (12 testes em `tests/cromas.test.ts`)

## 2. Editor contextual dentro do inventário

- [x] 2.1 Controles por tipo: partículas abrem intensidade (com o teto do aprimoramento), rastro
      abre a forma. Cursor e pack não abrem editor — não têm parâmetro.
- [x] 2.2 `temPersonalizacao(item)` decide se o botão aparece. É por TIPO, e não uma etiqueta
      E0–E3 por item: hoje só três tipos têm parâmetro, e um campo novo no catálogo repetiria
      em 84 itens o que o tipo já diz. Vira etiqueta no item quando o quarto tipo aparecer.
- [x] 2.3 A mudança é AO VIVO no app inteiro, e não numa prévia dentro do modal: trocar o croma
      de um tema repinta a tela, o do rastro muda o rastro no próximo movimento do mouse. Prévia
      seria uma segunda verdade para manter em sincronia com a primeira.
- [x] 2.4 "Aplicar e equipar" num gesto só

## 3. As telas

- [x] 3.1 Passe: uma década por página, cartões de 168px, estado no cartão (✓/cadeado/anel),
      marco mais largo com estrela, rolagem automática até a casa atual
- [x] 3.2 Inventário: loadout + categorias + grade + prévia com origem, equipar e personalizar
- [x] 3.3 Loja: duas prateleiras — "dá para levar agora" (o que o SALDO paga) e "ainda não",
      ordenada pelo que falta menos
- [x] 3.4 Cabeçalho de temporada com a carteira (Seeds sempre; Créditos quando há billing)
- [x] 3.5 Verificação no navegador das quatro abas + o editor de croma aberto
