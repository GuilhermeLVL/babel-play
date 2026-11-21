# Protocolo do laboratório de latência da legenda

Passo a passo para medir a latência da legenda traduzida, comparar duas variantes (A/B) e gravar a linha de base. Vale para a
change `lab-medicao-legenda-traduzida` (design.md, "Protocolo do laboratório"). Todos os comandos rodam na raiz do repositório.

A métrica principal é `fimDaFalaAteLegendaMs`: o tempo do fim da voz até o primeiro quadro pintado com a tradução FINAL daquela
fala. Sempre se publica o p75 junto com a taxa de falha. Fala sem tradução e fala com falha ficam fora do percentil e são contadas.

## Regras que não se negociam

1. **Critério antes do número.** `criterio.md` é commitado ANTES da primeira rodada. `ab.mjs` recusa a comparação se ele não existe,
   não está no git, foi alterado depois do commit ou foi commitado depois da primeira rodada.
2. **Máquina livre.** Nada mais pesado rodando (suíte de testes, build, outro navegador). Rode `npm run limpar` antes e depois.
3. **Mesmas falas, mesmo aparelho, modelos em cache** (`--cache-modelos`), salvo quando a carga de modelo é o objeto do estudo.
4. **Pelo menos 10 rodadas VÁLIDAS por lado**, em ordem intercalada (A, B, A, B...). A rodada de aquecimento é descartada. Rodada
   inválida é refeita; nunca preenchida nem tirada da média.
5. **Emulado nunca aprova celular, Quest ou iPhone** (ver "Matriz de aparelhos").
6. **Sem áudio de usuário.** O áudio é o fixture versionado (FLEURS público).

## 1. Preparar as duas variantes

Cada variante é um `dist/` da edição estática, servido numa porta própria. A bancada recusa porta que já responde (outra worktree
poderia estar servindo o `dist/` dela).

Variante A de um commit antigo, em worktree temporária fora do repositório (reaproveita o `node_modules`, sem instalar nada):

```bash
T=$(mktemp -d)                                   # diretório de scratch
git worktree add --detach $T/a <commit-de-A>
git worktree add --detach $T/b <commit-de-B>
for w in a b; do ln -s "$PWD/node_modules" $T/$w/node_modules; (cd $T/$w && npm run build:estatica); done
(cd $T/a && node tests/e2e-estatica/_servidor-estatico.mjs 4182 &)
(cd $T/b && node tests/e2e-estatica/_servidor-estatico.mjs 4183 &)
```

Para comparar o trabalho em andamento contra um commit, faça B a partir de um `git worktree` do commit, nunca do diretório sujo:
o build herdaria alterações não commitadas e o relatório citaria um commit que não é o que foi medido.

Confira que a diferença entre A e B existe de verdade no build (ex.: `grep -l 'fala:fim' $T/a/dist/assets/*.js` vazio e `$T/b` com
resultado, quando o estudo é "com × sem as marcas").

## 2. Escrever e commitar o `criterio.md`

Pasta de resultados: `scripts/perf/latencia-legenda/resultados/AAAA-MM-DD/<assunto>/`. Modelo:

```markdown
# Critério do A/B — <assunto>

Escrito em <AAAA-MM-DDTHH:MM:SSZ>, ANTES de qualquer rodada.

## Hipótese

<uma frase: o que a variante B muda e o que se espera da latência>

## Variantes

- A = <commit/flag>, B = <commit/flag>; mesmo aparelho (<aparelho>, <navegador>), mesmo áudio, modelos em cache.
- 12 rodadas por lado intercaladas (A, B, A, B...); a de aquecimento é descartada.

## Métrica primária

`fimDaFalaAteLegendaMs`, p75, perfil <desktop|fraco>.

## Guardas

Tolerâncias de `slo-captura.json`: framesLongos.n50/n100/somaMs, cpuSilencio.processoPct, rendersPorS.\*, taxa de falha.
(WER e qualidade da bancada própria, memória de pico: liste as que valem para este estudo.)

## Efeito mínimo e regra de decisão

B melhor: IC 95% do p75 todo abaixo de 0 E efeito ≥ <N>% sobre o p75 de A E nenhuma guarda piora.
(Não inferioridade, quando o estudo é de custo: limite superior do IC 95% ≤ <N> ms.)
Se o IC cruza 0: "sem diferença provada"; a mudança não é aprovada por latência. O critério não muda depois de ver o número.
```

```bash
git add scripts/perf/latencia-legenda/resultados/AAAA-MM-DD/<assunto>/criterio.md
git commit -m "docs(lab): critério do A/B <assunto>"     # ANTES de rodar
```

## 3. Rodar as rodadas intercaladas

