## Context

O texto da legenda nasce no navegador. Há quatro caminhos: o pipeline local (Whisper, Moonshine, Parakeet via
`src/lib/captura/pipelineDeFala.ts`), a Web Speech (`segmentosDaWebSpeech.ts`, `webSpeechDoSistema.ts`), a tradução
(`src/lib/captura/traducaoDaFala.ts`, que escreve `translatedText` e, na falha, `(${text})`) e os parciais traduzidos do
intérprete. Todos escrevem no mesmo estado, `speechSegments` (`useState<SpeechSegment[]>` em
`src/components/views/LiveCapture.tsx:620`). O pipeline escreve por `setterNoQuadro(setSpeechSegmentsDaTela)`
(`pipelineDeFala.ts:379`) e a tradução, pelo `setSpeechSegments` que recebe. Lista, painel flutuante, intérprete
(`ModoInterprete.tsx`), exportação (`exportarConversa.ts`) e vocabulário (`vocabularioDaSessao.ts`) leem desse estado.

O servidor já tem uma normalização robusta (`normalizar` em `server/ai/moderacao/moderarSaidaDoTutor.ts:66`) e listas
pensadas para a saída do tutor (`listasParaMenores.ts`). Essas listas barram frases de intenção ("how to buy weed") e
trocam a resposta inteira por uma frase fixa. Para a legenda isso não serve. O problema da legenda é palavra solta
alucinada ("porn"), e a frase não pode ser trocada inteira: a pessoa perderia a fala e não saberia por quê.

O perfil protegido no cliente vem de `perfilProtegido()` (`src/lib/protecaoDoMenor.ts`): verdadeiro para menor de 18 e para
quem não declarou a idade, inclusive sem conta; falso só no self-host e para o adulto declarado.

## Goals / Non-Goals

**Goals:**

- Nenhum termo das listas aparece em lista, PiP, voz, exportação ou cartão para o perfil protegido.
- A pessoa entende que algo foi ocultado e que o reconhecimento pode ter errado.
- Custo desprezível por fala e zero rede.
- Um ponto de aplicação só, para que um caminho novo de texto não escape.

**Non-Goals:**

- Detectar alucinação do STT em geral (é a frente de qualidade do STT, achado COMP-01).
- Moderação por IA ou por serviço pago.
- Filtrar o texto que vai ao tradutor. A tradução recebe o texto cru, para traduzir certo o que é legítimo, e a saída é
  filtrada depois. No perfil protegido a tradução já roda no aparelho (`protegidoSemResponsavel`), então nada sai.
- Filtrar áudio (a voz do vídeo continua tocando).

## Decisions

1. **A normalização vai para o núcleo** (`src/core/moderacao/normalizar.ts`), e o servidor passa a importá-la de lá. O
   servidor já importa de `src/core` (por exemplo `server/http/metricas.ts`). Assim existe uma régua de normalização, e o
   teste de `filtro-tutor-menores` continua verde sem mudança. Alternativa descartada: copiar a função, o que daria duas
   réguas divergindo com o tempo.
2. **Casamento por palavra, não por índice no texto normalizado.** A função quebra o texto ORIGINAL em palavras (com
   `Intl.Segmenter` quando houver, regex Unicode como reserva) e normaliza cada palavra e cada par de palavras vizinhas.
   Quando casa com a lista, troca só aqueles trechos do original por `•••`. Isso evita mapear posições entre o texto
   normalizado e o original (o NFKD e a junção de letras espaçadas mudam o tamanho) e preserva pontuação, maiúsculas e
   acentos do resto. Letra espaçada ("p o r n") é tratada como janela de até 6 palavras de 1 letra.
3. **Listas próprias da legenda** (`termosDaLegenda.ts`), por categoria: `sexual` (pornografia e sexual explícito sem uso
   neutro: `porn*`, `porno`, `pornô`, `pornografia`, `hentai`, `nudes`…), `odio` (as ofensas inequívocas já aprovadas em
   `listasParaMenores.ts`, reaproveitadas) e `palavrao` (só se o dono aprovar; ver Open Questions). Ficam de fora, com
   motivo anotado, os mesmos ambíguos do tutor (`sexo`, `sex`, `coger`, `bicha`, `veado`, `pelado`, `gozar`…). O "sexo
   feminino" de uma aula de biologia não pode virar `•••`.
4. **O ponto de aplicação é o setter do estado.** `LiveCapture` cria `setSpeechSegments` e passa adiante uma versão
   envolvida, `comLegendaSegura(setSpeechSegments, () => politicaAtual)`. Ela aplica a função ao resultado de cada
   atualizador, só nas falas cujos campos de texto mudaram (comparação por referência de string; a memoização evita
   refazer a regex em falas antigas a cada quadro). Alternativa descartada: filtrar na renderização. Seriam vários pontos
   (lista, PiP, intérprete, exportação, vocabulário) e um esquecido vazaria.
5. **O marcador fica no texto e o contador fica na fala.** A fala ganha `ocultadas?: number`. O componente da fala troca
   `•••` por um `<span>` com `aria-label` traduzido. A exportação mantém `•••`. O vocabulário e o "Guardar" ignoram
   tokens `•••`. A voz do intérprete lê o texto com o marcador retirado (pula a palavra).
6. **Aviso uma vez por sessão.** Na primeira fala com `ocultadas > 0`, um aviso discreto: "Uma palavra foi ocultada pela
   proteção. O reconhecimento automático às vezes entende errado." O aviso usa o canal de avisos que a captura já tem e
   não interrompe a legenda.
7. **Política**: `{ ligada: boolean; categorias: Set<Categoria> }`. Perfil protegido: ligada e travada, com `sexual` e
   `odio` (mais `palavrao` para `menor-12`, se aprovado). Adulto declarado: desligada; a opção em Ajustes liga `sexual` e
   `odio`. Self-host: como o adulto.

## Risks / Trade-offs

- [Falso positivo em conteúdo legítimo] → Lista curta, só termos sem uso neutro. O corpus de negativos (frases de aula,
  das legendas da auditoria e do glossário) é cobrado no teste com teto de 0 ocultações.
- [Custo por parcial no celular] → Função O(n) por palavra e memoização por string. A spec fixa um teto (p95 menor que
  0,2 ms por fala de 30 palavras no vitest bench, CPU do CI).
- [A tradução de um termo ocultado reaparece em outro idioma] → A saída da tradução também é filtrada, com as listas dos
  três idiomas aplicadas a qualquer texto (o idioma detectado pode estar errado).
- [Idioma fora de pt/en/es] → Não coberto. Fica registrado como limitação, como no filtro do tutor.
- [Um caminho novo de escrita fora do setter] → Teste de arquitetura: um teste de grep falha se `setSpeechSegments` cru
  for passado a algum módulo fora de `LiveCapture.tsx`.

## Migration Plan

Atrás de nada: entra ligado para o perfil protegido no mesmo deploy, porque o risco atual é maior que o do falso positivo.
O rollback é reverter o commit, sem dado persistido (a preferência do adulto é uma chave nova em `preferencias.ts`, e o
padrão desligado não muda nada).

## Open Questions

- (Dono) A categoria `palavrao` entra para `menor-12`? A recomendação é que sim. Sem resposta, entra só `sexual` e `odio`.
- (Dono) O perfil protegido pode desligar? A recomendação é que não.
