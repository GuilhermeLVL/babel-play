## ADDED Requirements

### Requirement: Nuvem de alívio do Grátis

A matriz SHALL declarar, à parte dos planos, a franquia mensal da nuvem de alívio da conta Grátis
(`FRANQUIA_DE_ALIVIO`): 10.800 s de transcrição, 540.000 tokens, 4.000 chamadas e um teto estimado de US$ 0,13 por
conta. O `free` da matriz SHALL continuar sem nuvem gerenciada. A franquia SHALL valer só com a flag
`nuvem_gratuita_alivio` ligada, e essa flag SHALL nascer desligada, com `planos: ["free"]`. Um pedido sem o cabeçalho
`x-nuvem-alivio: 1` SHALL NOT consumir a franquia.

#### Scenario: Conta Grátis que não aceitou a oferta

- **WHEN** uma conta Grátis chama o STT gerenciado sem o cabeçalho `x-nuvem-alivio`
- **THEN** recebe o 402 de sempre, e nada é contado na franquia de alívio

#### Scenario: Instalação nova

- **WHEN** a migração 0040 roda num banco sem a flag
- **THEN** `nuvem_gratuita_alivio` existe desligada, e rodar de novo não liga nem desliga o que o operador escolheu

### Requirement: O servidor é o limite do alívio

Para uma conta Grátis que pede o alívio, o servidor SHALL conferir, nesta ordem:

1. a flag, com 503 `alivio_desligado` quando ela está desligada;
2. o perfil protegido, que só passa com a autorização do responsável (vínculo aceito e conta não restrita); sem
   ela, 403 `alivio_exige_responsavel`;
3. a franquia do mês, em segundos e em dólar; esgotada, 402 `quota_exceeded` com `escopo: 'alivio'`;
4. o pool do dia (no máximo 20% do orçamento diário de nuvem) e a reserva de 80% dos pagantes; atingidos, 503
   `pool_de_alivio_esgotado` com `Retry-After`.

Nenhuma dessas recusas SHALL virar oferta de venda. Os contadores do alívio SHALL ser próprios em `usage_counters`. Na
admissão, o alívio SHALL entrar pela faixa `alivio`, que usa só os 20% de cima do balde de capacidade.
`GET /api/ai/stt/available` e `GET /api/me/uso` SHALL responder o mesmo veredicto da porta.

#### Scenario: Perfil protegido sem o responsável

- **WHEN** uma conta Grátis de 16 ou 17 anos, ou sem idade declarada, pede o alívio sem vínculo aceito com um
  responsável
- **THEN** recebe 403 `alivio_exige_responsavel`, e o cliente pausa a nuvem sem mostrar plano nem preço

#### Scenario: Menor com o responsável

- **WHEN** uma conta Grátis de 14 anos, com o vínculo do responsável aceito, pede o alívio
- **THEN** o alívio é autorizado, dentro da franquia

#### Scenario: Disponibilidade coerente

- **WHEN** uma conta Grátis pergunta `GET /api/ai/stt/available` com `x-nuvem-alivio: 1` e a flag está desligada
- **THEN** a resposta é indisponível com `motivo: 'alivio_desligado'`, e a captura fica no aparelho

### Requirement: A oferta do alívio só onde o aparelho não aguenta

O cliente SHALL oferecer o alívio só quando pelo menos um sinal vale: aparelho leve, travamento visto pelo regulador,
ou GPU que não é real. GPU desconhecida SHALL NOT contar. A oferta SHALL NOT aparecer:

- no perfil de IA privado;
- na edição estática;
- depois de "Agora não" na mesma sessão;
- com menos de 60 s de franquia restante.

A oferta SHALL mostrar o que resta sem plano nem preço. O toque SHALL gravar o consentimento de nuvem antes de aceitar
o alívio, e o aceite SHALL valer para a aba.

#### Scenario: Notebook fraco na conta Grátis

- **WHEN** a captura de um aparelho leve fica no modelo local e o servidor diz que o alívio está disponível com
  franquia restante
- **THEN** aparece "Usar a nuvem grátis (restam X)"; aceita, a rota é refeita com o cabeçalho do alívio e o modelo
  local fica de reserva

#### Scenario: Aparelho forte

- **WHEN** o aparelho não é leve, tem GPU real e o regulador não viu travamento
- **THEN** a oferta não aparece, e o cliente nem pergunta ao servidor
