## Context

Estado conferido no código (21/11/2026): parcial local com tique fixo e teto por fala (`systemAudio.ts:401,411`,
`pipelineDeFala.ts:149-157`, `querParcial` :726-738); Whisper com janela de 30 s e sem estado reaproveitado entre chamadas (sem
`prompt_ids` no transformers.js); fila final > parcial em `filaDoWorker.ts`; o parcial ignora `onUpdate` (`whisperLocal.ts:680-684`);
Parakeet sem parcial; tradução de parcial só local e greedy; Web Speech do desktop já tem interinos nativos (fora do escopo).
O áudio da bancada é FALA HUMANA do FLEURS (não TTS), aparado por energia em `montar-audio.mjs`; o roteiro guarda só `iniS`/`fimS`
por fala. Linha de base do laboratório: desktop p75 `fimDaFalaAteLegendaMs` 967 ms; fraco emulado 1.373 ms.

## Decisions

### D1. Tempo por palavra: alinhamento forçado offline, SEM dependência nova

O áudio não vem de TTS, então não há timestamps de síntese. Caminho escolhido: um script de geração do roteiro roda o
`@huggingface/transformers` (já dependência e já usado em Node por `scripts/eval-fala/bancada/stt.mjs`) com um Whisper maior
(`small`) e `return_timestamps: 'word'` (atenção cruzada + DTW) sobre cada clipe APARADO, e grava `palavras: [{ t, iniS, fimS }]`
no JSON do roteiro, convertido para a linha do tempo da bancada somando o deslocamento da fala. O texto de referência é o do
FLEURS; as palavras alinhadas são casadas ao texto de referência (Levenshtein por palavra), e fala com menos de 90% casadas fica
fora do cálculo e é contada. Precisão esperada: ~100 a 200 ms por palavra (limite do DTW), logo o erro é igual nos dois lados do
A/B e cancela na diferença pareada; validação por amostra [D].
Alternativas: (1) MFA/wav2vec2-CTC (Python): mais exato, mas dependência nova (marcar [D] se o dono preferir; fica como plano B
se a amostra reprovar a precisão); (2) TTS com timestamps: muda o áudio, quebra a comparabilidade com a linha de base; (3)
anotação manual: não escala.
Tradução: não há verdade por palavra. O tempo de referência de cada palavra traduzida é o fim da palavra de origem na posição
proporcional (alinhamento linear origem→tradução, nomeado como PROXY). A métrica principal é a do original; a da tradução é
secundária e só compara variantes entre si.

### D2. Definição das métricas

`atrasoDePalavraMs` = (primeiro quadro pintado em que a palavra aparece, em qualquer forma, no balão) − (fim da palavra no roteiro),
por palavra, em p50/p90, por classe de aparelho e idioma. Palavra revista depois (apagada ou trocada) conta uma vez, pela
primeira aparição da forma que ficou no final. `erasure` (NE, Arivazhagan) = (palavras apagadas ou trocadas) / (palavras do
texto final), separada em original e tradução. Medida no cliente por `src/core/` puro, sobre a série `lat.dom` de mutações, e na
bancada pelas mesmas funções (uma implementação só). Marca `frasy:parcial` leva só números (id do motor, índice, contagem de
palavras confirmadas), nunca texto.

### D3. Cadência adaptativa (V1b)

Orçamento: o parcial só inicia se `RTF_medido × janela_atual ≤ fração` do intervalo e o worker estiver livre; o intervalo cresce
quando o RTF é alto e encolhe quando é baixo (piso 500 ms, teto 2 s, sem teto de contagem por fala, mas com teto de CPU
agregada). Parcial em andamento é cancelado pelo final (já existe a prioridade). Alternativa descartada: manter 2 s e só
aumentar o teto (custo linear sem ganho de atraso). Alternativa: tique por VAD (fim de pausa curta): útil, mas não resolve fala
contínua.

### D4. LocalAgreement-2 (V1c)

