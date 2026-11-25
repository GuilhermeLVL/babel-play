# Simulador offline das regras de exibição do parcial vivo (ciclo 3)

Método rápido do laboratório: gravar UMA vez as hipóteses do worker numa rodada da bancada e testar offline dezenas de políticas de tela, sem rodar a bancada de novo. Só a finalista vai à medição longa.

## O que existe

| peça                                                     | arquivo                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Gravação das hipóteses no app (opt-in, só memória)       | `src/lib/captura/gravadorDeHipoteses.ts`, chamado em `pipelineDeFala.ts`           |
| Tela do parcial como função pura dos eventos             | `src/core/legendas/exibicaoDoParcial.ts` (`simularExibicao`)                       |
| Ligação eventos → falas do roteiro e arquivo da gravação | `scripts/perf/latencia-legenda/hipoteses-da-fala.mjs`                              |
| Gravar na bancada                                        | `bancada-captura.mjs --gravar-hipoteses` (e `medir.mjs` leva `window.__hipoteses`) |
| Simulador, placar e validação                            | `scripts/perf/latencia-legenda/simular-exibicao.mjs`                               |
| Testes (gravação sintética)                              | `tests/simularExibicao.test.ts`                                                    |

## 1. Gravar

A chave de laboratório `babel.lab.gravarHipoteses=1` (localStorage) só age com `parciais_vivos` + `parciais_parakeet` na rota do Parakeet (pt/es). Registra, por fala e em `window.__hipoteses`: cada token do `onUpdate`, cada decode completo (com `tIni` e a janela em ms), o instante em que a fala fechou e o texto final, tudo em `performance.now()`. Nada sai do navegador; o texto é o da fala de teste (FLEURS). A sonda da bancada lê a lista como lê `window.__lat`.

Com a chave ligada, o `onUpdate` passa a ser pedido ao worker mesmo nos modos que não pintam tokens (custo só de laboratório).

**Cadência da gravação: a mais rápida permitida.** A cadência de produção é `intervalo = clamp(custo do decode ÷ fração, 500 ms, 2 s)` com `fração = 0,5`. Com a chave ligada usa-se `CADENCIA_DE_GRAVACAO` = a mesma, com `fração = 1`: o intervalo vira `max(500 ms, custo do decode)`, o piso de 500 ms e o teto de CPU (0,6) de produção ficam, e o parcial continua sem enfileirar atrás de outro decode. A subamostragem x2/x3 do simulador representa então cadências 2 e 3 vezes mais lentas que a gravada. Consequência: a gravação NÃO tem a carga de produção; por isso a validação compara a simulação com a tela real da MESMA rodada, não com uma rodada de produção.

```
bancada-captura.mjs --alvos v7-pt=URL --flag-do-alvo "v7-pt=parciais_vivos,parciais_parakeet" \
  --armazenamento-do-alvo "v7-pt=babel.lab.parciaisModo:acrescenta-decode" \
  --fixture tests/fixtures/bancada-captura/fleurs-pt-16.json --eles pt-BR --eu pt-BR --qualidade accurate \
  --perfis desktop --rodadas 22 --sem-comparar --gravar-hipoteses
```

Saída em `<saida>/hipoteses/<rotulo>.json` (uma por rodada medida; o aquecimento não grava). Cada arquivo tem a política que estava ligada (`politicaGravada`, a partir das chaves do alvo), o relógio do arquivo de áudio (`ancoraMs`, `bipeS`), e por fala: roteiro com tempo por palavra, `eventos` e `reais` (os quadros do balão que a sonda viu).

## 2. Simular

```
node scripts/perf/latencia-legenda/simular-exibicao.mjs --gravacoes <saida>/hipoteses [--grupo v7-pt.desktop] \
  [--modos ...] [--mascaras 0,1,2,3] [--intervalos 0,125,250] [--subamostras 1,2,3] [--erasure-max 0.5] \
  [--top 15] [--json sim.json] [--md sim.md] [--validar]
```

Políticas: 5 modos (`cauda-token`, `cauda-decode`, `sem-cauda`, `acrescenta-decode`, `acrescenta-token`) × máscara 0 a 3 (só nos `acrescenta-*`) × limitador 0/125/250 ms × subamostra x1/x2/x3 = 99. Uma tabela por grupo de rodadas (rótulo sem o `.rN`).

Cada política usa as mesmas funções puras do app (`avancar`/`visualizar`, `vistaDoDecode`/`vistaDoToken`, `criarLimitadorDeParcial`) e a conta da bancada (`medidasDaFala` → `atrasoDePalavraMs`, `erasure`, `fimDaFalaAteOriginalMs`). Só a cola (a ordem em que o pipeline as chama) é espelhada em `simularExibicao`; é o que a validação confere.

**Placar (regras do dono):** só disputam as políticas com erasure média ≤ 0,5; entre elas, primária = atraso por palavra p50 (menor é melhor), depois p90 e erasure. As acima de 0,5 vêm depois, marcadas. Colunas extras: quadros por segundo de fala (proxy de renders: Σ quadros ÷ Σ duração da voz), hora do texto final (ms depois do fim da voz) e fim da voz → 1ª vez que o texto final aparece (p75, a guarda do final de +100 ms).

**O final não depende da política**: o final escreve direto na tela e cancela o limitador, então texto e hora são os mesmos em toda linha. O simulador confere (`finalIdentico`) e avisa alto se algum dia mudar. O que a política muda é só quando o texto final aparece pela primeira vez (um parcial que já o mostrava), a coluna `fim da voz → texto final visto`.

## 3. Validar contra a bancada real (etapa seguinte)

1. Gravar com `--gravar-hipoteses` na V7 (política gravada = `acrescenta-decode`, k2, 125 ms, x1) e rodar `simular-exibicao.mjs --gravacoes ... --validar`. A validação simula a política gravada sobre as hipóteses e compara com a tela real da mesma rodada (`reais`).
2. Limiares sugeridos (confirmar nessa etapa): sequência de textos igual em pelo menos 90% das falas; |Δ erasure| ≤ 0,05; |Δ atraso p50| ≤ 100 ms (resolução da bancada); deslocamento mediano da tela real sobre a simulada entre 0 e 100 ms (é o atraso fixo do timer e do quadro do navegador, que o simulador não modela).
3. Rodar a política finalista na bancada real (A/B pareado, como na V7) e conferir que o simulador acertou a ORDEM das políticas e a ordem de grandeza do ganho. Só a finalista vai à medição longa.
4. Se a validação ficar fora dos limiares, a causa mais provável é a cola do pipeline (ver `pipelineDeFala.ts`, trechos `aoAtualizar` e `.then` do parcial) ou o mapeamento fala ↔ `seq`; `divergentes` lista as falas.

## Limites do modelo

- Subamostrar só descarta decodes gravados; um decode que existiria numa cadência mais lenta mas em outra janela de áudio não existe aqui. O ganho de uma cadência mais lenta (menos CPU, final livre antes) não aparece; o atraso de uma cadência lenta aparece mais otimista do que seria.
- A fila do worker não é simulada: o final seria igual ou antes com menos decodes, nunca depois.
- O timer do limitador dispara no vencimento exato (na tela real há o atraso do `setTimeout` e do quadro).
- Uma voz FLEURS por idioma, desktop; erasure é proxy de piscar, não percepção.
