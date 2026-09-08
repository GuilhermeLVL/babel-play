# Design — onda 1: design e comunicação de volta

## As decisões, e o que cada uma custou

### 1. `rotaDeObtencao` mora em `lib/loja.ts`, não na tela

A branch escreveu os quatro caminhos de aquisição dentro de `Inventario.tsx`, em JSX, com um
`item.exclusivoDe ? … : item.precoCreditos ? … : item.precoSeeds ? … : …`. Funciona, e foi assim
que as duas réguas divergiram em dois pontos que dá para medir:

| O que o cadeado dizia (`estadoDoItem`) | O que a rota dizia (branch) |
|---|---|
| `Conquista: Foco impecável` (`lib/loja.ts:113-114` resolve em `CONQUISTAS`) | `Recompensa da conquista "foco_impecavel"` |
| `Nível 5 ou 140 Seeds` (`lib/loja.ts:125`) | `Custa 140 Seeds` |

O segundo é o pior dos dois: esconde o caminho de graça de quem só precisava estudar mais um pouco,
e empurra para a moeda.

A função foi para `lib/loja.ts` imediatamente abaixo de `origemDoItem`, com a **mesma ordem de
ramos** de `estadoDoItem` (exclusivo → créditos → nível/Seeds → nível), e um teste de contrato
compara as duas. O teste não compara strings — travaria a redação. Ele extrai do `motivo` do
cadeado todo par `número + unidade` e todo `Nível N`, e exige que apareçam na frase da rota. **A
rota pode dizer mais; nunca menos.**

A cor do cartão sai de `ORIGEM`, não de literal, porque `ORIGEM` já declara em `lib/loja.ts:187`
que "ORIGEM é a pergunta que a COR responde, em qualquer tela". A branch usava `bg-amber-400`,
`text-white` e `bg-premium` soltos.

### 2. O contador das categorias segue o acervo exibido, não a posse

Defeito da versão da branch, encontrado ao ler o código: o contador lateral continuava contando
`meus`, e a linha `if (n === 0 && c.id !== 'tudo') return null` escondia a categoria. Efeito: com
"catálogo completo" ligado, as categorias em que o usuário ainda não tem nada — que são exatamente
as que o catálogo completo existe para mostrar — ficavam invisíveis.

### 3. O estado vazio manteve a palavra "seu"

A branch trocou "Nada **seu** nesta categoria ainda" por "Nada nesta categoria ainda", justamente na
mudança que fez a tela mostrar as duas coisas. Com dois acervos na mesma grade, a frase sem "seu"
serve igualmente para "você não tem nada aqui" e para "não existe nada aqui", que são notícias
opostas. Ficaram as duas frases, uma por estado, e o link do estado vazio passou a ligar o catálogo
completo em vez de mandar para a Loja — a Loja não mostra o que não se compra.

### 4. Os shaders ficam para a Onda 3

O plano previa trazer as 6 famílias tipográficas E os 13 shaders de tela. As fontes vieram; os
shaders não. Motivo medido: `data-shader` só é escrito por `aplicarSuiteTematica`, que é da Onda 3.
Sem ela, os 130 linhas de CSS não têm um seletor que as alcance — e o portão `morto:arquivos` deste
repositório existe para barrar exatamente isso. Voltam com a suíte que as aplica.

### 5. Nenhuma fonte era selecionável, nem antes da branch

Achado que só apareceu ao procurar onde encaixar os itens novos: `CATALOGO_DA_LOJA` não tinha um
único item `tipo: 'fonte'`. `equipar.ts:38` já sabia equipar (`case 'fonte'`), `appearance.ts`
descrevia as opções, `index.css` tinha o bloco `[data-fonte="pixel"]` — e não havia nada no
catálogo para o inventário mostrar. A tipografia estava construída inteira e sem porta.

Os 8 itens entraram **nível 1 e de graça**, com o motivo escrito no catálogo: tipografia é
legibilidade, e legibilidade é direito, não recompensa — é a mesma classificação que
`coerencia-e-recompensa` já aplica a tamanho de texto e contraste.

### 6. O cabeçalho: o que voltou e o que não voltou

Voltou o rótulo escrito de cada moeda (o `title` exige mouse parado e não existe no toque), o fundo
na cor da própria moeda, a unidade na conta que falta ("faltam 1364 **XP**"), e o goal-gradient
(`proximaRecompensa`) — que responde "o que vem a seguir", enquanto o número respondia só "quanto
custa".

Não voltaram, e o motivo está escrito no cabeçalho do arquivo para não voltarem por engano:

- `carteira.creditos ?? 0` — "0 Créditos" enquanto a resposta não chegou. Zero é uma afirmação, e
  afirma o contrário do provável para quem comprou.
- O cartão de Créditos renderizando sempre, com "—", quando `carteira.disponivel` é falso. Em
  self-host e no modo sem conta essa moeda não existe; anunciá-la é oferecer o que não se entrega.
- `NÍVEL` cravado no crachá, no lugar de `palavraDeNivel()`. A função existe porque o perfil
  infantil chama a mesma coisa por outro nome.
- O gradiente `from-accent to-accent-hover`: **`accent-hover` não é token deste repositório**
  (`grep` em `index.css`: zero ocorrências). Renderizaria como um degradê para o nada.
- O ponto pulsante ao lado do nome da temporada: sinal de "ao vivo" para algo que não é ao vivo.

### 7. `ResumoDaRodada` inteiro para a Onda 3 — desvio do plano, com a medição

O plano dizia trazer "a parte de comunicação" (os chips de motivo do drop e o estado vazio com a
distância até o próximo) e deixar a mecânica para a Onda 3. A medição desfez a separação:

- `resultadoDrop.motivos` é o retorno de `registrarFimDePartida()` (`src/lib/drops.ts:138`);
- `statusDrop.partidasAteProximoDrop` é o retorno de `obterStatusDrop()` (`src/lib/drops.ts:83`);
- `src/lib/drops.ts` não existe em `main`, e a sua linha 16 importa o `creditarSeeds` cujo contrato
  a Onda 3 tem de reescrever;
- `ModalDropDePartida` mora em `src/components/views/gamificacao/`, diretório que não existe em `main`.

Não há chip para trazer sem o sistema que os produz. Trazer o estado vazio sozinho ("faltam 3
partidas para o próximo drop") anunciaria um sistema de drop que o build não tem — a definição de
controle falso que este repositório proíbe.

### 8. Uma dívida de `main` paga aqui

O gate `npm run i18n:orfas` estava **vermelho em `main`**, e a causa é do commit `1b702fe` desta
mesma rodada: ele apagou `OnboardingLeve.tsx` e deixou as quatro chaves de tradução daquela tela em
`public/i18n/en.json`. O `pseudo.mjs --check` não pega isso — ele verifica que o catálogo cobre o
código, não que não tem sobra. As quatro saíram, `xx.json` e `cobertura.json` foram regerados.

## O que ficou de fora da onda, em uma linha cada

| Item | Onda | Motivo |
|---|---|---|
| 13 shaders de tela | 3 | `data-shader` só é aplicado por `aplicarSuiteTematica` |
| 470 linhas de carta holográfica | 4 | nenhum seletor as usa; voltam com o componente |
| `ResumoDaRodada.tsx` | 3 | inseparável de `lib/drops.ts` |
| `src/App.tsx`, `index.html` | — | `git diff -w` vazio: é só reindentação |
| `SeletorDeEmojis.tsx` | — | a branch só REMOVEU a busca; `main` já é a versão boa |
