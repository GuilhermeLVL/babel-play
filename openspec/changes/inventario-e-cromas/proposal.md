## Why

O dono aprovou um protótipo (01/09) que refaz as telas de progressão na gramática dos passes de
batalha, e pediu duas mecânicas novas:

1. **Edição contextual.** "Rastro e partículas podem ser editáveis no que diz respeito à
   intensidade, número de partículas etc., não apenas em cores." Hoje o editor só troca a peça
   inteira; os parâmetros que já existem (`aprimoramentos.ts` tem intensidade pequena/média/grande)
   não têm onde aparecer.
2. **Cromas comprados, no modelo do League of Legends.** "O usuário precisa gastar moedas ou
   sementes para desbloquear as outras cores." Isso resolve um buraco medido: o catálogo inteiro
   sai em ~92 dias de estudo e depois disso **as Seeds não têm mais destino nenhum**.

Junto disso, o redesenho: os cartões do passe tinham 128px com texto de 10px, as duas fileiras não
se distinguiam, não havia preview de item nenhum, e o inventário era uma lista de chips.

## What Changes

- **Cromas**: cada peça vem com a cor inclusa e ganha variações desbloqueáveis. Quatro vias —
  inclusa, comprada com Seeds (15/25/40/60 por raridade), de conquista, ou do Passe Premium.
  **Croma nunca tira acesso que já existe**: é adição, e quem tem um estilo de paleta continua com
  as 30 matizes dele.
- **Posse sem tabela nova**: derivada de `seed_spends.reason LIKE 'croma:%'`, exatamente como a
  posse da Loja passou a ser (a brecha B4 já provou o padrão).
- **Editor contextual**: cada categoria abre os controles que fazem sentido para ela, com prévia
  ao vivo, e o grau E0–E3 do item decide se há o que editar.
- **Telas**: passe com cartões grandes e estados legíveis, inventário com loadout e preview, loja
  com vitrine, cabeçalho de temporada com a carteira.

## Não-escopo

Cromas de Créditos dependem da conta Asaas (a via existe declarada, a compra fica atrás do billing).
