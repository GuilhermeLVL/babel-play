# matriz-de-planos Specification

## Purpose

TBD - created by archiving change planos-essencial. Update Purpose after archive.

## Requirements

### Requirement: Fonte única de planos

Planos, entitlements, quotas e rótulos SHALL viver numa única matriz, num módulo puro compartilhado
entre servidor e cliente. Nenhum outro arquivo SHALL enumerar a lista de planos à mão.

#### Scenario: Servidor e cliente concordam

- **WHEN** o teste de paridade compara os planos, flags e rótulos vistos pelo servidor e pelo cliente
- **THEN** eles são idênticos, porque ambos leem a mesma matriz

#### Scenario: Plano novo entra num lugar só

- **WHEN** um plano é adicionado à matriz
- **THEN** entitlements, quotas, validação do admin e rótulos da UI passam a conhecê-lo sem nenhuma
  outra edição de lista

### Requirement: Um plano pago só

A matriz SHALL ter os planos `free`, `plus`, `familia`, `pro4` e `selfhost` à venda ou em breve, e SHALL manter `essencial`, `premium` e
`aovivo` apenas para quem já os tem (venda encerrada, `encerradoPor: [venda_planos_v4]`). Preços do Plus: R$ 14,90 por mês e R$ 149 por
ano. Todo valor cobrável (mensal, anual, parcela) SHALL ser distinto dos demais, porque o webhook identifica o plano pelo valor pago.

#### Scenario: A matriz vendável

- **WHEN** alguém lista os planos vendáveis com a flag `venda_planos_v4` ligada
- **THEN** aparecem o Plus (R$ 14,90 e R$ 149) e nenhum dos planos da v3

#### Scenario: Venda fechada

- **WHEN** a flag `venda_planos_v4` está desligada
- **THEN** `/api/billing/assinar` recusa o Plus com 503 `plano_indisponivel`, antes de falar com o Asaas

#### Scenario: Família e Pro em breve

- **WHEN** `venda_familia` ou `venda_pro4` está desligada
- **THEN** o plano aparece como "em breve", sem preço, e `/api/billing/assinar` o recusa

#### Scenario: Pagar um valor com a intenção de outro plano

- **WHEN** a intenção gravada é Plus e o valor confirmado é de um plano encerrado da v3
- **THEN** o plano concedido é o do valor pago, nunca o da intenção

### Requirement: Nome antigo vira Premium

Um nome de plano antigo (`essencial`, `pro`) vindo do banco, de uma flag, do admin ou do cache do cliente
SHALL ser lido como `premium`. Um nome desconhecido SHALL continuar degradando para `free` com log.

#### Scenario: Assinante antigo do Pro

- **WHEN** `subscriptions.plan` ainda diz `pro` e a assinatura está ativa
- **THEN** `getPlanForUser` devolve `premium`

#### Scenario: Pagamento no valor antigo

- **WHEN** o webhook confirma um pagamento de R$ 39,90 ou de R$ 19,90 de assinatura
- **THEN** o plano concedido é `premium`, ciclo mensal

### Requirement: O plano e o ciclo saem do dinheiro

`planoPeloPagamento(valor, { parcelas })` SHALL devolver o plano e o ciclo que aquele valor paga: o preço mensal
é mensal; o anual inteiro é anual; com `parcelas: 12`, a parcela do Asaas (truncada, com a diferença na última)
é anual. Qualquer outro valor SHALL devolver `null`.

#### Scenario: Doze parcelas

- **WHEN** chega a parcela de R$ 14,91 (ou a última, de R$ 14,99) de um parcelamento em 12x
- **THEN** o resultado é Premium anual

### Requirement: Uso justo por dia

O Premium SHALL ter um teto DIÁRIO de nuvem (7.200 s de STT e o teto de tokens do dia), contado no dia local da
pessoa. A reserva SHALL conferir o mês e depois o dia, devolvendo o mês quando o dia recusar. A recusa do dia
SHALL ser 429 `uso_justo_do_dia` com `Retry-After`, e SHALL NOT virar oferta de venda.

#### Scenario: Duas horas no dia

- **WHEN** um assinante Premium passa de 2 h de transcrição na nuvem no mesmo dia local
- **THEN** a próxima fala recebe 429 `uso_justo_do_dia`, o cliente pausa a nuvem, a legenda segue no aparelho
  e nenhum banner, modal ou selo de plano aparece

