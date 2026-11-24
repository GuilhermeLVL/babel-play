## Context

- **O intérprete reusa a captura.** Ele usa o mesmo pipeline de fala, as mesmas fontes de áudio e a mesma
  tradução da fala. As duas pessoas falam no mesmo microfone, e o lado tocado diz quem fala
  (`src/lib/captura/interprete.ts`).
- **A voz tem dois motores com a mesma interface (`TtsEngine`, `src/lib/tts.ts`).**
  - Todos os planos têm a voz do aparelho, `nativeTts`.
  - O Premium tem a voz natural (`src/lib/voz/vozDaNuvem.ts`). A tela só a cria com o entitlement
    `vozNatural` e a flag `voz_natural` ligada (`vozNaturalDisponivel` em `LiveCapture.tsx`, PR #47).
- **A rota da voz segue a ordem das outras funções de IA.** `POST /api/ai/tts` chama
  `server/ai/nucleo/sintetizarVoz.ts`. A ordem está no cabeçalho do arquivo: pedido, entitlement, flag,
  configuração, cache, portão, admissão, cota, cascata e custo.
- **O Android apita a cada religada da Web Speech** (`webSpeechBipaAoReligar`). Por isso a Web Speech do
  intérprete só abre no toque e fecha no fim da fala. Não há o laço de religar da captura contínua
  (`abrirMicrofoneNoLado` e `fecharMicrofoneDoLado` em `fontesDeAudio.ts`).

## Goals / Non-Goals

**Goals:**

- Uma conversa frente a frente num aparelho só, em todos os planos.
- A voz do outro sai no idioma de quem ouve.
- Voz atrasada não atrapalha a conversa.
- O app não transcreve a própria voz.
- A voz natural do Premium nunca deixa ninguém sem voz: a do aparelho segura.

**Non-Goals:**

- Ligar a flag `voz_natural`.
- Fixar as cotas definitivas da voz.
- Clonar voz: o servidor recusa, por construção.
- Mandar a métrica `tts_inicio` para a telemetria do servidor. Ela fica na aba; o lote `v: 1` não muda
  (`ca58ed8`).

## Decisions

### 1. Máquina de estados pura que devolve efeitos

`transicao(estado, evento, idiomas)` devolve o estado novo e a lista de efeitos, e não toca em nada. Quem
executa os efeitos é o controle (PR #47): abrir ou fechar o microfone, interromper, falar, repetir ou parar
a voz. Os motivos:

- **Dá para testar sem navegador.** `tests/interprete.test.ts` cobre o ciclo, o barge-in, a troca de lado e
  o Repetir com o microfone aberto, sem microfone, sem voz e sem DOM.
- **Evento fora de hora não faz nada.** Ele devolve o mesmo objeto de estado e nenhum efeito. A voz do
  turno anterior que avisa tarde não tira a máquina de `ouvindo` (teste "o fim da voz não tira de
  'ouvindo'").
- **`criarInterprete` muda o estado antes de executar os efeitos.** Assim o microfone, ao abrir, já lê a
  direção nova (teste "muda o estado ANTES de executar os efeitos"). `aoMudar` só avisa quando o estado
  muda.

### 2. A fila conta o tempo pelo `criadoEm`, o fim da fala original

O controle anota `agora()` quando recebe `aoFimDaFala` e o passa como `criadoEm` do item
(`controleDoInterprete.ts`, PR #47). O pipeline avisa `aoFimDaFala` quando o VAD fecha
(`pipelineDeFala.ts`), e a Web Speech avisa quando compromete o final (`aoFinalComprometido` em
`fontesDeAudio.ts`). Dois números
saem desse mesmo instante:

- **O limite de idade de 20 s.** Ele inclui a tradução e o pedido à nuvem. A tradução que chegou tarde
  demais fica na tela e não é lida.
- **A métrica `tts_inicio`.** Ela vai do `criadoEm` ao `onStart` do motor (`aoIniciar`). É a espera que
  quem ouve sente, não o tempo do motor sozinho.

A fila e o controle usam o mesmo relógio (`performance.now()`). Sem `criadoEm`, a fila conta da chegada.

### 3. A voz da nuvem recua para a do aparelho

- **A troca é invisível para a fila e para a máquina.** A voz da nuvem é um `TtsEngine`. Se ela falhar
  antes de o áudio começar, `nativeTts.speak` lê o mesmo texto com os mesmos `onStart`/`onEnd`
  (`tests/vozDaNuvem.test.ts`, "qualquer falha").
- **O cliente espera 6 s** (`PRAZO_DA_VOZ_DA_NUVEM_MS`). A fila dá 8 s para o motor começar
  (`PRAZO_PARA_COMECAR_MS`), então sobram 2 s para a voz do aparelho começar. No servidor, cada tentativa
  ao provedor tem até 12 s (`TIMEOUT_DA_VOZ_MS`).
- **A nuvem não insiste.**
  - 402, 501 e 503 da flag pausam pela sessão.
  - 429 pausa pelo `Retry-After`.
  - 422 pausa só aquele idioma.
  - 5xx, timeout e rede valem só para o item.
- **Um erro depois que o áudio começou não relê.** Ele chega ao `onError`, para a pessoa não ouvir a mesma
  frase duas vezes.
- **O guarda de eco conta o áudio da nuvem à parte, com `marcarFalaExterna`.** O `cancel()` do
  `speechSynthesis` zera o contador do nativo e não pode apagar um áudio que outro motor toca.

### 4. O microfone abre dentro do gesto (iPhone)

No iPhone, abrir o microfone, a Web Speech ou um `play()` de áudio exige um gesto da pessoa. Por isso:

- **A sessão do intérprete começa sem abrir fonte nenhuma** (`soNoToque` em `salvarSessao.ts`, PR #47).
- **O toque faz tudo sem nenhum `await` antes.**
  - `controle.tocar(lado)` chama `destravarVoz()` (`destravarVozDaNuvem`: um WAV de silêncio num
    `HTMLAudioElement` único e reaproveitado).
  - Em seguida manda `tocar` à máquina. O efeito `abrirMicrofone` chama `microfone.abrir()` na mesma
    pilha.
  - Na captura, `abrirContextoDoClique()` roda antes de `abrirMicrofoneNoLado()` (`LiveCapture.tsx`, PR
    #47).
- **O microfone que falha ao abrir volta a `parado`.**

Ninguém testou isso num iPhone de verdade. O PR #47 diz: "o WebKit (iPhone) não roda no runner".

### 5. O controle é criado no efeito (StrictMode)

`ModoInterprete.tsx` cria o controle num `useEffect`, e não no render nem num `useMemo`. O StrictMode monta,
desmonta e monta de novo. A limpeza chama `registrarPonte(null)` e `controle.sair()`, e `sair()` desliga o
controle de vez (`desligado = true`). Um controle criado no render morreria na primeira desmontagem, e a
tela ficaria surda.

As dependências do efeito são `[vozNaturalDisponivel, registrarPonte]`. Se `vozNaturalDisponivel` mudar com
a tela aberta, o controle é recriado. A conversa volta a `parado`, e `tempoAteAVoz` zera.

## Risks / Trade-offs

- **A meta de 2,5 s só foi medida com a nuvem simulada.** O e2e simula `/api/ai/tts` com um WAV de 0,2 s,
  e o PR relata 126 ms no p50. A latência do Chatterbox na DeepInfra não foi medida. A métrica fica na aba
  e não chega ao servidor.
- **O contrato do Chatterbox não foi conferido.** Faltam o campo do idioma (`extra_body.language`) e o tipo
  da resposta. A sonda de contrato precisa rodar antes de ligar a flag (`provedoresDeVoz.ts`, migração
  0046).
- **O motor da `main` não tem tela.** Enquanto o PR #47 não entrar, `filaDeFala`, `vozDaNuvem` e o
  controle não rodam para ninguém.
- **Algumas recusas não têm teste de pausa próprio.** A pausa do 501, do 503 da flag, do 503 do portão e
  do 422 no cliente está só no código (`lerRecusa`). O único teste de pausa pela sessão exercita o 402.

## Perguntas ao dono

1. As cotas da voz no Premium ficam em 600.000 caracteres por mês e 60.000 por dia? Hoje elas estão
   marcadas "PROVISÓRIO" em `src/core/planos.ts`, com a conta de custo ao lado. Ou o teto espera o custo
   medido no uso real, como diz o mesmo comentário?
2. O operador de voz é a DeepInfra (Chatterbox) mesmo? A perna do Google (Chirp 3 HD) entra como opção ou
   fica fora? A retenção de cada uma segue "a confirmar" em `docs/lgpd/operadores.md` e na T13 do
   `ropa.csv`.
3. Como medir a meta de 2,5 s com o provedor real antes de ligar a flag? Hoje a métrica fica só na aba
   (`window.__ttsInicio()`).
4. O PR #47 foi testado só em navegador emulado. Precisa de um teste num iPhone e num Android de verdade
   antes do merge, ou pode ser depois?
