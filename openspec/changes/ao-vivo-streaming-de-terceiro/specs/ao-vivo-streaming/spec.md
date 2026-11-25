## ADDED Requirements

### Requirement: Nenhum serviço de fluxo sem contrato de retenção zero

O sistema SHALL enviar áudio a um serviço de transcrição em fluxo de terceiro somente se houver DPA assinado que proíba retenção
do áudio e do texto além da sessão e proíba treino, que liste os subprocessadores e a região, e que a política de privacidade do
app cite o serviço. Sem o contrato registrado, a rota do Ao Vivo MUST NOT existir em produção e a flag `stt_ao_vivo` MUST
permanecer desligada. A chave do provedor MUST ficar só no servidor, e o áudio MUST passar pelo proxy do servidor, nunca direto do
navegador ao terceiro.

#### Scenario: Provedor sem DPA

- **WHEN** um provedor candidato não fornece, por escrito, a política de retenção e treino
- **THEN** ele não entra na finalista, nenhuma chave de produção dele é criada e o spike não roda

#### Scenario: Chave no navegador

- **WHEN** o cliente tenta abrir a sessão em fluxo
- **THEN** ele só fala com o proxy do servidor, e nenhuma resposta, bundle ou cabeçalho contém a chave do provedor

### Requirement: Perfil protegido não alcança o terceiro

O sistema SHALL recusar a sessão ao vivo de perfil protegido (menor ou sem idade declarada de adulto) na borda do servidor, antes
de abrir qualquer conexão com o terceiro, e MUST NOT enviar áudio, texto nem metadado dele ao provedor. A recusa SHALL ser
`403 ao_vivo_indisponivel_para_perfil`, e o cliente MUST cair para a nuvem por trechos ou para o aparelho, conforme o plano. Essa
regra só pode ser relaxada por decisão registrada do dono, com parecer jurídico anexado.

#### Scenario: Menor pede o nível Ao vivo

- **WHEN** um perfil protegido com plano que tem `sttAoVivo` inicia a captura no nível "Ao vivo"
- **THEN** o servidor responde 403, nenhuma conexão com o provedor é aberta e a legenda segue por trechos ou no aparelho

#### Scenario: Idade não declarada

- **WHEN** a conta não tem idade declarada de adulto
- **THEN** ela é tratada como perfil protegido para o Ao Vivo

### Requirement: O custo declarado e o teto vêm antes do gasto

O sistema SHALL tratar o custo por hora do serviço de fluxo como medida, não como estimativa: o plano que o inclui MUST ter teto
em US$ por mês (`TETO_USD_MES_*`) e a cota `sttAoVivoSegundosMes` só em `src/core/planos.ts`. Um spike pago MUST ter provedor,
chave e teto de gasto declarados pelo dono antes do primeiro pedido, e MUST parar quando o teto for atingido. Ao esgotar a cota
ou o teto, a sessão MUST cair para o nível "Precisão" sem bloquear a pessoa, com o aviso visível.

#### Scenario: Spike sem teto

- **WHEN** o spike é iniciado sem teto de gasto escrito
- **THEN** a bancada recusa rodar e não faz nenhum pedido pago

#### Scenario: Cota esgotada

- **WHEN** a pessoa consome as 10 h ao vivo do mês
- **THEN** a legenda continua pela nuvem por trechos, o aviso mostra o motivo e nenhuma cobrança extra é feita

### Requirement: Vender só o que existe

O plano ou complemento que inclui o Ao Vivo SHALL só ser vendido quando a rota em fluxo existir e a flag `stt_ao_vivo` estiver
ligada, além da flag de venda do plano. O texto de venda MUST NOT prometer ilimitado nem latência garantida, e MUST mostrar o
teto de horas.

#### Scenario: Rota inexistente

- **WHEN** `stt_ao_vivo` está desligada
- **THEN** `POST /api/billing/assinar` recusa o plano Ao Vivo e a tela de planos o mostra como "em breve" ou o oculta

#### Scenario: Texto de venda

- **WHEN** a tela de planos descreve o Ao Vivo
- **THEN** o texto traz "10 h por mês", o teto sempre visível, e nenhuma promessa de "sem limite" ou de milissegundos
