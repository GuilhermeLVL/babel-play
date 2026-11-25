# stt-ingles-na-nuvem Specification

## Purpose

Normalizar volume antes do STT na nuvem (flag) e revisar a rota do inglês. Criada pela change `stt-ingles-volume-e-rota` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-stt-ingles-volume-e-rota/proposal.md` para o porquê.

## Requirements

### Requirement: O áudio enviado à nuvem tem o volume normalizado

Com a flag `stt_nuvem_normalizar` ligada, o cliente SHALL levar o pico de cada trecho enviado ao STT de nuvem a −3 dBFS por uma
função pura, ANTES do encode (Ogg Opus ou WAV). O pico SHALL ser o percentil 99,9 do módulo das amostras, para que um clique isolado não anule o ganho da fala;
as amostras acima dele SHALL ser limitadas sem passar de [−1, 1]. O ganho SHALL ter teto de 40 dB, SHALL nunca atenuar, SHALL NOT amplificar
trecho abaixo do piso de silêncio e SHALL NOT produzir amostras fora de [−1, 1]. A função SHALL devolver uma cópia: o PCM
original e o caminho local (motores no aparelho) SHALL NOT ser alterados. A flag SHALL nascer desligada e, desligada, o corpo
enviado SHALL ser byte a byte o de antes.

#### Scenario: Fala gravada baixo

- **WHEN** a flag está ligada e o trecho tem pico de −60 dBFS
- **THEN** o áudio enviado à nuvem tem pico de −3 dBFS (ganho limitado a 40 dB) e nenhuma amostra passa de 1,0 em módulo

#### Scenario: Fala baixa com um clique alto

- **WHEN** a flag está ligada, a fala tem pico de −50 dBFS e um único clique isolado chega a −1 dBFS
- **THEN** o ganho é calculado pelo percentil 99,9 (a fala sobe) e o clique é limitado sem sair de [−1, 1]

#### Scenario: Silêncio e áudio já alto

- **WHEN** o trecho está abaixo do piso de silêncio, ou já tem pico acima de −3 dBFS
- **THEN** o ganho é 1 e o áudio enviado é igual ao original

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** o áudio enviado é o mesmo de antes da mudança e o caminho local nunca passa pela normalização

### Requirement: A normalização não muda a privacidade

A mudança SHALL NOT enviar áudio ou texto à rede de quem não optou pela nuvem. A retenção do áudio SHALL continuar zero,
os pedidos ao OpenRouter SHALL continuar com `zdr` e sem Gemini, e planos e cotas SHALL NOT mudar.

#### Scenario: Convidado ou menor sem consentimento

- **WHEN** a política de privacidade bloqueia a nuvem
- **THEN** nenhum áudio é normalizado para envio nem enviado, e a flag não altera esse comportamento

### Requirement: A rota do inglês decide pela medição registrada

A rota do inglês no modo automático SHALL decidir por uma medição versionada (`medicoesDeStt`, com WER, IC 95%, n, data e
fonte), não por número fixo no código. A rota SHALL mandar o inglês à nuvem primeiro somente se a nuvem normalizada vencer o
motor local de inglês com IC 95% pareado (limite superior da diferença de WER abaixo de zero). Sem medição que vença, ou
com a flag desligada, o inglês SHALL ficar no aparelho. O número 4,9% SHALL NOT constar do roteador.

#### Scenario: A nuvem normalizada vence o aparelho

- **WHEN** a medição registrada mostra a nuvem normalizada com diferença pareada contra o motor local de inglês de limite
  superior abaixo de zero, e a pessoa tem nuvem
- **THEN** a rota `auto` do inglês é "nuvem primeiro, reserva local"

#### Scenario: Empate

- **WHEN** a diferença pareada inclui zero
- **THEN** o inglês fica no aparelho

#### Scenario: Pt e es não mudam

- **WHEN** o idioma é português ou espanhol
- **THEN** a rota é a mesma de antes da mudança

### Requirement: A decisão de ligar sai da bancada, com critério escrito antes

A flag SHALL ser ligada somente se, nas mesmas 100 falas em inglês, o WER da nuvem normalizada ficar ≤ 8%, a diferença
pareada contra a rota sem ganho tiver limite superior abaixo de zero, o WER em português não piorar além do IC 95% pareado e
a latência mediana e o p95 não subirem mais de 10%. O resultado SHALL ser registrado em `docs/auditoria/`.

#### Scenario: Normalizada não chega a 8%

- **WHEN** a rodada depois mede WER maior que 8% em inglês
- **THEN** a flag não é ligada e o inglês fica no aparelho
