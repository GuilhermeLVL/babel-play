## ADDED Requirements

### Requirement: O STT local aquece só quando há intenção de capturar

Com a flag de aquecimento por intenção ligada, a tela de captura SHALL chamar o pré-aquecimento dos modelos quando o foco
ou o ponteiro permanecer 200 ms sobre "Iniciar", ou quando a pessoa confirmar os idiomas da sessão. A tela SHALL NOT
aquecer ao abrir, ao navegar pela tela sem tocar nesses controles, nem com o foco ou o ponteiro saindo antes dos 200 ms. Sem a
flag, o comportamento SHALL ser idêntico ao anterior à mudança (só o previsto do selo ao abrir).

#### Scenario: Ponteiro sobre "Iniciar" por mais de 200 ms

- **WHEN** a flag está ligada, o perfil permite e o ponteiro fica 200 ms sobre "Iniciar" com o modelo em cache
- **THEN** o STT local começa a carregar antes do clique

#### Scenario: Ponteiro atravessa o botão

- **WHEN** o ponteiro entra e sai de "Iniciar" em menos de 200 ms
- **THEN** nenhum worker de STT ou de tradução é criado

#### Scenario: Pessoa só passa pela tela

- **WHEN** a pessoa abre a captura, não foca nem aponta "Iniciar", não confirma idiomas e sai
- **THEN** nenhum worker de STT ou de tradução foi criado durante a visita

### Requirement: O aquecimento por intenção respeita o perfil e as guardas existentes

O aquecimento por intenção SHALL reusar as guardas do pré-aquecimento atual: só modelos já em cache (nunca baixa), nada na
rota de nuvem, nada de Whisper quando o áudio da aba vai ao reconhecedor do navegador, um modelo grande de cada vez e nada
com carga em voo ou modelo pronto. A decisão por perfil (pouca memória, modo leve, Safari/WebKit, memória do aparelho) SHALL
ser uma função pura. Em pouca memória e no modo leve, só a confirmação dos idiomas SHALL aquecer. No Safari/WebKit, o
aquecimento por intenção SHALL permanecer desligado até a medição de memória do dono ser registrada.

#### Scenario: Modelo fora do cache

- **WHEN** a intenção dispara e o modelo da rota não está em cache
- **THEN** nada é baixado; o download continua sendo decisão da pessoa no "Iniciar"

#### Scenario: Áudio da aba no reconhecedor do navegador

- **WHEN** o cenário é áudio do sistema e o motor da aba é o reconhecedor do navegador
- **THEN** o Whisper não é aquecido

#### Scenario: Aparelho de pouca memória

- **WHEN** o perfil é de pouca memória ou o modo leve está ativo e a pessoa só aponta "Iniciar"
- **THEN** nada é aquecido; a confirmação dos idiomas ainda pode aquecer

### Requirement: O ganho e o custo são medidos pela bancada

A bancada de captura SHALL ter um cenário de intenção (foco em "Iniciar" por N ms antes do clique) e um cenário de visita
sem captura. Aceitar a mudança SHALL exigir, antes × depois intercalados no mesmo ambiente: `sttProntoMs` com 1 500 ms de
intenção menor ou igual a zero (pronto antes do clique) no desktop, sem piora do `sttProntoMs` sem intenção; zero workers na
visita sem captura; e, depois de sair da tela, os workers encerrados dentro do prazo existente (na hora em pouca memória,
20 s no resto).

#### Scenario: Intenção de 1,5 s no desktop

- **WHEN** o cenário foca "Iniciar", espera 1 500 ms e clica, com cache quente e a flag ligada
- **THEN** `sttProntoMs` é menor ou igual a zero

#### Scenario: Sem intenção

- **WHEN** o cenário clica em "Iniciar" sem foco prévio
- **THEN** `sttProntoMs` não é pior que o medido sem a flag, dentro da tolerância da bancada
