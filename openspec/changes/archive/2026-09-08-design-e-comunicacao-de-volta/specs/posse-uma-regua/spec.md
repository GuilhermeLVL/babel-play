## MODIFIED Requirements

### Requirement: Uma regua de posse
Toda pergunta "o usuario pode equipar X" SHALL ser respondida por `estadoDoItem`, com contexto
explicito, em todas as telas e em todo caminho de aplicar. A pergunta gêmea — "como o usuário
consegue X" — SHALL ser respondida por `rotaDeObtencao`, que mora ao lado dela, ramifica na mesma
ordem, e é comparada com ela por teste; nenhuma tela SHALL montar essa resposta por conta própria.

#### Scenario: Item premium possuido
- **WHEN** um item comprado com creditos e consultado na Loja e no Cofre
- **THEN** as duas telas devolvem o mesmo estado (equipavel) porque chamam a mesma funcao

#### Scenario: Tela que redige a própria rota
- **WHEN** uma tela escreve à mão o texto de "como conseguir" em vez de chamar `rotaDeObtencao`
- **THEN** ela pode divergir do cadeado sem que nada acuse, que foi o defeito medido em G31 — a
  rota mostrava o id da conquista onde o cadeado já mostrava o nome
