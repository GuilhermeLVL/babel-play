## ADDED Requirements

### Requirement: Teto global de armazenamento no R2

O servidor SHALL recusar um upload novo quando a soma de bytes guardados de todos os usuários
(`usage_counters`, metric `storage_bytes`, window `total`) somada ao tamanho do upload passar de
`R2_TETO_MB` (padrão 9 216 MB), sempre que o adaptador de armazenamento for o S3. A recusa SHALL
responder `507` com mensagem neutra, sem revelar números da conta. `R2_TETO_MB=0` SHALL recusar
todo upload novo; `R2_TETO_MB=ilimitado` SHALL desligar o teto; valor inválido SHALL ser erro de
configuração no boot.

#### Scenario: upload abaixo do teto

- **WHEN** a conta tem 1 GB guardado, o teto é 9 216 MB e chega um upload de 10 MB
- **THEN** o upload é aceito e o contador do usuário sobe 10 MB

#### Scenario: upload que cruzaria o teto

- **WHEN** a conta tem 9 210 MB guardados, o teto é 9 216 MB e chega um upload de 10 MB
- **THEN** a resposta é `507` com `motivo = conta`, nada é gravado e o contador não muda

#### Scenario: dois uploads simultâneos no limite

- **WHEN** restam 10 MB até o teto e dois uploads de 8 MB chegam ao mesmo tempo
- **THEN** exatamente um é aceito e o outro recebe `507`

#### Scenario: armazenamento em disco

- **WHEN** não há S3 configurado
- **THEN** o teto global não é consultado e a cota por usuário vale como hoje

### Requirement: Teto mensal de operações no R2

O adaptador S3 SHALL contar cada operação por classe (A: `gravar`, `gravarDeArquivo`, `remover`;
B: `ler`, `lerFaixa`, `tamanho`) num contador mensal (`usage_counters`, `__r2__`, metric
`r2_ops_a`/`r2_ops_b`, window `YYYY-MM` em UTC) e SHALL recusar `gravar`/`gravarDeArquivo` quando
o contador A atingir `R2_TETO_OPS_A_MES` (padrão 900 000) e `ler`/`lerFaixa` quando o
contador B atingir `R2_TETO_OPS_B_MES` (padrão 9 000 000), inclusive `tamanho` pedido por rota de
usuário. `remover` SHALL sempre passar. Os jobs internos (exclusão de conta, apagar sessão, retenção,
reconciliação da cota) SHALL usar a via sem teto, que conta e nunca recusa. A
reconciliação SHALL abortar, sem gravar, quando o store falhar por outro motivo que não nome inválido
ou objeto ausente. A mesma
gramática `0`/`ilimitado`/inválido de `R2_TETO_MB` SHALL valer.

#### Scenario: gravação com o teto de classe A batido

- **WHEN** o contador `r2_ops_a` do mês vale o teto e chega um `gravar`
- **THEN** o adaptador lança `ErroDeTetoDoR2` e a rota responde `503`; `remover` no mesmo estado é executado

#### Scenario: B no teto, tamanho por rota de usuário e pela via sem teto

- **WHEN** o contador `r2_ops_b` do mês vale o teto e chega um `tamanho`
- **THEN** pela rota de usuário ele lança `ErroDeTetoDoR2` (a rota de áudio responde `503`); pela via
  sem teto (`semTeto`) ele responde e o contador sobe

#### Scenario: jobs internos com o teto batido

- **WHEN** os contadores A e B do mês estão no teto e a pessoa apaga uma sessão (ou a retenção roda)
- **THEN** o objeto é medido e apagado e a cota é devolvida

#### Scenario: reconciliação com o store falhando

- **WHEN** a reconciliação da cota encontra um erro do store que não é nome inválido nem objeto ausente
- **THEN** ela lança e o contador do usuário não muda (nada de subcontagem)

#### Scenario: virada de mês

- **WHEN** o contador de outubro está no teto e a primeira operação de novembro (UTC) chega
- **THEN** ela é contada na janela de novembro e passa

### Requirement: Aviso a 80 % e reversão por variável

O servidor SHALL registrar `r2_teto_alerta_80` (uma vez por processo e por janela) ao cruzar 80 %
de qualquer teto, `r2_teto_recusa` a cada recusa, e expor `r2_uso_fracao{recurso}` nas métricas.
Mudar ou desligar qualquer teto SHALL exigir apenas alterar a variável e reiniciar o processo.

#### Scenario: aproximação do teto

- **WHEN** o uso guardado passa de 80 % de `R2_TETO_MB`
- **THEN** o log traz `r2_teto_alerta_80` com `recurso = armazenamento`, e repetir a operação não repete o log no mesmo processo
