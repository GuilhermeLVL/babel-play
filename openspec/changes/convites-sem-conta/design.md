## Context

- **Portão de tela**: `EXIGE_CONTA`/`exigeConta()` e os textos `CONVITE` (`src/components/conta/exigeConta.ts`); o App monta o
  `CartaoDeConvite` no lugar da tela.
- **Modal**: `GateDeConta`, aberto pelo evento `babel_exige_conta`. O servidor em memória dispara para `ACOES_QUE_CONVIDAM`
  (`src/data/efemero/nucleo.ts`); `useGateDeConta` ignorava tudo depois do primeiro fechamento (`babel.convite_visto`).
- **Porta**: `navigateTo('login')` → `setPedindoLogin(true)` → `porta()` mostra o Login, sempre em "Entrar". A volta ao destino
  já existia (`lembrarDeOndeVeio` / `consumirIntencao`).
- **Identidade**: o convidado anônimo do Supabase continua `anonimo` (`useSessaoSupabase`), então `estaAnonimo()` cobre os dois.

## Decisions

1. **Eventos, não props.** `pedirConta(origem)` e `pedirEntrada(modo)` (`src/lib/pedirConta.ts`) disparam eventos que
   `useGateDeConta` escuta. Ajustes, Cartões, iChat e o leitor ficam longe do App; passar props por quatro níveis seria
   mais código e mais lugar para errar.
2. **`explicito: true` no detalhe** distingue o toque da pessoa do aviso automático. O automático segue 1x por visita.
3. **`pedindoLogin: false | 'login' | 'signup'`**, e `setPedindoLogin(true)` continua valendo (vira `'login'`): nenhum
   chamador antigo muda. `navigateTo('login', { modo: 'signup' })` serve a quem tem `onChangeView`.
4. **`comConta(origem, acao)`** troca o clique por `pedirConta` quando `estaAnonimo()`; o iChat, que pode ter nuvem de
   convidado, usa o caminho de sempre e convida só quando a resposta é `EXIGE_CONTA`.
5. **`semContaComPorta()`** = `estaAnonimo() && !edicaoEstatica()`: a edição estática também é `anonimo`, mas não tem conta a
   oferecer; ela mantém os textos "sem login" de antes.
6. **`conviteNoLugarDaTela(view, anonimo)`** é a única condição do App para o convite e para as telas que exigem conta.
7. **Sessões locais no Início, não na Biblioteca**: a Biblioteca e a Análise dependem do servidor; o Início já lista as
   recentes. O toque abre Jogar com a sessão (o mesmo destino de quem acabou de gravar sem conta).
8. **Apagar os dados deste navegador** recarrega a página depois de `limparTudo()`, para nenhuma tela seguir mostrando o
   que já não existe.

## Risks / Trade-offs

- Dois eventos para o mesmo toque (o automático e o explícito) quando o servidor em memória responde: o estado do modal é o
  mesmo motivo, então não pisca.
- O inventário de telas (`tests/convites-sem-conta.test.tsx`) confere a regra e o código do App, sem montar o App inteiro
  (montá-lo em jsdom puxaria todas as telas preguiçosas).