```bash
npm run limpar
node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop --rodadas 12 \
  --alvos antes=http://127.0.0.1:4182,depois=http://127.0.0.1:4183 \
  --saida <pasta-fora-do-git>/ab-<assunto> --sem-comparar
```

- Cada lado tem o seu perfil de navegador. A rodada `<lado>.<perfil>.aquecimento` vem primeiro e não conta.
- Sai `rodadas/<lado>.<perfil>.rN.json` (brutas), `metricas/` (por rodada) e `resultado-<lado>.json` (mediana por perfil).
- Uma rodada inválida mostra o motivo (`sem-sonda`, `sem-audio`, `sem-2khz`, `bipe-antes-da-sonda`, `a aba caiu`). Se sobrarem menos
  de 10 válidas por lado, rode mais; não complete com rodada antiga.
- `--perfis desktop,fraco` mede também o notebook de entrada EMULADO (CPU 4× mais lenta, 2 núcleos, 2 GB, sem WebGPU).
- `intercalar.mjs` é o executor da matriz antiga da auditoria de 2026-09 (Windows, `$TEMP`, `conversa_*_12`); para o laboratório
  atual use `bancada-captura.mjs --alvos`, que faz a mesma intercalação com o fixture versionado.

## 4. A diferença pareada

```bash
node scripts/perf/latencia-legenda/ab.mjs --rodadas <saida>/rodadas --a antes.desktop --b depois.desktop \
  --criterio scripts/perf/latencia-legenda/resultados/AAAA-MM-DD/<assunto>/criterio.md \
  [--efeito-minimo-pct 20 | --nao-inferioridade-ms 5] --json <saida>/ab.json
```

- O par é a MESMA fala em A e em B; 10 000 reamostragens, semente fixa (o IC é reproduzível).
- Imprime p50/p75/p95 de A e B, a diferença B − A com IC 95%, a taxa de falha dos dois lados, as guardas e a decisão sobre o p75:
  `B melhor`, `B pior`, `sem diferença provada` (ou `sem custo provado` / `custo não descartado` na não inferioridade).
- Código de saída 1 e nenhum número quando: menos de 10 rodadas válidas num lado, `criterio.md` ausente, fora do git, alterado depois
  do commit ou commitado depois da primeira rodada.
- `--ensaio` aceita um `criterio.md` ainda não commitado e imprime que o resultado NÃO vale como decisão. Serve para ensaiar o
  protocolo; nunca para aprovar uma mudança.

## 5. Linha de base

A base é do ambiente (`local-darwin`, `local-win32`, `ci-ubuntu`): só vale na mesma máquina. Rodada de base:

```bash
npm run build:estatica
node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop,fraco --rodadas 12 \
  --saida <pasta-fora-do-git>/base --gravar-linha-de-base
```

Isso reescreve `scripts/perf/latencia-legenda/slo-captura.json` do ambiente atual, com `origens.<perfil>` = `origem`
(`medido`/`emulado`), `aparelho`, `commit` e `data`. Exija ≥ 10 rodadas válidas por perfil (`resultado.json`, campo `rodadas`). Quem
commita a base é quem a aprova. Para conferir uma rodada contra ela:

```bash
node scripts/perf/latencia-legenda/comparar.mjs --resultado <saida>/resultado.json --ambiente local-darwin
```

Sai com código 1 quando uma métrica passa de `base × (1 + tolerância) + folga`, e recusa (código 1) resultado com rodada inválida.
`validarSlo` exige `origem` para todo perfil.

## 6. Erro do marcador de campo (VAD)

O marcador de campo (`frasy:fala:fim`) só pode ser chamado de "fim da fala → legenda" se, em 3 rodadas válidas, o erro dele contra o
fim da voz no arquivo tiver mediana e p95 ≤ 50 ms (valor absoluto). Acima disso o relatório declara "VAD → tela".

```bash
node scripts/perf/latencia-legenda/analisar.mjs <saida>/rodadas/desktop.r1.json <saida>/rodadas/desktop.r2.json <saida>/rodadas/desktop.r3.json
```

A linha `erro do marcador` traz mediana e p95 do valor absoluto. O "fim da voz no arquivo" do roteiro é o último quadro de 20 ms com RMS
≥ 0,03 (`montar-audio.mjs`); o `vozFim` antigo do fixture incluía uma cauda de ruído de até 0,8 s.

## 7. Tempo de carga por modelo

