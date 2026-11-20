## Why

A frente "conversa no jantar" da auditoria de 17/11/2026 usou o Intérprete (`/app/interprete`) em produção como
visitante. Foram dois falantes sintéticos (pt-BR e en-US) num microfone falso, em turnos por toque, no desktop 1280×800 e
no Pixel 7 emulado. O app não sustentou uma conversa de verdade:

- **CONV-02 (CONFIRMADO)**: uma pausa natural de 1,5 s no meio da frase encerra o turno. O microfone fecha 1,4 s antes do fim
  da fala, a voz lê "Then." por cima de quem ainda fala, e "de chocolate" e "Well," se perdem. O fim de fala inteligente
  (`fimDeFala.ts:150`) só aprova `en` e fica atrás de uma chave desligada, então vale o silêncio fixo de 800 ms
  (`REDENCAO_MS`).
- **CONV-01 (CONFIRMADO, rebaixado a "atrapalha")**: no primeiro uso, a fala dita durante o download é entregue cerca de
  30 s depois, no lado errado (dono "outro", idioma "en"), traduzida às avessas ("Anota, que bom que tu vieres com."), e
  corta o próximo falante. O trecho guardado só leva `{pcm, sr, rawSeq, source}` (`pipelineDeFala.ts:840`), sem lado nem
  direção.
- **CONV-09 (CONFIRMADO)**: no primeiro uso, o microfone diz "Ouvindo…" aos 3,8 s com o reconhecimento em 0%, e não fecha
  sozinho.
- **CONV-03 (CONFIRMADO)**: a fala em espanhol no lado do inglês ("Perdón, ¿alguien quiere más pan?") virou "Sorry, I want
  to go to the bathroom." e foi lida em voz alta, sem aviso. A detecção de idioma do Whisper (`idiomaDoWhisper.ts`) existe,
  mas não é usada no modo por toque.
- **CONV-07 (CONFIRMADO)**: "Trocar os lados" reatribui o histórico inteiro. `donoDe` usa o `trocados` atual
  (`ModoInterprete.tsx:553`) para todas as falas (linha 753), e a exportação sai com os autores errados.
- **CONV-04 (CONFIRMADO)**: no celular (whisper-base q8, "celular-bom"), 2 de 3 frases em pt saíram erradas e
  constrangedoras ("My vomiting taught when I was a kid."). No desktop (whisper-small), 6/6 corretas.
- **CONV-08 (CONFIRMADO)**: no celular, a tradução da metade de baixo sai cortada, e o microfone da barra inferior fica a
  cerca de 100 px CSS do "Falar".

Relacionado: CONV-11 (polimento), o diálogo anuncia 353 MB também no celular, que baixa o whisper-base.

Evidências (relativas a `reports/auditoria-qualidade/conversa/`): `rodadas/desktop-cache-pausa/resultado.json`,
`rodadas/desktop-vazio-limpo/{console.log,resultado.json,tela.json,resumo.json}`, `rodadas/desktop-cache-ruido/resultado.json`
e `resumo.json` (turno es1), `rodadas/desktop-cache-limpo/99-lista.png` e `troca-antes-turno4.png`,
`rodadas/celular-cache-limpo/{resumo.json,turno1-en1.png,turno4-pt3.png}`, `rodadas/celular-vazio-limpo/resultado.json`.
Scripts: `jantar.mjs`, `resumir.mjs`, `gerar-falas.sh`, `sonda.mjs`; consolidado em `consolidado.json`.

## What Changes

- **Turno por toque que respeita pausas**: no modo por toque, quem tocou é quem fala. O fim do turno é o segundo toque
  ("Terminei") ou um silêncio de 2,5 s; o VAD de 800 ms deixa de encerrar o turno ali. A leitura em voz alta MUST NOT
  começar com o microfone do turno aberto.
- **Fala guardada com a direção do momento**: o trecho guardado durante o download leva o lado, o idioma de origem e o de
  destino do instante da captura, e o fim de fala de um trecho antigo não vai à máquina do turno atual.
- **Estado honesto no primeiro uso**: enquanto o reconhecimento não está pronto, o botão mostra "Preparando N%" e o aviso
  diz que a fala está guardada, nunca "Ouvindo…". O download começa ao entrar no Intérprete com Wi-Fi, para quem já aceitou.
