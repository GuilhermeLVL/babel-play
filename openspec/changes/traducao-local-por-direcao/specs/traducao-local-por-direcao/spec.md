## ADDED Requirements

### Requirement: A tradução local por direção nasce desligada

A flag `traducao_local_por_direcao` SHALL nascer DESLIGADA (migrações provisórias PG 0026 e SQLite 0068, numeração conferida no
PR). Com ela desligada, o Bergamot SHALL atender só pt→en com o runtime atual (0.4.9), mesmo que `VITE_BERGAMOT_MODELOS_URL`
esteja definida e que haja modelos no R2.

#### Scenario: Flag desligada com modelos publicados

- **WHEN** a flag está desligada e `VITE_BERGAMOT_MODELOS_URL` aponta para um R2 com os pares X→en
- **THEN** es→en usa o tradutor de antes, nenhuma requisição vai ao R2 e o runtime é o 0.4.9

#### Scenario: Flag ligada sem URL

- **WHEN** a flag está ligada e `VITE_BERGAMOT_MODELOS_URL` está vazia
- **THEN** só o pt→en embutido usa o Bergamot

### Requirement: Modelo só é publicado com licença declarada e aprovação do dono

O script de publicação SHALL recusar qualquer par cujo catálogo não traga `licencaPesos` e `aprovadoPeloDono: true`. O catálogo
SHALL registrar a licença dos dados como `"não informada"` enquanto ela não for esclarecida. EuroNano SHALL permanecer fora do
catálogo enquanto a licença dos dados de treino (TED2020 CC BY-NC-ND) não for esclarecida e aprovada pelo dono.

#### Scenario: Par sem aprovação

- **WHEN** a publicação é pedida para um par com `aprovadoPeloDono: false`
- **THEN** o script sai com erro, nada é enviado ao bucket e a mensagem cita o par

#### Scenario: Arquivo diferente do catálogo

- **WHEN** o sha256 de um `.gz` baixado da origem difere do catálogo
- **THEN** a publicação aborta antes de gravar qualquer byte

### Requirement: Arquivo de modelo inválido nunca entra em uso

O worker SHALL conferir o sha256 de cada arquivo do par e SHALL recusar o par se algum divergir. O download parcial SHALL NOT
entrar no Cache Storage. Em qualquer falha do Bergamot a tradução SHALL cair no opus-mt sem erro visível.

#### Scenario: Corrupção

- **WHEN** o sha256 de um arquivo baixado não confere
- **THEN** o par é recusado, o arquivo é descartado e a legenda é traduzida pelo opus-mt

### Requirement: A rota de tradução local depende da direção

O app SHALL escolher o motor local pela direção: X→en (par publicado e aprovado) por `bergamot-local` com `opus-mt-local` de
reserva; en→pt-BR por `opus-mt-local` com o alvo `pt_br`, até um tradutor leve receber o veredito `aprovado`; pares sem o inglês
pelo pivô, cada perna segundo a sua direção. O veredito SHALL ser lido de dado versionado, nunca embutido em condicionais.

#### Scenario: X→en com par publicado

- **WHEN** a flag está ligada, o par es→en está publicado, aprovado e o aparelho roda o Bergamot
- **THEN** o primeiro motor local da escada é `bergamot-local` e o `opus-mt-local` fica de reserva

#### Scenario: en→pt-BR sem veredito

- **WHEN** a pessoa traduz de en para pt e nenhum tradutor leve tem o veredito `aprovado`
- **THEN** o motor usado é o opus-mt com o alvo `pt_br` e o Bergamot não é consultado

#### Scenario: Pivô

- **WHEN** a pessoa capta em es e traduz para pt
- **THEN** a primeira perna (es→en) usa o Bergamot e a segunda (en→pt-BR) usa o motor da linha de en→pt-BR

### Requirement: Tradutor leve para en→pt-BR só passa pelo teste cego

Um tradutor leve para en→pt-BR SHALL só receber `aprovado` se, no teste cego com no mínimo 2 avaliadores brasileiros nativos e 100
frases públicas embaralhadas, (i) menos de 10% das frases forem marcadas como português de Portugal, (ii) o COMET e o chrF++ pareados
não piorarem no IC 95% contra o opus-mt em `fleurs:en-pt` e `gold:en-pt`, e (iii) a naturalidade não for pior no IC 95%. A
concordância dos avaliadores (kappa) abaixo de 0,4 SHALL invalidar a rodada. O protocolo SHALL ser commitado antes da rodada.

#### Scenario: Reprovado ou inconclusivo

