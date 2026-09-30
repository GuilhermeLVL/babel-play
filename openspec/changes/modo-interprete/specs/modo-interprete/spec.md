## ADDED Requirements

### Requirement: Intérprete em todos os planos

O modo intérprete SHALL estar disponível em todos os planos. A tradução SHALL ser lida com a voz do aparelho
(`speechSynthesis`). A exceção é quando o entitlement `vozNatural` e a flag `voz_natural` estão ligados ao
mesmo tempo: aí a voz natural da nuvem SHALL ler a tradução. A decisão MUST vir do entitlement, e nunca do
nome do plano.

#### Scenario: Grátis

- **WHEN** uma pessoa do Grátis abre o intérprete e fala
- **THEN** a tradução é lida pela voz do aparelho, e a faixa do meio diz "Voz do aparelho"

#### Scenario: Premium com a flag desligada

- **WHEN** um assinante Premium usa o intérprete e a flag `voz_natural` está desligada
- **THEN** a tela não cria a voz da nuvem, e a tradução é lida pela voz do aparelho

### Requirement: A direção vem do lado tocado

Cada metade da tela SHALL ter um idioma. O lado `meu` SHALL falar o idioma "Eu falo" da captura e traduzir
para o idioma do outro. O lado `outro` SHALL fazer o contrário. O microfone, a dica de idioma do
reconhecedor, o parcial e a tradução SHALL usar a direção do lado. "Trocar os lados" SHALL inverter os
idiomas entre as metades. Uma fala SHALL guardar o lado com que começou.

#### Scenario: O outro lado fala

- **WHEN** o idioma do meu lado é o português, o do outro é o inglês, e alguém toca o lado `outro`
- **THEN** o microfone abre em inglês, e a tradução vai para o português

#### Scenario: A troca no meio da fala

- **WHEN** alguém toca o outro lado enquanto uma fala ainda está sendo transcrita
- **THEN** essa fala continua com o lado e a direção com que começou

### Requirement: O ciclo de uma fala

Tocar um lado com a conversa parada SHALL abrir o microfone na direção desse lado. O fim da fala SHALL fechar
o microfone. A tradução do final SHALL ir para a fila de voz no idioma de quem ouve. Tocar o mesmo lado
enquanto ele ouve SHALL fechar o microfone, e o final que ainda chegar SHALL ser traduzido e lido. Tocar
qualquer lado enquanto a voz fala, ou enquanto uma tradução está a caminho, SHALL cortar a voz (barge-in) e
abrir o microfone de quem tocou. Uma tradução que chegar depois do barge-in MUST NOT ser lida.

#### Scenario: Uma fala inteira

- **WHEN** o lado `meu` fala português, o fim da fala chega e depois chega a tradução
- **THEN** o microfone fecha no fim da fala, e a tradução é lida com uma voz `en-US`

#### Scenario: Barge-in

- **WHEN** a voz está lendo uma tradução e alguém toca um lado
- **THEN** a voz para na hora, a espera da fila esvazia, e o microfone abre na direção de quem tocou

#### Scenario: Sem tradução para ler

- **WHEN** o gancho `aoTraduzirFinal` avisa `sem-traducao` (mesmo idioma, falha ou tradutor sem carregar)
- **THEN** a conversa volta a `parado` sem voz nenhuma

### Requirement: Só os finais são lidos, uma vez por fala

O gancho `aoTraduzirFinal` SHALL avisar só as falas finais, uma vez por fala. O aviso SHALL trazer o texto
a ler, sem o "≈" da tradução aproximada. O parcial MUST NOT avisar. A retradução e o final que cresce MUST
NOT avisar de novo. Uma tradução que chegar antes do fim da fala SHALL ser guardada e entregue logo depois
do fim.

#### Scenario: Tradução vinda do cache

- **WHEN** a tradução de uma fala chega antes do aviso de fim dessa fala
- **THEN** ela é lida quando o fim chega, uma vez só

### Requirement: A fila de voz não atrasa a conversa

