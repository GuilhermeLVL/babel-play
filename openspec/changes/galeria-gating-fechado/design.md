## Context

O enforcement real é `estadoDoItem` (`loja.ts:186-200`) — as brechas são caminhos que NÃO
passam por ele. A correção canaliza os caminhos para a régua existente em vez de criar outra.
Seeds ganhas não são dinheiro real: o objetivo é coerência de produto, não segurança bancária —
essa distinção vive na spec da economia de créditos.
