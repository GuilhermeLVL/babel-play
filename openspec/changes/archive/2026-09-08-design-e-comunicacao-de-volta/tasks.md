# Tarefas — onda 1

## 1. Tipografia que existe de verdade

- [x] 1.1 Seis famílias novas no `@import` de `src/index.css` (Merriweather, JetBrains Mono,
      Orbitron, Rajdhani, Nunito, Caveat), cada stack terminando em fonte de sistema
- [x] 1.2 Blocos `[data-fonte="serif"|"mono"|"cyber"|"rounded"|"handwriting"|"display"]`
- [x] 1.3 `FonteType` de 2 para 8 valores e `FONTE_OPTIONS` com `previewText`, com a cópia
      corrigida: a branch citava Garamond, Kalam, Bebas Neue e Archivo Black, nenhuma carregada
- [x] 1.4 `coerceFonte` valida contra `FONTE_OPTIONS` (validava só `'pixel'`: as outras seis
      voltavam ao padrão no boot seguinte)
- [x] 1.5 Oito itens `tipo: 'fonte'` no catálogo — não existia nenhum, então nenhuma fonte era
      selecionável. Nível 1, de graça, com o motivo escrito no catálogo

## 2. O inventário responde "como eu consigo isto?"

- [x] 2.1 `rotaDeObtencao` + `DestinoDeObtencao` em `src/lib/loja.ts`, ramificando na ordem de
      `estadoDoItem`
- [x] 2.2 `tests/contratos/rota-de-obtencao.test.ts`: a rota contém todo número e todo nome que o
      cadeado cita; o destino corresponde ao canal; o comparador tem auto-verificação
- [x] 2.3 Grade com dois estados ("meu acervo" / "tudo que existe"), os possuídos primeiro
- [x] 2.4 Contador das categorias segue o acervo exibido (a versão da branch escondia as
      categorias em que o usuário não tem nada, no modo em que elas mais importam)
- [x] 2.5 Cadeado e opacidade na peça trancada; duplo-clique não equipa o que não é seu
- [x] 2.6 Cartão de rota no painel lateral, cor de `ORIGEM`, com CTA para o destino
- [x] 2.7 Estado vazio mantém "Nada **seu**" e passa a ligar o catálogo em vez de ir à Loja
- [x] 2.8 `onIrParaPasse` / `onIrParaConquistas` atravessam `Personalizar` e são ligados em `Loja`
- [x] 2.9 Cabeçalho de documentação do componente atualizado com a decisão e o defeito que ela cura

## 3. Cabeçalho de temporada

- [x] 3.1 Rótulo escrito de cada moeda, fundo na cor da própria moeda
- [x] 3.2 Goal-gradient com `proximaRecompensa`, condicional (some no topo da curva)
- [x] 3.3 Unidade na conta que falta ("faltam N XP")
- [x] 3.4 Reverter `?? 0`: volta a `'—'` enquanto a carteira não respondeu
- [x] 3.5 Reverter o cartão de Créditos sempre renderizado: fora quando `!carteira.disponivel`
- [x] 3.6 Manter `palavraDeNivel()` no lugar do "NÍVEL" cravado
- [x] 3.7 Não trazer `to-accent-hover` (token inexistente) nem o ponto pulsante
- [x] 3.8 Restaurar o cabeçalho de documentação apagado, com as duas reversões escritas

## 4. Conquistas

- [x] 4.1 Tabela de ganhos vira grade de cartões (a tabela escondia a coluna LIMITE abaixo de `sm:`)
- [x] 4.2 Manter o comentário do invariante: gerado de `REGRAS`, nunca redigido à mão
- [x] 4.3 Regra sem Seeds não ganha ficha vazia — a ausência é a informação

## 5. Dívida de `main` paga junto

- [x] 5.1 Quatro chaves de `OnboardingLeve` saem de `en.json` (resíduo de `1b702fe`)
- [x] 5.2 `xx.json` e `cobertura.json` regerados; `i18n:orfas` volta a sair 0

## 6. Portões

- [x] 6.1 `npm run typecheck` e `typecheck:core`
- [x] 6.2 `rtk proxy npm run lint` — 0 avisos
- [x] 6.3 `npx vitest run` — 3.107 testes
- [x] 6.4 `morto:arquivos` e `morto:ciclos`
- [x] 6.5 i18n: `pseudo --check`, `i18n:orfas`, `cobertura --check`, piso 420
- [x] 6.6 `audit:gate`, `workflows:validar`, `npm run build`
- [x] 6.7 e2e por JSON — 21/21, com `tests/e2e/rota-de-aquisicao.e2e.ts` novo
- [x] 6.8 Passada manual no navegador (Chrome DevTools), que achou o que os testes não veem:
      a família "Impacto" declarava a MESMA pilha do padrão e escolher a opção não mudava um
      pixel; a pilha ainda citava 'Bebas Neue', que não está no `@import` nem é fonte de sistema.
      Corrigido para caixa alta no peso máximo, com teste de contrato prendendo as duas cópias
      da descrição (`src/lib/appearance.ts` e `src/core/loja.ts`)
