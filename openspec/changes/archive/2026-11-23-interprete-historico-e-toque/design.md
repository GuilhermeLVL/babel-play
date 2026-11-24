## Context

`ModoInterprete.tsx` recebe `falas: FalaDoInterprete[]` (`id`, `originalText`, `translatedText`, `isPartial`, `lado`)
e desenha só `ultimaDoLado(falas, lado, parcial)` em cada metade. A tradução de uma fala do lado `meu` aparece na
metade do `outro` (e vice-versa). A leitura em voz alta passa pela `filaDeFala` (máx. 3 itens, guarda de eco de
800 ms). Já existem: `ChatTranscript.tsx` (palavras clicáveis), `palavraDaFala.ts` (`examineWord`), `ouvirNaLegenda`
e `speakWord` em `LiveCapture.tsx`, `falar(texto, idioma)` em `lib/tts.ts`, `audioDasFalas.ts` (repete o áudio
original) e o relatório da sessão em PDF/Markdown (`ExportarSessao`, commit `6e90ad78`).

O dono reprovou antes um protótipo minimalista que trocava ícones e detalhes: **manter o desenho atual e replicar o que
já existe** (memória `feedback-design-consistencia-nao-reinventar`).

## Goals / Non-Goals

**Goals:**
- Mostrar a conversa inteira sem custo no pipeline (só apresentação) e sem perder desempenho em conversas longas.
- Tocar para ouvir em qualquer palavra ou frase, sem quebrar o turno nem o guarda de eco.
- Corrigir, favoritar e exportar com o que já existe.

**Non-Goals:**
- Mudar VAD, STT, MT ou TTS (Fase 2). Vozes por falante (Fase 3). Captura do PC (Fase 4).
- Pinyin/romanização ao tocar (ideia de modo "ensino"): fica para depois, só se a folha da palavra já a trouxer.
- Nível do microfone e tamanho de letra ajustável: dependem de dados que a captura não entrega à tela; etapa própria.
- Gravar áudio da conversa; só texto, como hoje.

## Decisions

1. **Função pura `historicoDoInterprete(falas, lado, {janela})`.** Devolve a lista de itens finais do lado, ordenada,
   mais o parcial em andamento (se houver) e `grande` = último item. A tela só renderiza. Alternativa (guardar o
   histórico dentro do componente) foi descartada: duplicaria estado que o `LiveCapture` já tem em `speechSegments`.
2. **Janela de renderização de 50 itens**, com "ver mais" que sobe a janela de 50 em 50. Mantém o DOM pequeno no
   celular e no Quest; o histórico completo continua em `speechSegments` e na exportação.
3. **Histórico por metade (padrão) + modo "Conversa" (novo).** Na metade, os itens antigos ficam menores e
   esmaecidos acima do grande. Em "Conversa", uma lista única em bolhas (esquerda = outro, direita = eu) com original
   e tradução. Escolha guardada em `babel.interprete.tela` (conveniência; sem armazenamento vale o padrão). Alternativa
   (só a linha do tempo) descartada: quebra a frente-a-frente aprovada.
4. **Rolagem presa no fim**, solta quando a pessoa rola para cima; aparece o botão "Ir ao fim" com contador de novas.
   `aria-live="polite"` só na bolha nova, para não reler tudo.
5. **Tocar para ouvir passa pela fila, em prioridade "manual".** Corta a voz em curso (como o barge-in) e fala o
   trecho. Com o microfone aberto (estado `ouvindo`) o toque é ignorado com dica curta, para não ouvir a própria
   leitura. A palavra é separada com `Intl.Segmenter` (granularidade `word`), com queda para caractere em zh/ja/th
   quando o aparelho não a tem. O idioma da palavra vem de `examineWord` (resolve o idioma real).
6. **Corrigir = editar o original e refazer a tradução.** Nova ação da ponte, `corrigirFala(id, texto)`: atualiza o
   segmento em `speechSegments`, chama `traducaoDaFala` e substitui a tradução; não lê em voz alta sozinha. A
   sessão salva a versão corrigida. Sem rede, a edição vale e a tradução fica "pendente" com botão de tentar de novo.
7. **Guardar e exportar reaproveitam.** A estrela abre a `FolhaDaFrase` já existente (de lá, as palavras abrem a
   `FolhaDaPalavra`), sem o "Falar eu" dentro do intérprete. Exportar gera o Markdown da conversa no aparelho
   (`exportarConversa.ts`, puro); o relatório em PDF continua sendo o da sessão salva, na Análise.
8. **Estados da faixa** mapeados 1:1 dos estados da máquina (`interprete.ts`): ouvindo, reconheci, traduzindo, lendo,
   parado. Nada de estado novo na máquina.

## Risks / Trade-offs

- [Lista longa pesa no Quest/celular] → janela de 50 itens e itens simples (sem `box-shadow` pesado).
- [Tocar durante a leitura confunde o turno] → o toque corta a voz e a fila retoma o estado `parado`; teste cobre.
- [Editar o original com a tradução em voo gera corrida] → cada edição leva um número de versão; só a última vence.
- [Segmentação de palavra errada em zh/ja] → `Intl.Segmenter` quando existe; senão a frase inteira é o alvo do toque.
- [Metade virada 180° dificulta ler o histórico] → o histórico vai na orientação da própria metade; "Conversa" é a
  saída para quem lê sozinho.

## Migration Plan

Sem migração de dados nem de API. Entra atrás de nada: é aditivo e vale em todos os planos. Reversão = reverter o
commit. A preferência `babel.interprete.tela` é opcional.

## Open Questions

- O toque em "Repetir" de uma frase antiga deve repetir o **áudio original** (`tocarAudioDaFala`) ou a **leitura da
  tradução**? Proposta: os dois como dois botões na bolha ("ouvir original" só onde o áudio existe, ou seja, no Quest).
