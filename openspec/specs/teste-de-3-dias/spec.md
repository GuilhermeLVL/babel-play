# teste-de-3-dias Specification

## Purpose

Teste Premium de 3 dias com 1 h de nuvem e freios contra fábrica de contas (e-mail descartável, não confirmado, IP). Criada pela change `teste-de-3-dias` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-teste-de-3-dias/proposal.md` para o porquê.

## Requirements

### Requirement: O teste do Premium dura 3 dias e a nuvem dele é 1 h

O servidor SHALL gravar o teste com `terminaEm = iniciadoEm + 3 dias` (`DIAS_DO_TESTE_PREMIUM = 3`) e SHALL limitar a nuvem
em teste ao menor valor entre a cota do plano e `FRANQUIA_DO_TESTE` (3.600 s de STT, 150.000 tokens, 1.400 chamadas e
10.000 caracteres de voz). Toda tela, o site público e os termos MUST mostrar o número que vem de `src/core/planos.ts`.

#### Scenario: Começar o teste

- **WHEN** um adulto declarado, com e-mail confirmado, toca "Testar 3 dias grátis"
- **THEN** a resposta traz `terminaEm - iniciadoEm` igual a 3 dias e `dias: 3`, sem nenhuma chamada ao Asaas

#### Scenario: A 1 h de nuvem acaba antes dos 3 dias

- **WHEN** uma conta em teste reserva 3.600 s de STT e depois mais 1 s
- **THEN** a primeira reserva cabe e a segunda é recusada no mês

### Requirement: O aviso de fim do teste é na véspera e no último dia

O aviso funcional `fim_do_teste` SHALL aparecer na véspera do último dia de calendário (`d1`, "termina amanhã") e no último
dia (`d0`), e MUST NOT aparecer no dia em que um teste de 3 dias começa.

#### Scenario: Teste recém-começado

- **WHEN** o teste termina daqui a 3 dias de calendário
- **THEN** não há fase de fim do teste

#### Scenario: Véspera

- **WHEN** o teste termina amanhã
- **THEN** a fase é `d1` e o aviso diz "Seu teste do Premium termina amanhã"

### Requirement: A marca do teste é a da caixa de entrada

A marca SHALL ser o HMAC do e-mail normalizado: caixa baixa, sem espaços, sem `+etiqueta` em qualquer domínio, e no Gmail
sem pontos e com `googlemail.com` tratado como `gmail.com`. Fora do Gmail, os pontos MUST contar.

#### Scenario: Variações do mesmo Gmail

- **WHEN** a marca é calculada para `a.b+x@GoogleMail.com` e para `ab@gmail.com`
- **THEN** as duas marcas são iguais

### Requirement: O teste exige e-mail confirmado e não descartável

`POST /api/billing/teste` SHALL recusar com 409 `teste_email_descartavel` o e-mail de um domínio da lista de caixas
descartáveis (ou subdomínio dele), e SHALL perguntar à Admin API do Supabase se o e-mail da conta que pede está confirmado
antes de gravar o teste: não confirmado, 403 `teste_email_nao_confirmado`; a consulta falhou, 503 `teste_indisponivel_agora`.
A marca já usada MUST responder 409 `teste_ja_usado` sem consultar o Supabase. `GET /api/billing/status` SHALL mostrar
`motivo: 'email_descartavel'` e MUST NOT consultar o Supabase.

#### Scenario: Caixa descartável

- **WHEN** uma conta com `alguem@mailinator.com` pede o teste
- **THEN** a resposta é 409 `teste_email_descartavel` e a conta continua no Grátis

#### Scenario: E-mail não confirmado

- **WHEN** o Supabase diz que o e-mail da conta não foi confirmado
- **THEN** a resposta é 403 `teste_email_nao_confirmado`, nada é gravado e a marca continua livre

#### Scenario: Supabase fora do ar

- **WHEN** a consulta da confirmação falha
- **THEN** a resposta é 503 `teste_indisponivel_agora` e o teste não começa

### Requirement: Teto de testes por IP no dia

O servidor SHALL contar os testes que COMEÇARAM por IP pseudonimizado (HMAC do IP com a chave do servidor e o dia, IPv6 por
prefixo) em `usage_counters` e SHALL recusar com 429 `teste_limite_por_ip` quando o IP já começou `TESTES_PREMIUM_POR_IP_DIA`
testes no dia (padrão 5; `0` desliga). Recusas e o segundo toque da mesma conta MUST NOT contar. A vaga MUST ser reservada numa operação atômica (soma só se
couber), para que pedidos simultâneos do mesmo IP nunca passem do teto.

#### Scenario: Rajada simultânea

- **WHEN** o teto é 2 e 8 contas confirmadas do mesmo IP pedem o teste ao mesmo tempo
- **THEN** exatamente 2 começam e as outras 6 recebem 429 `teste_limite_por_ip`

#### Scenario: O terceiro teste com teto 2

- **WHEN** o teto é 2 e duas contas do mesmo IP já começaram o teste hoje
- **THEN** a terceira recebe 429 `teste_limite_por_ip`, e o contador guarda só o IP pseudonimizado