#### Scenario: O dia recusou

- **WHEN** a reserva do dia recusa
- **THEN** a reserva do mês feita para a mesma fala é devolvida

#### Scenario: O consumo de hoje

- **WHEN** um assinante Premium consulta `GET /api/me/uso`
- **THEN** a resposta traz `hoje` com a janela do dia, o fuso e os contadores do dia com os tetos

### Requirement: Teto mensal honesto com o custo

Até o custo da cascata barata ser medido (B7), o teto mensal de STT do Premium SHALL ser 40 h (o empate de custo
na pilha atual), com override por `PREMIUM_MONTHLY_STT_SECONDS`.

#### Scenario: Sem env

- **WHEN** `PREMIUM_MONTHLY_STT_SECONDS` não está definida
- **THEN** o teto mensal é 144.000 s

### Requirement: Degradação barulhenta, nunca silenciosa

Um plano desconhecido vindo do banco SHALL degradar para `free` no servidor com log de evento, e o
cliente SHALL NOT descartar uma resposta de entitlements por conter plano que ele não conhece.

#### Scenario: Linha de assinatura corrompida

- **WHEN** `subscriptions.plan` contém um valor fora da matriz
- **THEN** o usuário opera como `free` e o servidor registra `plano_desconhecido` — nunca um 500,
  nunca silêncio

### Requirement: Disponibilidade de STT respeita o plano

`GET /api/ai/stt/available` SHALL responder disponível somente quando houver chave no servidor E o
usuário tiver o entitlement de STT gerenciado ou uma credencial BYOK própria.

#### Scenario: Grátis não é roteado para a nuvem de STT

- **WHEN** um usuário `free` sem BYOK consulta a disponibilidade (sem pedir a nuvem de alívio)
- **THEN** a resposta é indisponível, o roteador escolhe o modelo local, e nenhum 402 acontece no
  meio da captura

#### Scenario: BYOK continua livre

- **WHEN** um usuário de qualquer plano tem credencial BYOK de STT
- **THEN** a disponibilidade responde disponível — a chave é dele, o custo é dele

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

### Requirement: Capacidades por plano

Cada plano SHALL declarar na matriz: `semAnuncios`, nuvem por trechos, `sttAoVivo`, Nuance, intérprete automático e nível de voz. O
código SHALL decidir por essas capacidades; comparar o nome do plano fica restrito à matriz e à cobrança.

#### Scenario: Plano pago novo na admissão

- **WHEN** uma conta do Plus pede nuvem
- **THEN** entra na faixa de pagantes da admissão

#### Scenario: Cliente e servidor iguais

- **WHEN** a matriz ganha um campo
- **THEN** os entitlements do cliente o recebem sem cópia manual em outro arquivo

### Requirement: Cotas mensais por nível de serviço

A matriz SHALL declarar segundos mensais por trechos e ao vivo por plano (`sttSegundosMes`, `sttAoVivoSegundosMes`), e as cotas da IA
de estudo (`explicacoesMes`, `resumosMes`). O uso SHALL ser contado em métricas separadas, com reserva antes do provedor e estorno na falha.

#### Scenario: Reserva no nível certo

- **WHEN** um trecho de 30 s ao vivo é reservado e o provedor falha
- **THEN** os 30 s voltam ao contador ao vivo e o contador por trechos não muda

#### Scenario: A tela lê o restante

- **WHEN** a tela pede `/api/me/uso`
- **THEN** recebe o restante do mês por nível

### Requirement: Troca de plano

Quem já assina SHALL poder trocar de plano sem cancelar. A troca SHALL valer no próximo ciclo, sem pro-rata.

#### Scenario: Subir de um plano encerrado para o Plus

- **WHEN** um assinante do Essencial pede o Plus
- **THEN** a assinatura passa ao valor novo no próximo vencimento e o plano muda quando o pagamento é confirmado

### Requirement: Nada prometido que o servidor recusa

A tela de Planos SHALL mostrar só capacidades que a matriz concede e que a rota correspondente atende, com os números vindos da matriz.

#### Scenario: Ao vivo desligado

- **WHEN** a flag `stt_ao_vivo` está desligada
- **THEN** nenhuma tela promete texto durante a fala nem vende plano por ele

#### Scenario: Voz natural desligada

- **WHEN** a flag `voz_natural` está desligada
- **THEN** o site público e o app escrevem "em breve" no item de voz natural, nunca o número de caracteres