Função pura em `src/core/`: dadas as hipóteses H(n-1) e H(n), o prefixo comum (por palavra normalizada) é CONFIRMADO e nunca
mais regride na tela; a cauda é provisória. A UI marca a cauda com estilo próprio (itálico leve e contraste menor, mais
`aria-live="off"` na cauda e anúncio só do confirmado). Diferente da fila reprovada: a cauda é MOSTRADA de imediato; só muda o
estilo. Alternativas: n=3 (mais estável, mais lento); esconder a cauda (é a fila reprovada).

### D5. Parakeet (V2)

Re-decode da janela que cresce, sem estado reaproveitado; mesma cadência e o mesmo LocalAgreement. Só onde o Parakeet já está
ativo no perfil; sem baixar modelo novo. Flag separada para o A/B ser isolado.

### D6. Tradução incremental (V3)

`parcialEstavel` deixa de ser exclusivo do intérprete: traduz apenas o prefixo confirmado, com mask-k (esconde as k últimas
palavras da tradução; k padrão 2, ajustável pelo A/B), só motor local já carregado (nunca nuvem para parcial), greedy. A tradução
final substitui via `traducaoProvisoria` como hoje. Alternativa: traduzir a hipótese inteira (mais erasure).

### D7. Flags e A/B

`parciais_vivos`, `parciais_parakeet`, `traducao_incremental`, todas DESLIGADAS, sem regra de plano (PG 0029/0030/0031, SQLite
0069/0070/0071, conferidas contra a main em 23/11/2026). V2 e V3 só têm efeito com V1 ligada. **Escopo da entrega: os parciais vivos só valem na rota do Parakeet (pt/es, `parciais_parakeet` ligada, Parakeet ativo); a rota é decidida a cada parcial (`parcialVivoNaRota` no pipeline) e, fora dela, o comportamento é o de flag desligada. O modo padrão é `acrescenta-decode` (V7); a chave `babel.lab.parciaisModo` é só override. `traducao_incremental` foi reprovada no A/B e não se liga.** Cada uma tem `criterio.md` commitado antes da 1ª rodada,
≥ 10 rodadas por lado, IC 95% pareado por bootstrap (`ab.mjs`, `--alvos --flag-do-alvo`), conforme
`docs/auditoria/protocolo-do-laboratorio-de-latencia.md`.

## Risks / Trade-offs

- Precisão do alinhamento forçado: mitigada pela amostra manual e pelo plano B; erro igual nos dois lados.
- Mais parciais = mais CPU e frames longos no fraco: guardas de `slo-captura.json` e orçamento da D3.
- Flicker: a cauda provisória pode oscilar; a guarda é `erasure ≤ 0,2` e a confirmada nunca regride.
- Tradução do prefixo pode ficar pior que a da frase inteira: WER/qualidade do final não muda (final intocado); mede-se erasure da tradução.
- Acessibilidade: estilo provisório não pode depender só de cor; revisar leitor de tela.
- O ciclo 1 mostrou que "esperar" atrasa; qualquer variante que suba `fimDaFalaAteLegendaMs` p75 (IC) é reprovada.
- Emulado não aprova celular; ganho no fraco só vale com [R].

## Como medir

1. Lote A: gerar o roteiro com palavras, gravar a linha de base (≥ 10 rodadas, desktop e fraco emulado) com as métricas novas e
   as antigas, em `docs/auditoria/`.
2. Por variante: `criterio.md` antes; métrica primária `atrasoDePalavraMs` p50 (efeito mínimo provisório −20%, a confirmar pelo
   dono); guardas: `fimDaFalaAteLegendaMs` p75 não piora (limite superior do IC ≤ 0), `erasure` ≤ 0,2, WER final não piora,
   frames longos/CPU/memória dentro das tolerâncias de `slo-captura.json`.
3. Overhead das marcas novas: o mesmo A/B com e sem marcas.

## Open Questions

- [D] Efeito mínimo de −20% é o certo? E o k do mask-k?
- [D] Aceita-se MFA/wav2vec2 (dependência nova) se o DTW reprovar na amostra?
