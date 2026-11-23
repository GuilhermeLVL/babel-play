# A/B de V7: confirmação do parcial vivo (pt/Parakeet decide; inglês só não-regressão)

Data: 22 e 23/11/2026. Branch `lab/streaming-parciais`, código `71a6ae3f` (V6 `4a2d0c4b` mais a correção das telas Intérprete, Conversa virtual e iChat; o caminho do parcial, do final e da cadência é o da V6). `npm run build:estatica` refeito antes das rodadas.
Critério escrito e commitado antes de qualquer rodada válida: `scripts/perf/latencia-legenda/resultados/2026-11-22/parciais-v7-confirmacao/criterio.md` (commit `7026234d`).
Decisão de `ab-parciais.mjs --variante v4 --criterio <v7> --teto-final-ms 100` (parâmetro novo, commit `7c775549`, com teste; sem ele os vereditos antigos não mudam).
Dados: `.../parciais-v7-confirmacao/{desktop-pt,desktop-en,fraco-en}/`. Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% por comparação.

## Decisão do dono (registrada no critério, antes das rodadas)

O teto da guarda do final passou de +30 ms para **+100 ms**, a resolução declarada da bancada: V5 deu −48 ms [−114, +62] e V6 +48 ms [+1, +116], com o mesmo código de final e de parcial. O único outro item que mudou foi a amostra (mais rodadas). Nada mais foi afrouxado.

## Veredito pelo critério (sem mudar depois)

**pt/Parakeet, desktop (decisão): APROVADO.** **Inglês (não-regressão): PASSA no desktop e no fraco emulado** (todas as guardas ok).

| braço              | perfil        | rodadas válidas (A/B) | atraso por palavra p50 do original (ms)         | final p75 (B − A), teto +100                       | erasure de B (limite 0,5/0,6) | WER final (limite +2 pp) | renders/s na fala (limite) | papel            | resultado                                                 |
| ------------------ | ------------- | --------------------- | ----------------------------------------------- | -------------------------------------------------- | ----------------------------- | ------------------------ | -------------------------- | ---------------- | --------------------------------------------------------- |
| `v7-pt` (Parakeet) | desktop       | 22 / 22               | 2.640 → 1.104 (**−58,2%**, IC [−1.713, −1.268]) | `fimDaFalaAteOriginalMs` **+15 ms, IC [−32, +93]** | 0,41 (IC de B [0,30, 0,52])   | +0,2 pp, IC [−0,2, +0,9] | 58,0 → 62,9 (82,5)         | decisão          | **APROVADO**                                              |
| `v7-en`            | desktop       | 11 / 11               | 1.237 → 1.873 (+636, IC [−166, +1.104])         | `fimDaFalaAteLegendaMs` −51 ms, IC [−169, +32]     | 0,34 (IC de B [0,22, 0,46])   | +0,0 pp, IC [−1,5, +1,3] | 90,6 → 76,1 (123,2)        | só não-regressão | não-regressão **passa** (primária: sem diferença provada) |
| `v7-en`            | fraco emulado | 11 / 11               | 1.775 → 2.022 (+248, IC [+14, +503])            | `fimDaFalaAteLegendaMs` −11 ms, IC [−52, +26]      | 0,38 (IC de B [0,29, 0,50])   | −0,1 pp, IC [−1,5, +1,2] | 102,5 → 83,3 (138,1)       | só não-regressão | não-regressão **passa** (ver ressalva)                    |

Demais guardas do SLO (frames longos, CPU no silêncio, renders no silêncio, taxa de falha) ok nos três. No pt: 14 de 16 falas no cálculo por palavra; texto final: 5 de 352 textos de B fora do conjunto de A, WER 2,4% (A) e 2,6% (B).

Ressalva sobre o rótulo da ferramenta: no fraco emulado o `ab-parciais.mjs` imprime "REPROVADO" porque a primária ficou pior (IC inteiro acima de 0). Pelo critério, a primária do inglês é só informativa e a não-regressão depende das guardas, que passaram. O rótulo da ferramenta não é o veredito deste braço; o número fica registrado como risco abaixo.

Honestidade sobre o teto: com o teto antigo de +30 ms o pt reprovaria também (limite superior +93 ms). A aprovação depende da decisão do dono de usar +100 ms. O IC não ficou mais estreito do que o da V6 (largura 125 ms, contra 115 ms), mas se deslocou para perto de zero: +15 ms, contra +48 ms.

## Comparação V4, V5, V6 e V7 (pt/Parakeet, desktop)

| variante | rodadas por braço | falas no cálculo | atraso p50 (efeito) | final do original p75 (B − A) | teto | renders/s (limite) | veredito     |
| -------- | ----------------- | ---------------- | ------------------- | ----------------------------- | ---- | ------------------ | ------------ |
| V4       | 11                | 10               | −39%                | +198 ms, IC [+54, +445]       | +30  | 57 (ok)            | REPROVADO    |
| V5       | 11                | 10               | −55%                | −48 ms, IC [−114, +62]        | +30  | 109 (82)           | REPROVADO    |
| V6       | 15                | 14               | −58%                | +48 ms, IC [+1, +116]         | +30  | 63 (83)            | REPROVADO    |
| V7       | 22                | 14               | **−58%**            | **+15 ms, IC [−32, +93]**     | +100 | **63 (82)**        | **APROVADO** |

O efeito sobre o final do original ficou perto de zero nas três últimas medidas (−48, +48, +15 ms); o que decidiu a V7 foi o teto declarado e a amostra maior, não uma mudança de código no final.

## Fraco emulado não aprova celular

