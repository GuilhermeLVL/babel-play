## ADDED Requirements

### Requirement: Nível "Ao vivo" só depois do portão

O nível "Ao vivo" MUST permanecer desligado até a bancada mostrar, para os pares pt↔en, pt↔es, pt↔zh e en↔zh: atraso médio
pelo menos 1 s menor que o da cascata, qualidade não pior que a da cascata no conjunto de conversa (IC 95% pareado) e custo por
hora dentro do limite aprovado. O resultado MUST ser registrado em `docs/auditoria/eval/`.

#### Scenario: Portão reprova

- **WHEN** o custo por hora passa do limite aprovado
- **THEN** o nível "Ao vivo" não é lançado e o relatório descreve os números e o motivo

### Requirement: Sessão fala→fala por sentido, via servidor

Com o nível ligado, o app SHALL abrir uma sessão por sentido da conversa, cada uma com o idioma de destino do sentido, e MUST
usar um proxy no servidor que autentica a pessoa, conta os minutos e aplica o teto. O navegador MUST NOT receber nem guardar a
chave do provedor. A sessão MUST pedir a transcrição de entrada e de saída para o histórico da tela.

#### Scenario: Conversa nos dois sentidos

- **WHEN** a pessoa fala em português e o outro responde em chinês no nível "Ao vivo"
- **THEN** uma sessão traduz o português para o chinês e a outra traduz o chinês para o português, e a tela mostra as duas transcrições

#### Scenario: Sem chave no navegador

- **WHEN** o cliente inspeciona o tráfego da sessão
- **THEN** nenhuma chave do provedor aparece

### Requirement: Queda automática para a cascata

O app SHALL trocar para o nível "Precisão" sem encerrar a conversa quando a sessão falhar por rede ou crédito, quando o idioma
estiver fora da cobertura ou quando a latência passar do limite em três falas seguidas, e MUST avisar a pessoa uma vez.

#### Scenario: Rede cai

- **WHEN** a conexão com o servidor cai no meio da conversa
- **THEN** a conversa segue na cascata e a tela avisa "Voltei ao modo Precisão"

#### Scenario: Idioma fora da cobertura

- **WHEN** a pessoa escolhe um par que o provedor não cobre
- **THEN** o nível "Ao vivo" não é oferecido para esse par

### Requirement: Tetos e transparência

O nível "Ao vivo" SHALL ter horas inclusas no Premium e um pacote de horas, MUST mostrar o tempo usado e o que resta, e MUST NOT
ser chamado de ilimitado. Ao atingir o teto, o app MUST cair para "Precisão" em vez de bloquear.

#### Scenario: Teto atingido

- **WHEN** as horas inclusas acabam durante a conversa
- **THEN** a conversa continua em "Precisão" e a tela mostra como comprar mais horas

#### Scenario: Plano Grátis

- **WHEN** a conta é do plano Grátis
- **THEN** o nível "Ao vivo" aparece com cadeado e diz de que plano é

### Requirement: Limites declarados

A tela SHALL dizer que a voz pode mudar após pausas e que o atraso é de poucos segundos, e MUST oferecer o retorno à cascata a
um toque.

#### Scenario: Voltar à cascata

- **WHEN** a pessoa toca em "Usar Precisão"
- **THEN** a conversa passa à cascata sem perder o histórico
