# Critério do A/B de confirmação (2ª tentativa, 24/11): primeiro texto na tela, guarda do final em +100 ms

Escrito e commitado ANTES de qualquer rodada desta execução. Substitui, para esta execução, o critério de 23/11
(`../../2026-11-23/primeiro-texto-confirmacao/criterio.md`), do qual só muda: a data, o fato de rodar só no desktop, as 12 rodadas
válidas também em C2 e o pré-voo. O veredito do A/B de 23/11 (REPROVADO pela guarda 1 com teto de +30 ms) FICA como está.
Os dados de 23/11 não entram nesta decisão (C2 teve só 9 rodadas válidas: a tampa do Mac fechou e ele dormiu).

## Decisão do dono (aplicada)

Teto da guarda do final = **+100 ms**, a resolução da bancada (decisão de 22/11 na V7). Definido antes de ver qualquer dado; não muda depois.

## Variantes (iguais ao critério anterior)

- `antes`: `a4396d3a^` (= `22f1260c`), `npm run build:estatica`, servida em 127.0.0.1:4182.
- `depois`: `a4396d3a` + docs/lab posteriores (só `src/lib/captura/fontesDeAudio.ts` e `tiposDaFala.ts` diferem de `antes` em `src/`), build em 127.0.0.1:4183.
- Modelos em cache, rodadas INTERCALADAS (`bancada-captura.mjs --alvos`), aquecimento descartado, nenhuma flag de laboratório nos dois braços.
- **Só perfil `desktop`** (Chromium headless; o fraco emulado já mostrou não-regressão em 23/11 e não é repetido). Não vale para celular real.
- **12 rodadas VÁLIDAS por braço e cenário.** Rodada inválida é refeita com rodadas extras intercaladas dos dois braços; nunca se completa com dado de outra execução.

## Fixtures (declaradas antes)

- **C1, `fleurs-en-8`** (en-US -> pt-BR, padrão da bancada, 8 falas): mede a PRIMÁRIA.
- **C2, `fleurs-pt-16`** (pt-BR -> pt-BR, `--qualidade accurate`, sem tradução, 16 falas, rota Parakeet): mede a GUARDA 1 DECISIVA.

## Métrica primária (C1, desktop)

`primeiroTextoNaTelaMs`: mediana das rodadas válidas por braço; `depois - antes` com IC 95% por bootstrap das rodadas
(`ab-primeiro-texto.mjs`, 10 000 reamostragens, semente 20261123). `depois melhor` só se o IC fica inteiro abaixo de 0 E o efeito é >= 20% da
mediana de `antes`; `depois pior` se o IC fica inteiro acima de 0; senão `sem diferença provada`. Informativo: fração de rodadas >= 2,5 s; mesma métrica em C2.

## Guardas (qualquer uma que falhe reprova `depois`)

1. **Final p75**: limite superior do IC 95% de `depois - antes` **<= +100 ms**. Decisiva em C2, sobre `fimDaFalaAteOriginalMs`
   (`ab-parciais.mjs`, `compararParciais().fimDoOriginal`, `--teto-final-ms 100`, bootstrap pareado por fala, 10 000 reamostragens, semente padrão).
   Em C1 é informativa, ao lado, sobre `fimDaFalaAteLegendaMs` p75 (`ab.mjs`).
2. **SLO da bancada**: `comparar.mjs --ambiente local-darwin` sobre o resultado de `depois` (C1) não reprova.
3. **Taxa de falha de legenda** de `depois` <= a de `antes` (C1 e C2).

## Decisão

APROVADO = primária (C1) `depois melhor` E guardas 1 (C2), 2 e 3 passam. REPROVADO = alguma guarda falha ou primária `depois pior`.
SEM DIFERENÇA PROVADA = demais casos. Nenhum limiar muda depois de ver o número.

## Pré-voo (obrigatório) e execução

Tampa aberta (`ioreg` `AppleClamshellState = No`), na tomada, porta diferente de 3100, e TODA a execução, inclusive a espera, sob
`caffeinate -dimsu -- <comando>`. Uma rodada de fumaça por braço antes do lote; vigiar as 2 primeiras rodadas; inválida: parar e diagnosticar.
