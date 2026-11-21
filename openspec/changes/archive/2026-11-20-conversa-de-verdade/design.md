## Context

O Intérprete roda sobre o mesmo pipeline da captura (`pipelineDeFala.ts`), com um microfone e duas metades na tela. O
`lado` de cada fala (`SpeechSegment.lado`) diz a direção. No modo por toque, o toque em "Falar" abre o microfone do lado,
e o fim do turno hoje vem do VAD: silêncio de `REDENCAO_MS` = 800 ms (`systemAudio.ts:375`; `fontesDeAudio.ts:248` só muda
no Quest). O fim de fala inteligente (`fimDeFala.ts`, Smart Turn) só aprova `en` (`IDIOMAS_APROVADOS`) e fica atrás da chave
`fimInteligente`. Fechado o turno, a tradução sai e a voz lê (`interprete.ts`, `controleDoInterprete.ts`).

Enquanto o modelo carrega, o pipeline guarda até 24 trechos em `pendingUtterancesRef` (`pipelineDeFala.ts:840`) com
`{pcm, sr, rawSeq, source}`. Quando o modelo fica pronto, eles são transcritos com a direção do momento da transcrição,
não da captura, e o `fimDaFala` deles cai na máquina do turno atual (fecha o microfone de quem está falando agora).

`ModoInterprete.tsx:553` define `donoDe = lado => atual.trocados ? outro(lado) : lado` e o aplica à lista inteira
(linha 753), e a exportação usa a mesma lista.

O Whisper tem detecção de idioma própria (`idiomaDoWhisper.ts`): um passo do decoder, que devolve `{idioma, confianca}`. Foi
medido em 20/20 para pt e en com a fala inteira e 12/20 para pt com 1,5 s. Hoje ela só roda com "Detectar". No modo por toque
o idioma é dado pelo lado, e a fala em outro idioma é transcrita à força como se fosse o idioma do lado.

No celular, `sttRouter.ts` escolhe whisper-base q8 para "celular-bom". O Parakeet é o padrão pt/es só com 8 GB ou mais ou
Mac Apple (memória do projeto, 23/10).

## Goals / Non-Goals

**Goals:**

- Uma pausa de até 2 s no meio da frase não encerra o turno, e a voz nunca fala por cima de quem fala.
- Toda fala é atribuída à pessoa e à direção certas, inclusive as guardadas durante o download e as anteriores a uma troca
  de lados.
- Nenhuma tradução inventada é lida em voz alta quando o idioma não é o do lado.
- O primeiro uso nunca diz "Ouvindo…" sem reconhecimento.
- No celular, a metade de baixo é legível inteira e não há um segundo microfone colado ao "Falar".
- O reconhecimento em pt no celular deixa de produzir frases constrangedoras na amostra de teste.

**Non-Goals:**

- Mudar o modo automático (sem toque) ou a conversa virtual.
- Aprovar o Smart Turn para pt (é outra bancada).
- A escolha da voz de leitura (CONV-05: "Albert"/"Eddy"), que fica para uma change de vozes.

## Decisions

1. **Fim de turno no modo por toque**: `redencaoMs` no intérprete por toque passa a 2500 ms, e o botão do lado ativo vira
   "Terminei". O segundo toque fecha na hora. O VAD continua a separar o áudio em trechos, mas só o toque ou o silêncio
   longo fecham o TURNO (a máquina do turno ignora o `fimDaFala` curto). A leitura em voz alta espera o evento
   `microfoneFechado` do turno; o anti-eco (`suppressedSeqsRef`) continua. Alternativa descartada: aprovar o Smart Turn
   para pt (não há bancada) ou subir o VAD para 1,2-1,5 s (a pausa de 1,5 s da auditoria ainda cortaria).
2. **Direção no trecho guardado**: `pendingUtterancesRef` passa a guardar `{pcm, sr, rawSeq, source, lado, de, para,
turnoId}`. Ao transcrever, o pipeline usa essa direção. O `fimDaFala` de um trecho com `turnoId` diferente do turno atual
   não é entregue à máquina do turno.
3. **Estado de preparo no botão**: enquanto `modelReadyRef` é falso, o estado do lado é `preparando` (texto "Preparando
   N%"), com o aviso "Sua fala fica guardada e é traduzida quando o reconhecimento ficar pronto". "Ouvindo…" só com o
   modelo pronto. O microfone do turno fecha pelo mesmo critério da decisão 1, mesmo com o modelo carregando. Download
   antecipado: ao entrar em `/app/interprete` com o aceite de download já dado, e sem rede lenta ou economia de dados
   (`perfil.ts`), o modelo começa a baixar.
4. **Conferência de idioma no fim do turno**: o worker do Whisper, no modo por toque, roda `detectarIdiomaDoAudio` sobre o
   turno inteiro quando ele tem pelo menos 2 s (um passe do encoder a mais, só no fim). Se `idioma ≠ idioma do lado` e
   `confianca ≥ 0,8`, a fala vira `foraDoPar: { detectado }`: a metade mostra "Não parece {idioma do lado} — repetir?",
   sem tradução nem leitura. A lista guarda a fala marcada como não traduzida. Abaixo do limiar, segue normal. O limiar
   vem do conjunto de teste (decisão 7).
5. **Dono gravado**: `SpeechSegment.dono: 'meu' | 'outro'` é gravado quando a fala nasce (a partir de `lado` e `trocados`
   daquele instante). `donoDe` deixa de existir na lista; a exportação usa `dono`. Ao trocar, as frases das metades são
   limpas.
6. **Layout no celular**: `.int-frase` usa `font-size: clamp()` com um ajuste em JS (encolhe em passos até caber, mínimo de
   18 px), com rolagem como reserva. Com o Intérprete em curso, a casca esconde a barra inferior (o mesmo mecanismo de tela
   cheia das outras telas imersivas).
7. **Modelo do celular, por medição**: um conjunto de 10 frases em pt e 10 em en, com 2 vozes (as sintéticas da auditoria
   mais as gravações reais, se o dono autorizar), passa pelo `jantar.mjs` no perfil celular com whisper-base q8,
   whisper-small q4 e Parakeet. Critério: WER em pt de no máximo 20%, 0 frases "constrangedoras" (lista revisada à mão),
   1ª tradução p50 de no máximo 3 s depois do fim da fala, e memória da aba abaixo de 2,0 GB. O vencedor vira o padrão do
   Intérprete no celular. Sem vencedor, vale a conferência da transcrição (um toque corrige ou descarta antes da leitura).
   O diálogo de download passa a calcular o tamanho pelo modelo que o roteador escolher (CONV-11).

## Risks / Trade-offs

- [Silêncio de 2,5 s deixa a resposta lenta] → O "Terminei" encerra na hora; a dica do primeiro uso ensina o gesto.
- [Detecção com falso positivo bloqueia uma fala certa] → Limiar alto e fala de pelo menos 2 s; a pessoa repete com um
  toque; a métrica de bloqueios por sessão vai ao log da captura.
- [Esconder a barra prende a pessoa no Intérprete] → O "Sair" do Intérprete continua visível no topo.
- [Mais memória no celular] → Sentinela de queda e teto da decisão 7.

## Migration Plan

Mudanças de cliente, sem dado persistido além do campo `dono` nas falas da sessão (as sessões antigas, sem `dono`, caem no
cálculo antigo uma última vez). Rollback: reverter.

## Open Questions

- (Dono) Aceitar o download maior no celular, se a medição pedir.
- (Dono) STT em nuvem no Intérprete do celular para quem paga.