- **Idioma fora do par**: no fim de cada turno, a detecção de idioma do Whisper confere o idioma do lado. Com confiança alta
  num idioma diferente, a fala aparece com "Não parece inglês — repetir?", não é lida em voz alta e não entra no
  histórico como tradução.
- **Dono gravado na fala**: cada fala grava a pessoa (Você / A outra pessoa) no momento em que é dita. "Trocar os lados"
  só muda as falas novas; as frases em exibição nas metades são limpas.
- **Reconhecimento melhor no celular para pt**: medir whisper-small q4 e Parakeet (pt/es) no perfil celular. Adotar o melhor
  que caiba no teto de memória e de latência. Se nenhum couber, mostrar a transcrição para conferir (um toque corrige ou
  descarta) antes de ler a tradução em voz alta. O diálogo de download anuncia o tamanho do modelo que o roteador vai usar.
- **Layout do celular**: a frase de cada metade encolhe a fonte até caber (com rolagem como reserva), e a barra de navegação
  some enquanto o Intérprete está em curso.

## Capabilities

### New Capabilities

- `interprete-por-turnos`: turnos por toque, atribuição de falas, idioma fora do par, estado do primeiro uso, qualidade do
  reconhecimento no celular e legibilidade das metades no Intérprete.

### Modified Capabilities

(nenhuma)

## Impact

- Alterados: `src/lib/captura/pipelineDeFala.ts` (trecho guardado com direção; fim de fala por trecho),
  `src/lib/captura/fontesDeAudio.ts` (`redencaoMs` no intérprete por toque), `src/lib/captura/controleDoInterprete.ts` e
  `interprete.ts` (segundo toque, leitura só com o microfone fechado), `src/components/views/captura/interprete/ModoInterprete.tsx`
  (dono gravado, estado de preparo, aviso de idioma), `src/lib/captura/tiposDaFala.ts` (`dono` na fala),
  `src/lib/captura/historicoDoInterprete.ts` e `exportarConversa.ts`, `src/gateway/adapters/whisperWorker.ts` (devolver a
  detecção no fim do turno), `src/gateway/sttRouter.ts` (modelo do celular no intérprete), `src/styles/modoInterprete.css`,
  a casca (esconder a barra) e o diálogo de download.
- Sem servidor, sem migração. Download no celular pode subir se o whisper-small q4 for adotado.

## Prioridade, esforço, riscos e dono

- **Prioridade**: P1. É o modo de maior valor percebido no primeiro uso. Ordem interna: dono gravado e trecho com direção
  (bugs de correção) → pausa e leitura → idioma fora do par → estado do primeiro uso → layout → modelo do celular.
- **Esforço**: médio a grande (cerca de 6 a 8 dias). Bugs de atribuição: 1,5. Turno e leitura: 1,5. Idioma fora do par: 1,5
  (o revisor corrigiu: não há detector pronto no modo por toque; o do Whisper existe mas precisa entrar no fim do turno).
  Primeiro uso: 1. Layout: 0,5. Medição e escolha do modelo do celular: 1 a 2.
- **Riscos**:
  - O silêncio de 2,5 s pode deixar a conversa lenta para quem fala frases curtas. Mitigação: o segundo toque encerra na
    hora, e o valor é medido na rodada da auditoria.
  - A detecção de idioma é fraca em trecho curto (12/20 pt em 1,5 s, `idiomaDoWhisper.ts`). Mitigação: só bloqueia com
    confiança de pelo menos 0,8 e fala de pelo menos 2 s; abaixo disso, a fala segue normal.
  - whisper-small q4 no celular pode estourar memória (CEL-02: de 1,6 a 2,6 GB com o base). Mitigação: teto medido e
    sentinela de queda (`sentinelaDoModelo.ts`).
  - As amostras da auditoria são poucas e de voz sintética (3 frases em pt). Mitigação: ampliar o conjunto de falas antes
    de decidir o modelo.
- **Precisa do dono**:
  1. Aceitar um download maior no celular (whisper-small q4, cerca de 250 MB) se ele vencer o base na medição, ou preferir a
     conferência da transcrição.
  2. Decidir se o Intérprete no celular pode oferecer o STT em nuvem a quem paga (custo; skill `custo-de-ia`).
  3. Gravar (ou autorizar gravar) 10 frases reais em pt e en, com duas vozes humanas, para o conjunto de teste.