- **WHEN** a proporção de pt-PT fica em 10% ou mais, ou entre 8% e 12% com o IC cruzando o limite, ou qualquer par piora no IC 95%
- **THEN** o veredito é `reprovado` ou `inconclusivo` e o en→pt segue com opus-mt `>>pt_br<<`

#### Scenario: Protocolo alterado depois

- **WHEN** o protocolo do teste cego muda depois da primeira saída avaliada
- **THEN** a rodada não vale como decisão

### Requirement: O Bergamot é declarado nos perfis

Os perfis nativos SHALL listar `bergamot-local` na cadeia de `mt`, antes de `opus-mt-local`, e `resolveMt` SHALL atender esse
binding sem carregar um segundo opus-mt. O registro de motores SHALL usar o id `bergamot-local` também como `adapterId`. Um perfil
salvo que só liste `opus-mt-local` SHALL continuar funcionando, com o X→en indo ao Bergamot quando a flag permitir.

#### Scenario: Perfil novo

- **WHEN** o perfil `free-web` é resolvido
- **THEN** a cadeia de `mt` tem `chrome-translator`, `bergamot-local`, `opus-mt-local`, `server-llm-mt`, `mymemory`, nessa ordem

#### Scenario: Perfil antigo salvo

- **WHEN** um perfil salvo só tem `opus-mt-local`
- **THEN** a tradução funciona como antes e o disjuntor trata cada motor pelo seu nome

### Requirement: O runtime novo só entra depois da memória medida

O runtime do Bergamot SHALL só trocar do 0.4.9 para o WASM da Mozilla depois de o laboratório medir, no mesmo ambiente e com o
protocolo do laboratório, que a memória de pico (e o heap do WASM) cai com IC 95% pareado e que não há erro ao criar um segundo
modelo em sequência. O artefato SHALL ser vendorizado sem modificação, servido do próprio domínio, com aviso MPL e registro em
`FONTES.md`, e SHALL poder ser revertido por chave de build `antigo|novo`.

#### Scenario: Memória sem queda provada

- **WHEN** o IC 95% da diferença de memória cruza 0
- **THEN** o runtime não é trocado e o relatório diz "sem diferença provada"

#### Scenario: Erro no segundo modelo

- **WHEN** a criação do segundo modelo do pivô falha com o runtime novo
- **THEN** a perna seguinte cai no opus-mt e a troca de runtime não é aprovada até o teste passar

### Requirement: A decisão por A/B usa latência, qualidade, memória e download

A aprovação de um par ou de uma direção SHALL seguir o protocolo do laboratório: `criterio.md` commitado antes, mesmas falas e
mesmo aparelho, no mínimo 10 rodadas válidas por variante em ordem ABAB, diferença pareada por fala com IC 95% por bootstrap de
`fimDaFalaAteLegendaMs`. A qualidade SHALL vir da bancada de tradução (COMET e chrF++ pareados com IC 95%, com o gold de conversa), e
o relatório SHALL trazer memória e bytes baixados. Variante mais rápida que piora a qualidade no IC 95% ou que falha mais SHALL NOT
ser aprovada.

#### Scenario: Mais rápido, mas pior

- **WHEN** o Bergamot reduz o p75 com IC abaixo de 0, mas o COMET pareado de um par piora com IC inteiro abaixo de 0
- **THEN** esse par não é aprovado e segue no opus-mt

### Requirement: Ganho de celular só vale medido em aparelho real

Qualquer afirmação de ganho em celular, Quest ou iPhone SHALL ter origem `medido` num aparelho real (Android de entrada, iPhone ≥ 12,
Quest 3). Resultados emulados SHALL servir só para ordenar opções e achar regressão, e SHALL ser marcados `emulado`. A flag SHALL NOT
ser ligada para a classe celular sem a sessão de 10 min com STT e MT locais dentro dos limites de memória e latência.

#### Scenario: Só emulado

- **WHEN** só existem medições emuladas para o celular
- **THEN** o relatório não declara ganho de celular e a flag não liga para essa classe

### Requirement: Privacidade e menores não mudam

A tradução local SHALL NOT enviar texto, áudio ou identificador a nenhum serviço, e o download dos modelos SHALL ser a única
requisição da mudança (mesmas regras de confirmação e de economia de dados de hoje). Os testes e o teste cego SHALL usar só conteúdo
público (FLEURS, WMT, gold sem dado de usuário), e menores SHALL NOT participar da avaliação. Planos, cotas e a lista de
provedores de IA (Gemini proibido) SHALL permanecer inalterados.

#### Scenario: Sem conta

- **WHEN** a pessoa usa o app sem conta com a flag ligada
- **THEN** nenhuma frase traduzida sai do aparelho e a única rede usada é o download do modelo
