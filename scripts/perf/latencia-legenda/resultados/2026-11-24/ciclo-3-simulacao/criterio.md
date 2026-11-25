# Critério do ciclo 3: simulação das políticas de exibição do parcial vivo (inglês)

Escrito e commitado ANTES de qualquer gravação. Não decide aprovação de nada: escolhe a FINALISTA que irá ao A/B real pareado (a decisão de aprovação continua sendo a do critério do A/B, que será escrito antes dele).

## Regras do dono (já decididas, valem para este ciclo)

- Erasure média <= 0,5 (IC 95% de B <= 0,6).
- Final p75 (`fimDaFalaAteLegendaMs` no inglês para pt): limite superior do IC 95% de B - A <= +100 ms.
- `rendersPorS.fala` dentro do SLO: B <= mediana(atual) x 1,25 + 10.
- WER do final <= +2 pp.
- Primária: atraso por palavra p50 do original; efeito mínimo -20% sobre o `atual`.
- Inglês ficou FORA da V7 porque o atraso piorava (+636 ms desktop, +248 ms fraco emulado). O ciclo procura uma política que o melhore.

## O que a simulação cobre e o que não cobre

- COBRE (regras de exibição sobre as hipóteses gravadas): atraso por palavra p50/p90, erasure, quadros por segundo de fala (proxy de renders).
- NÃO COBRE: WER do final e o final p75. O final escreve direto e cancela o limitador, então texto e hora do final independem da política (o simulador confere `finalIdentico`). Essas guardas são do A/B real da finalista.
- Cadência: a gravação usa a cadência mais rápida permitida (fração 1). A subamostragem x2/x3 só descarta decodes (otimista no atraso). A cadência de produção (fração 0,5) fica entre x1 e x2 conforme o custo do decode.

## Dados

- Cenário: `fleurs-en-8`, en-US para pt-BR, `--qualidade accurate`... (o padrão da bancada), com `parciais_vivos` ligada e `babel.lab.gravarHipoteses=1`.
- Perfis: desktop e fraco emulado, ~4 rodadas medidas cada (aquecimento descartado). Mais 2 rodadas do braço `atual` (sem flag) por perfil, como linha de base real.
- Mudança de código de laboratório necessária: a gravação passa a valer fora da rota do Parakeet (inglês roda Moonshine/Whisper), só com a chave de gravação ligada. Sem a chave, o escopo de produção não muda.

## Espaço de políticas a varrer (o padrão do simulador, 99 por grupo)

5 modos (`cauda-token`, `cauda-decode`, `sem-cauda`, `acrescenta-decode`, `acrescenta-token`) x máscara 0..3 (só nos `acrescenta-*`) x limitador 0/125/250 ms x subamostra x1/x2/x3.

## Validação do simulador (antes de confiar no placar)

Simular a política da V7 (`acrescenta-decode`, máscara 2, limitador 125 ms) e a V1 (`cauda-token`, sem limitador) sobre as gravações do inglês desktop e comparar com os números REAIS publicados: V7 inglês desktop (relatório `2026-11-22-ab-dos-parciais-v7.md`: atraso p50 1.873 ms, erasure 0,34) e V1 (`2026-11-21-ab-dos-parciais.md`). Aceite: atraso p50 dentro de +-25% e erasure dentro de +-0,15. Se falhar, corrijo o simulador ou declaro o limite (e o placar vira só ordenação, sem valor absoluto). A validação interna `--validar` (política gravada contra a tela real da mesma rodada) é reportada também.

## Regra de escolha da finalista (fixa)

1. Elegíveis: erasure média simulada <= 0,5 E quadros por segundo de fala (proxy de renders) <= limite do proxy.
2. Limite do proxy de renders: a medida real do proxy não é renders/s, então o limite é ancorado na V7, que passou o SLO no inglês desktop (76,1 renders/s reais contra o limite 123,2): `limite_proxy = quadros/s simulados da política da V7 x (123,2 / 76,1)`, calculado nas mesmas gravações. Na V1, que não tem limitador, o proxy mostra se a âncora é razoável.
3. Entre as elegíveis, a finalista é a de MENOR atraso por palavra p50 simulado; empate (diferença < 50 ms, a resolução do p50 simulado) desempata por p90, depois erasure.
4. Se nenhuma política elegível melhorar o atraso p50 do `atual` simulado (cauda-token, sem limitador) em pelo menos 20%, a conclusão é "nenhuma finalista: inglês não ganha por regra de exibição", e o inglês fica fora.
5. Se a finalista for x1 e a cadência de produção não a reproduzir (custo do decode > 250 ms), declaro, e a segunda melhor com x2 ou x3 também entra no relatório. Só UMA vai ao A/B.
6. A tabela das 10 melhores sai do placar, com as inelegíveis marcadas e à parte.