A fila SHALL ler um item de cada vez, na ordem de chegada. Ela SHALL guardar no máximo 3 itens, contando o
que fala. Um item novo com a fila cheia SHALL derrubar o mais velho da espera, e MUST NOT derrubar o que
está falando. Um item com mais de 20 s desde o fim da fala original MUST NOT ser lido. "Repetir" SHALL ler o
último item de novo, mesmo depois desse limite. "Parar voz" SHALL cortar a voz e esvaziar a espera. Um
motor que dá erro, que não começa no prazo ou que nunca avisa o fim MUST NOT travar a fila.

#### Scenario: Tradução velha

- **WHEN** a vez de um item chega 21 s depois do fim da fala original
- **THEN** o item sai sem ser lido, e a tradução continua na tela

#### Scenario: Motor que não começa

- **WHEN** o motor não começa a falar em 8 s
- **THEN** o item é descartado, e o próximo é lido

### Requirement: O app não transcreve a própria voz

O guarda de eco (`isTtsActive`) SHALL ficar ligado enquanto qualquer motor fala, inclusive o áudio da voz da
nuvem, e pela cauda depois do fim. O `cancel()` da voz do aparelho MUST NOT desligar o guarda de um áudio
que outro motor toca. No barge-in, a cauda do fim atual SHALL encurtar, para que a fala de quem tocou não
seja descartada como eco.

#### Scenario: Voz da nuvem tocando

- **WHEN** o áudio da voz natural está tocando
- **THEN** o microfone descarta o que ouvir como eco

### Requirement: A voz natural no servidor

`POST /api/ai/tts` SHALL receber só `texto` (até 600 caracteres), `idioma`, `voz` pronta e `velocidade`. A
rota SHALL recusar nesta ordem:

- 400 `clonagem_de_voz_recusada`, se o pedido trouxer um campo de áudio de referência ou de voz criada,
  antes de validar o resto;
- 400 para o corpo inválido;
- 402 `exige_voz_natural`, sem o entitlement `vozNatural`;
- 503 `voz_natural_desligada`, com a flag `voz_natural` desligada;
- 501 `voz_nao_configurada`, sem nenhuma perna `tts` com chave;
- 422 `idioma_sem_voz_natural`, se nenhuma voz fala o idioma.

Nenhuma recusa SHALL virar oferta de venda. O pedido ao provedor MUST NOT levar áudio de referência nem voz
criada: não há clonagem de voz.

#### Scenario: Pedido para imitar uma voz

- **WHEN** o corpo traz `audio_prompt`, `voice_id`, `reference_audio` ou `speaker_wav`, em qualquer nível
- **THEN** a resposta é 400 `clonagem_de_voz_recusada`, e nenhum provedor é chamado

#### Scenario: Flag desligada

- **WHEN** a flag `voz_natural` está desligada, que é o padrão da migração 0046
- **THEN** a resposta é 503 `voz_natural_desligada`, e nenhum provedor é chamado

### Requirement: Cota de caracteres da voz

A voz natural SHALL contar caracteres no mês e no dia local da pessoa, pelos tetos `vozCaracteresMes` e
`vozCaracteresDia` da matriz de planos.

- O mês esgotado SHALL recusar com 402 `quota_exceeded`.
- O dia esgotado SHALL recusar com 429 `uso_justo_do_dia` e devolver a reserva do mês.
- A fala que não foi entregue SHALL devolver os caracteres.
- A mesma fala servida pelo cache MUST NOT gastar cota.

#### Scenario: O uso justo do dia acabou

- **WHEN** a cota de caracteres do dia se esgota
- **THEN** a resposta é 429 `uso_justo_do_dia`, nenhum provedor é chamado, e a reserva do mês volta

### Requirement: A voz da nuvem recua para a do aparelho

Se a voz natural falhar antes de o áudio começar, a voz do aparelho SHALL ler a mesma fala, no mesmo idioma
e com os mesmos callbacks. Isso vale para recusa do servidor, prazo de 6 s, falha de rede ou áudio que o
navegador não deixa tocar. Depois de uma recusa que não muda na próxima fala, o cliente MUST NOT pedir de
novo:

