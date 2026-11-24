## ADDED Requirements

### Requirement: O aviso do fim do teste cobre o uso, não só o prazo

Para a conta no teste de 14 dias, o app SHALL avisar quando a franquia de nuvem do teste passa de 80% (`uso_perto`) e quando
acaba (`uso_acabou`), com o momento `fim_do_teste`, no lugar dos avisos de cota do mês. O texto MUST dizer que a legenda segue no
aparelho, que nada é cobrado sozinho e como ver os planos, e MUST NOT usar contagem regressiva, urgência, culpa ou a promessa de
voltar "no dia 1º". O aviso MUST valer com a flag de ofertas desligada e MUST NOT aparecer para quem não está no teste.

#### Scenario: A franquia chega a 80%

- **WHEN** a conta em teste tem um contador de `GET /api/me/uso` em 80% ou mais
- **THEN** aparece "A nuvem do seu teste está quase no fim", e não "Sua cota de IA de nuvem está perto do fim"

#### Scenario: A franquia acaba

- **WHEN** um contador da conta em teste chega a 100%
- **THEN** aparece "A nuvem do seu teste chegou ao fim", sem "volta no dia 1º", e "Ver planos" abre Planos sem destaque de venda

#### Scenario: Quem paga

- **WHEN** a conta é Premium pago (sem teste) com a cota em 80%
- **THEN** o aviso do teste não aparece; vale o aviso de cota do plano

### Requirement: O teto em dólar por conta é configurável e desligado por padrão

O servidor SHALL aceitar `TETO_USD_MES_<PLANO>` (essencial, premium, aovivo) como teto de gasto estimado por conta e por mês. Sem a
variável (ou com valor inválido, zero ou negativo) o teto MUST estar desligado: sem contagem, sem recusa e sem escrita extra. Com
ele, ao atingir o teto a reserva MUST ser recusada com 402 e código `teto_usd_da_conta`, antes de reservar cota e de falar com o
provedor; a franquia de alívio MUST NOT ser afetada. O log MUST levar apenas o plano e os valores.

#### Scenario: Desligado

- **WHEN** nenhuma variável de teto está definida e a conta gasta US$ 5
- **THEN** nada é gravado e a reserva segue normalmente

#### Scenario: Teto atingido

- **WHEN** `TETO_USD_MES_PREMIUM=0.05` e a conta Premium já gastou US$ 0,05 no mês
- **THEN** a reserva do LLM, do STT e da voz responde 402 `teto_usd_da_conta` e nenhuma chamada gerenciada é reservada

#### Scenario: Outra conta ou outro plano

- **WHEN** outra conta, ou um plano sem teto, reserva no mesmo mês
- **THEN** a reserva segue normalmente
