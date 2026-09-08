# A porta de entrada da tela de Personalizar

## Por quê

Onda 2 de seis. O dono pediu, em 08/09, que as duas organizações da tela fossem montadas e vistas
em tela antes de uma ser escolhida — e delegou a escolha ("você decide vendo as duas").

Foram montadas as duas, atrás de uma chave temporária de bancada, e comparadas no navegador. A
chave saiu junto com a decisão.

## O que foi medido antes de decidir

A branch `gamificacao-v2-wip` tem **três** organizações, não duas, e a diferença entre elas não é
estética:

| Organização | Portas | Superfícies alcançáveis |
|---|---|---|
| `main`, quatro abas | Passe · Meu visual · Loja · Desafios | 4 de 4 |
| branch, modo `legado` | Recompensas (Passe + Desafios em sub-abas) · Loja · Meu Estilo | 4 de 4, em 3 portas |
| branch, modo `pro` (o padrão) | Vestiário · Relíquias do Cofre | **2 de 4** |

O modo `pro` é o que `Loja.tsx:151` da branch fixa em `useState<'pro' \| 'legado'>('pro')`, e
`setModoVisual` não é chamado em lugar nenhum. Ou seja: **a única organização alcançável da branch
não tem porta para o Passe nem para a Loja** — some a única superfície em que Seeds e Créditos são
gastos. Isso não é uma arrumação a ser comparada; é a perda de metade da tela.

## A decisão

**Ficam as quatro portas.** Os três pilares tiram Desafios da barra de cima e o põem a dois
cliques, atrás de uma segunda fita de abas empilhada sob a primeira. Trocar largura por
profundidade só compensa quando a barra está cheia, e quatro não enche barra nenhuma — enquanto o
achado que abriu esta rodada inteira é sobre superfícies difíceis de alcançar. O rótulo do pilar
também mentia por omissão: "Recompensas · 3" carimbava a porta inteira com a contagem de metade
dela.

**O que os pilares acertaram veio junto.** Eles agrupavam por VERBO — o que se ganha, o que se
compra, o que se usa — e a barra antiga misturava os três. A nova ordem lê **uso · compra · ganho ·
ganho**: `Meu visual · Loja · Passe · Desafios`. O padrão da tela passa a ser a primeira aba, que é
onde se espera achar a aba em que a tela abre, e as duas superfícies de recompensa ficam vizinhas
sem que nenhuma perca a porta própria.

## O que muda

- A ordem das quatro abas, com o motivo escrito na própria barra.
- `tests/e2e/quatro-superficies-alcancaveis.e2e.ts`: quatro invariantes — cada URL abre a sua
  superfície, cada superfície tem aba própria, a ordem é a decidida, e dá para ir de qualquer uma
  a qualquer outra.
- O conteúdo do Passe e o dos Desafios passam a ser montados uma vez só (`conteudoDoPasse`,
  `conteudoDosDesafios`), em vez de inline nos painéis.
- A chave temporária `src/lib/organizacaoDaLoja.ts` existiu durante a comparação e **foi removida
  junto com a decisão** — é a condição que ela mesma declarava. Uma chave que sobrevive à decisão
  que a justificava vira exatamente o `modoVisual` fixo que a auditoria encontrou.

## Impacto

- Spec `posse-uma-regua`: duas requirements novas e uma modificada.
- Código: `src/components/views/Loja.tsx`.
- Teste novo: `tests/e2e/quatro-superficies-alcancaveis.e2e.ts`.
- Sem migração, sem mudança de rota, sem efeito em dado gravado.
