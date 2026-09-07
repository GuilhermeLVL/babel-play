# modo-anonimo Specification

## Purpose
Descreve o modo sem conta como ele e HOJE: um servidor efemero em memoria/IndexedDB que responde as chamadas de API no proprio navegador, um teto de uso, uma migracao idempotente para a conta e um 501 declarado para o que exige conta. Escrita a partir do codigo em 2026-09-07 (auditoria, secoes 2.1 e 2.2); cada requirement cita o `arquivo:linha` que o implementa. A paridade de rotas e a chave de dedup sao objeto de `modo-anonimo-em-paridade`.

## Requirements

### Requirement: Sem conta, a API e servida no navegador
Quando a identidade e `anonimo` (`src/lib/identidade.ts:25`), `apiFetch` (`src/data/api.ts:26`) SHALL entregar a chamada a `servidorEfemero` (`src/data/efemero/servidor.ts:661`), que casa metodo e caminho contra a tabela `ROTAS` (`servidor.ts:631`) e responde com o mesmo formato JSON do Express. Nada sai para a rede.

#### Scenario: Gravar uma sessao sem conta
- **WHEN** o cliente faz `POST /api/sessions`
- **THEN** a sessao e gravada no IndexedDB e `GET /api/sessions` a devolve

### Requirement: O que exige conta responde 501 e dispara o convite
Rota fora de `ROTAS` SHALL responder 501 com `codigo: EXIGE_CONTA` (`servidor.ts:25,63`) e disparar o evento `babel_exige_conta` (`servidor.ts:26,61`), que a casca transforma em convite para criar conta.

#### Scenario: Importar do YouTube sem conta
- **WHEN** o cliente chama `/api/import/youtube`
- **THEN** a resposta e 501 `EXIGE_CONTA` e o convite explica o motivo (`motivoDoGate`, `src/components/conta/exigeConta.ts:76`)

#### Scenario: Lacuna conhecida — rotas nao espelhadas que o cliente chama
- **WHEN** o cliente anonimo chama `/api/metrics/xp` ou `/api/vocab/para-jogo`
- **THEN** recebe 501 e o cliente cai em fallback (composicao local) ou mostra vazio (achado A25)

### Requirement: O modo anonimo tem teto
`TETO_ANONIMO` (`src/core/tetoAnonimo.ts:22`) SHALL limitar sessoes e palavras no modo sem conta; o servidor efemero recusa acima do teto e a casca avisa antes.

#### Scenario: Sexta sessao
- **WHEN** ja existem 5 sessoes locais
- **THEN** o `POST /api/sessions` e recusado com aviso, sem perder as existentes

### Requirement: Migrar para a conta e idempotente
`migrarParaConta` (`src/data/migracao.ts:80`) SHALL enviar cada sessao local com `origemLocalId` (`migracao.ts:5,11`), que o servidor usa como chave de idempotencia; repetir a migracao nao duplica. `inventarioLocal` (`migracao.ts:37`) diz antes o que vai subir.

#### Scenario: Migracao interrompida
- **WHEN** a rede cai no meio e a pessoa repete
- **THEN** as sessoes ja enviadas nao sao duplicadas

### Requirement: O agendador e a economia do modo anonimo sao os mesmos do core
O servidor efemero SHALL aplicar o mesmo FSRS (`src/core/learning/scheduler.ts`) e a mesma formula de Seeds (`src/core/learning/xp.ts`) sobre os dados locais.

#### Scenario: Lacuna conhecida — valores vindos do cliente
- **WHEN** o cliente anonimo chama `seeds/creditar` com `amount`
- **THEN** hoje o efemero aceita o valor sem validar (achado A26); `seeds-e-creditos-fonte-unica` fecha isso
