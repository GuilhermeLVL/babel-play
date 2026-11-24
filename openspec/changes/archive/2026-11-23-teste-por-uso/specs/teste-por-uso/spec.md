## ADDED Requirements

### Requirement: A nuvem do teste é uma amostra com teto de uso

Enquanto a conta está no teste de 14 dias, o servidor SHALL limitar a nuvem ao MENOR valor entre a cota do plano concedido e
`FRANQUIA_DO_TESTE` (3 h de áudio, 450 mil tokens, 4.000 chamadas, 30.000 caracteres de voz por mês), e MUST recusar a reserva
que passar disso com o mesmo 402 `quota_exceeded` da cota esgotada. Fora do teste, o teto MUST ser o do plano.

#### Scenario: O teste usa as 3 h

- **WHEN** uma conta em teste reserva 10.800 s de STT e depois mais 1 s
- **THEN** a primeira reserva cabe e a segunda é recusada no mês, sem chamar o provedor

#### Scenario: Quem assina continua até o teto do plano

- **WHEN** um assinante do Premium reserva mais de 10.800 s no mês
- **THEN** a reserva cabe, até as 20 h do plano e o uso justo do dia

### Requirement: A tela de uso mostra o teto real

`GET /api/me/uso` MUST devolver o teto do teste para quem está em teste.

#### Scenario: Conta em teste

- **WHEN** a conta em teste abre a tela de uso
- **THEN** os tetos são 10.800 s, 450.000 tokens e 4.000 chamadas, e para o assinante, 72.000 s, 3.000.000 e 26.000
