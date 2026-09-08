# Design e comunicação de volta

## Por quê

A branch `gamificacao-v2-wip` (commit `0ac344d`, saída de `976af2c`) guarda ~15.000 linhas de
produto que nunca foram commitadas. Na rodada anterior ela foi arquivada para auditar o resto sobre
terreno firme; o dono corrigiu a decisão em 08/09: **o conteúdo dela tem valor e precisa passar pela
mesma régua do resto, não ficar de fora dela.**

Esta é a primeira das seis ondas de volta, e pega a parte que o dono citou primeiro — design e
comunicação. É também a de menor risco: `main` não tocou em nenhum dos arquivos desta onda desde a
base comum, então não há conflito textual em lugar nenhum.

O que a auditoria da branch (`openspec/audits/2026-09-08-gamificacao.md`) mediu e esta onda resolve:

| Achado | O que estava errado |
|---|---|
| G02 | O app tem 8 famílias tipográficas declaradas em `appearance.ts` e o `@import` do CSS carregava 2 |
| G03 | `coerceFonte` validava só `'pixel'`: as outras seis voltavam ao padrão no próximo boot |
| G04 | **Nenhum item `tipo: 'fonte'` existia no catálogo** — nenhuma fonte era selecionável, nem a pixel |
| G26 | O cartão de Créditos afirmava "0" enquanto a carteira carregava |
| G27 | O cartão de Créditos passava a renderizar sempre, anunciando moeda que o self-host não tem |
| G28 | A busca do seletor de emojis foi removida justamente quando o acervo subiu para 18 categorias |
| G31 | A rota de aquisição mostrava o ID da conquista onde o cadeado já mostrava o nome |

E o defeito que esta onda existe para consertar, que não é da branch e sim da tela de `main`:

> **O inventário respondia "o que é meu" e mais nada.** Uma peça que ainda não fosse sua não
> aparecia nesta tela; e as de conquista e as de nível não apareciam em tela NENHUMA antes de serem
> obtidas, porque a Loja lista o que se compra e essas duas não se compram. A pergunta "como eu
> consigo isto?" não tinha onde ser feita.

## O que muda

- **Seis famílias tipográficas passam a existir de verdade** — carregadas no `@import`, com stack
  completo terminando em fonte de sistema, com o `data-fonte` correspondente, validadas por
  `coerceFonte`, e com item de catálogo para poderem ser escolhidas. Todas nível 1 e de graça:
  tipografia é legibilidade, não recompensa.
- **O inventário ganha o acervo inteiro e a rota de aquisição.** Dois estados na grade ("meu
  acervo" / "tudo que existe"), cadeado na peça que não é sua, e um cartão que diz o canal, o que
  falta e leva à tela que entrega.
- **`rotaDeObtencao` nasce em `lib/loja.ts`, ao lado de `estadoDoItem`**, e um teste de contrato
  prende as duas: a rota pode dizer mais que o cadeado, nunca menos.
- **O cabeçalho de temporada escreve o nome da moeda** em vez de escondê-lo num `title`, e a barra
  de nível passa a dizer o que vem a seguir (goal-gradient), quando há um a seguir.
- **A tabela de ganhos das Conquistas vira grade de cartões** — a tabela escondia a coluna LIMITE
  abaixo de `sm:`, que é a única que responde "até quando isso rende".
- **Quatro chaves órfãs saem de `en.json`.** Resíduo do commit `1b702fe` (fim da edição leve), que
  apagou `OnboardingLeve.tsx` sem podar as chaves — o gate `i18n:orfas` estava vermelho em `main`.

## O que NÃO entra, e por quê

- **`src/App.tsx` e `index.html`**: a diferença da branch é 100% reindentação (`git diff -w` sai
  vazio). Não há nada a preservar.
- **Os 13 shaders de tela** (`index.css:2204-2333` da branch): `data-shader` só é aplicado por
  `aplicarSuiteTematica`, que chega na Onda 3. Trazer agora seriam 130 linhas de CSS que nenhum
  seletor alcança — exatamente o que o portão `morto:arquivos` deste repositório existe para barrar.
  Vão com a suíte que as aplica.
- **As 470 linhas de CSS de carta holográfica** (`:2536-3005`): mesma razão, e elas voltam na
  Onda 4, com o componente que as consome.
- **`SeletorDeEmojis.tsx`**: medido, e a única mudança da branch neste arquivo é a REMOÇÃO da busca
  (9 inserções, 17 remoções, todas do mesmo bloco). Não há nada a trazer; a versão de `main` fica
  como está, que já é a versão com busca.
- **`ResumoDaRodada.tsx`**: adiado inteiro para a Onda 3. O plano previa separar "a comunicação" da
  "mecânica de drop", e a medição mostrou que não dá: os chips de motivo vêm de
  `registrarFimDePartida().motivos` e a contagem vem de `obterStatusDrop().partidasAteProximoDrop`,
  as duas de `src/lib/drops.ts` — arquivo que não existe em `main` e cujo `creditarSeeds` é
  justamente o que a Onda 3 tem de reescrever. Trazer só os chips seria anunciar um sistema de drop
  que o build não tem.

## Impacto

- Specs: `comunicacao-de-obtencao` (nova), `fonte-ciclica` (MODIFICADA).
- Código: `src/index.css`, `src/lib/appearance.ts`, `src/lib/theme.ts`, `src/lib/loja.ts`,
  `src/core/loja.ts`, `src/components/views/personalizar/Inventario.tsx`,
  `src/components/views/Personalizar.tsx`, `src/components/views/Loja.tsx`,
  `src/components/views/loja/CabecalhoDeTemporada.tsx`, `src/components/views/Conquistas.tsx`.
- Catálogos: `public/i18n/en.json`, `public/i18n/xx.json`, `src/data/i18n/cobertura.json`.
- Testes novos: `tests/contratos/rota-de-obtencao.test.ts`, `tests/e2e/rota-de-aquisicao.e2e.ts`.
- Sem migração, sem mudança de contrato de API, sem efeito em dado gravado.