Download, compilação e aquecimento saem das marcas `frasy:modelo:*`. Uma rodada de `medir.mjs` por configuração, com o perfil de
navegador NOVO (cache frio, sem `--cache-modelos`: o download vem da rede) e de novo com o MESMO perfil (cache quente). O roteiro de
áudio é `<saida-de-qualquer-rodada-da-bancada>/audio/bancada_en.json` (ou `montar-audio.mjs --idioma en --n 8 --fixture
tests/fixtures/bancada-captura/fleurs-en-8.json --silencio-inicial 4 --silencio-final 20 --nome bancada_en --saida <dir>`).

```bash
for fase in frio quente; do
  node scripts/perf/latencia-legenda/medir.mjs --rotulo <cfg>.$fase --perfil <dir-do-perfil> --audio <roteiro.json> \
    --url http://127.0.0.1:4183 --saida <saida>/rodadas --headless --canal chromium --teto 400 --retratos 0 --espera-extra 2 <config>
done
node scripts/perf/latencia-legenda/carga-de-modelos.mjs <saida>/rodadas/<cfg>.frio.json <saida>/rodadas/<cfg>.quente.json
```

| Modelos                  | `<config>`                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- |
| Moonshine base + opus-mt | `--modo sistema --eles en-US --eu pt-BR`                                         |
| Whisper tiny + Bergamot  | `--modo mic --eu pt-BR --eles en-US --qualidade fast --sem-webgpu --device wasm` |
| Whisper base + Bergamot  | `--modo mic --eu pt-BR --eles en-US --sem-webgpu --device wasm`                  |
| Parakeet                 | `--modo mic --eu pt-BR --eles pt-BR --qualidade accurate --sem-webgpu`           |

A tabela sai por modelo (id do registro) com as três fases. O MT carrega no 1º pedido de tradução, depois do 1º fim de fala.

## 8. Matriz de aparelhos

| Linha                      | Classe (`src/lib/dispositivo/perfil.ts`) | Aparelho                                             | Navegador                       | Origem                |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------- | --------------------- |
| Desktop sem GPU            | `desktop-sem-gpu`                        | este Mac (`local-darwin`)                            | Chromium headless do Playwright | `medido`              |
| Desktop com GPU            | `desktop-com-gpu`                        | a medir (headful, com WebGPU)                        | Chrome                          | `medido` quando rodar |
| Notebook de entrada        | `desktop-sem-gpu` (perfil `fraco`)       | Mac com CPU 4×, 2 núcleos, 2 GB                      | Chromium headless               | `emulado`             |
| Android de entrada (~4 GB) | `celular-fraco`                          | emulado (`_dispositivos.mjs`) até existir o aparelho | Chrome Android                  | `emulado`             |
| iPhone ≥ 12                | `celular-bom`                            | emulado até existir o aparelho                       | Safari                          | `emulado`             |
| Quest 3                    | `quest`                                  | emulado até existir o aparelho                       | Navegador do Quest              | `emulado`             |

Regra do "emulado": CPU e memória limitadas por software servem para achar regressões e ordenar opções. NUNCA para aprovar ganho de
celular, Quest ou iPhone, nem para dar a meta de 2,0 s como cumprida. Toda linha sem aparelho real fica marcada `emulado`, e a meta
de celular só se declara cumprida com `origem: medido`.

## 9. Relatório

`docs/auditoria/AAAA-MM-DD-<assunto>.md`, com: comando, commits de A e B, aparelho, `origem`, N de rodadas válidas por lado, a
tabela do `ab.mjs`, as guardas, a decisão e o caminho do `criterio.md`. Dados brutos em
`scripts/perf/latencia-legenda/resultados/AAAA-MM-DD/<assunto>/` (só o que embasa uma decisão; exploração fica fora do git).

## 10. Limpeza

```bash
git worktree remove --force $T/a; git worktree remove --force $T/b      # as worktrees temporárias
npm run limpar                                                          # servidores e navegadores órfãos
```

## Limites conhecidos

- A/B de latência com 12 rodadas e as 8 falas do fixture separa diferenças da ordem de 100 ms no p75 (a fala 6 do fixture é bimodal por
  corrida real do app). Uma regra de "≤ 5 ms" não se prova aqui (`2026-11-21-overhead-das-marcas.md`): escreva no `criterio.md` uma margem
  que a bancada consiga provar, ou use uma medida dedicada.
- O marcador de campo (VAD) fecha a fala ~300 ms antes do fim da energia em parte das falas: o campo mede "VAD → tela"
  (`2026-11-21-linha-de-base-da-legenda.md`).
- O Chromium headless não expõe memória do processo: `memoriaPicoMb` fica sem base.
- Ensaio do protocolo (6.2): feito em 21/11/2026 com o A/B de overhead das marcas; os passos 1, 3 e 4 saíram como descritos. O passo 2
  (commit do critério) ficou com o dono, por isso `--ensaio`.