- 402, 501 e 503 da flag desligada: não pede até o fim da sessão;
- 429: não pede até o `Retry-After`;
- 422: não pede mais naquele idioma.

Um erro depois de o áudio começar SHALL chegar a quem chamou, sem ler a fala de novo.

#### Scenario: Nuvem fora do ar

- **WHEN** `POST /api/ai/tts` responde 502
- **THEN** a voz do aparelho lê a mesma tradução, e a próxima fala tenta a nuvem de novo

#### Scenario: Sem o Premium

- **WHEN** a rota responde 402
- **THEN** a voz do aparelho lê, e a nuvem não é chamada de novo naquela sessão

### Requirement: A tela frente a frente

- **No celular**, a tela SHALL ficar dividida frente a frente. A metade do outro SHALL ficar virada 180° no
  alto, e a faixa do meio SHALL ter trocar os lados, a voz em uso e sair.
- **No computador**, a tela SHALL ter duas colunas, sem metade virada, com os atalhos: `1` e `2` falam, `R`
  repete, `P` para a voz e `Esc` sai.
- **Os atalhos** MUST NOT disparar com um modificador pressionado nem com o foco num campo de texto.
- **O microfone** SHALL abrir só no toque de um lado, dentro do gesto.
- **Sair** SHALL abrir o Encerrar de sempre.

#### Scenario: Celular

- **WHEN** o intérprete abre num celular
- **THEN** a metade `outro` tem `data-virada` e fica girada 180°, e a metade `meu` não

#### Scenario: Computador

- **WHEN** a pessoa aperta `2` no computador, com a tela do intérprete aberta
- **THEN** o microfone abre na direção do lado `outro`

### Requirement: A sessão do intérprete

A sessão do intérprete SHALL começar sem abrir fonte nenhuma. O som do computador e a identificação de voz
MUST NOT entrar nela. "Continuar gravando" MUST NOT reabrir o microfone sozinho. Ao salvar, a sessão SHALL
receber `meta.scenario = 'interprete'`. Cada fala SHALL ser gravada no idioma do seu lado, com a tradução no
idioma do outro. `PATCH /api/sessions/:id/meta` SHALL aceitar só os cenários conhecidos: `media`,
`conversation`, `mic` e `interprete`.

#### Scenario: Salvar uma conversa do intérprete

- **WHEN** a pessoa sai do intérprete e salva no Encerrar
- **THEN** a sessão fica com `scenario: interprete`, e as falas de cada lado ficam no idioma de cada lado

#### Scenario: Cenário inventado

- **WHEN** o `PATCH /meta` traz um `scenario` fora da lista
- **THEN** o valor é recusado pelo esquema no servidor, e ignorado no servidor sem conta

### Requirement: Ouvir a tradução na folha da frase

A folha da frase SHALL ter o botão "Ouvir tradução", que lê a tradução no idioma dela. O "Ouvir" de sempre
SHALL continuar lendo o original. Sem tradução, ou com a tradução ainda a caminho, o botão MUST NOT
aparecer.

#### Scenario: Tradução pronta

- **WHEN** a pessoa toca "Ouvir tradução" numa fala em português traduzida para o inglês
- **THEN** a tradução é lida com uma voz em inglês

### Requirement: O tempo até a voz é medido

A espera entre o fim da fala original e o começo da voz (`tts_inicio`) SHALL ser registrada por motor
(`voz-da-nuvem` ou `voz-do-aparelho`), com p50 e p95, e exposta em `window.__ttsInicio()`. O Repetir MUST
NOT contar. Sem amostra, o resumo SHALL ser `null`, e não zero. A métrica MUST NOT entrar no lote `v: 1` da
telemetria da captura. O e2e do computador SHALL conferir a meta do dono (≤ 2,5 s no p50, no Premium),
com `/api/ai/tts` simulado.

#### Scenario: A meta no e2e

- **WHEN** o e2e do computador fala dos dois lados com a voz natural simulada
- **THEN** `window.__ttsInicio()` traz 2 amostras do motor `voz-da-nuvem`, com p50 ≤ 2.500 ms