O perfil `fraco` é um notebook de entrada emulado por software (CPU 4× mais lenta pelo CDP, 2 núcleos, sem WebGPU), não um aparelho. Não exerce o Parakeet (rota `whisper-base`). Passar a não-regressão nele não substitui a rodada [R] em aparelho real.

## Riscos e limites

- **Inglês fraco emulado: atraso por palavra p50 +248 ms (IC [+14, +503]) e desktop +636 ms (IC [−166, +1.104]; p90 +817, IC [+44, +1.116]).** O critério trata a primária do inglês como informativa (a flag vale para todos os idiomas e a guarda é de não-regressão), mas o modo `acrescenta-decode` com máscara 2 não dá ganho de atraso em inglês e, no fraco, mostra o texto um pouco depois. A erasure cai (0,62 para 0,34 no desktop; 0,54 para 0,38 no fraco). É a troca já conhecida de pisca por atraso. Poucas falas (6 de 8 no cálculo por palavra), 1 voz FLEURS.
- A bancada mede 1 voz FLEURS por idioma, em desktop. Não mede percepção; a erasure é um proxy.
- Teste de percepção do dono (22/11) segue sendo de 1 pessoa sem protocolo.
- Incidente de bancada: a 1ª tentativa do A/B teve rodadas inválidas ("bipe não encontrado") porque o Mac dormia com a tampa fechada (`Clamshell Sleep`, `AppleClamshellState = Yes`) mesmo sob `caffeinate`. Com a tampa aberta e `caffeinate -dimsu --` as rodadas passaram a ser válidas (0 inválidas nas 88 rodadas medidas, aquecimento descartado). Os dados das tentativas inválidas foram descartados e não estão aqui.

## Correção das telas (etapa 1, commit `71a6ae3f`)

Com `parciais_vivos`, o Intérprete, a Conversa virtual e o iChat não viam o texto em curso do parcial (ele saiu do estado das falas, V6). O Intérprete e a Conversa virtual assinam o armazém por `useFalasDoEstadoComParcialVivo` (re-renderiza só a tela). O iChat soma o texto vivo (`conversaComTextoVivo`), assinando só com o chat aberto na captura e lendo o texto de agora ao montar o contexto. Testes em `tests/parcialVivoTelas.test.tsx` (um por tela, com a flag ligada; o pai não re-renderiza).

## Se aprovado: o que ligar

1. **Flags** (decisão [D] do dono; nascem desligadas, sem regra de plano): `parciais_vivos` e `parciais_parakeet` (esta só tem efeito com a anterior e onde o Parakeet é o motor). Migrações PG 0027/0028 e SQLite 0069/0070 têm numeração PROVISÓRIA: reconferir contra a `main` no PR. Ver `docs/flags.md`.
2. **O modo `acrescenta-decode` é chave de laboratório**, não padrão do código: o A/B rodou com `localStorage` `babel.lab.parciaisModo = acrescenta-decode` e a máscara no padrão 2 (`babel.lab.parciaisMascara` ausente). O padrão do código é `MODO_DE_PARCIAIS_PADRAO = 'cauda-token'` (`src/core/legendas/modoDeParciais.ts`). Ligar só as flags dá o modo `cauda-token` (V1), que NÃO é o que foi aprovado (a erasure sobe a 3,6).
3. **O que falta para virar padrão do código:**
   - trocar `MODO_DE_PARCIAIS_PADRAO` para `acrescenta-decode` (ou fazer a flag `parciais_vivos` já implicar o modo), mantendo a máscara padrão 2, e ajustar os testes que assumem `cauda-token` como padrão (`modoDeParciais`, `pipelineDeFala-parciaisVivos`);
   - decidir se a chave de laboratório continua lida em produção (hoje `lerChaveDeLaboratorio`) ou sai do caminho de produção;
   - o limitador de 125 ms já liga com `parciais_vivos` (não há chave para desligá-lo);
   - rodada [R] em aparelho real (celular, Parakeet e fraco real), que esta bancada não substitui;
   - decisão do dono sobre a troca de atraso em inglês (acima) e, de preferência, um teste de percepção com protocolo;
   - registrar o teto de +100 ms como regra permanente da bancada (hoje é o parâmetro `--teto-final-ms` e a decisão registrada no critério da V7), e atualizar `openspec/changes/parciais-incrementais/tasks.md` e `docs/flags.md`.
4. **Reversão:** desligar as flags devolve o comportamento de hoje (a única mudança fora da flag, em `traducaoDaFala.ts`, só reduz quantas vezes o estado é trocado).

## Reprodução

`bancada-captura.mjs --alvos atual=URL,v7-pt=URL --flag-do-alvo "atual=;v7-pt=parciais_vivos,parciais_parakeet" --armazenamento-do-alvo "v7-pt=babel.lab.parciaisModo:acrescenta-decode" --fixture tests/fixtures/bancada-captura/fleurs-pt-16.json --eles pt-BR --eu pt-BR --qualidade accurate --perfis desktop --rodadas 22 --sem-comparar`; inglês: `--perfis desktop,fraco --rodadas 11`, braço `v7-en` com `parciais_vivos` e o mesmo modo. Um servidor estático só (`tests/e2e-estatica/_servidor-estatico.mjs`, porta própria), tudo sob `caffeinate -dimsu --`, tampa aberta. Análise: `ab-parciais.mjs --rodadas <pasta rodadas/> --a atual.<perfil> --b v7-<x>.<perfil> --variante v4 --criterio <criterio.md> --teto-final-ms 100`. As pastas `metricas/` versionadas são as das rodadas; as rodadas brutas não foram versionadas.
