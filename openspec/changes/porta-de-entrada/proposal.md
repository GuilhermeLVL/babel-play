## Why

O produto quer que o primeiro acesso seja **sem login, com limitações** — e hoje é o contrário do
que o código faz.

**A porta está invertida.** `porta()` (`components/conta/exigeConta.ts:36-41`) devolve `login`
quando não há sessão e o anônimo ainda não foi aceito: **o primeiro acesso mostra a tela de Login
antes do app**, e usar sem conta exige achar o botão "Continuar sem conta". O padrão de mercado em
2026 é o oposto — experimentar antes de criar conta, e pedir a conta no momento em que a pessoa
**tem algo a perder**.

**As limitações decididas não existem.** O dono escolheu quatro: nada fica na nuvem · teto de
acervo · sem loja/passe/economia · sem nuvem paga. Hoje só a primeira e a quarta valem, e por
consequência da arquitetura (o servidor efêmero é IndexedDB e não sai para a rede), não por
decisão: `EXIGE_CONTA` (`exigeConta.ts:10`) gateia seis views e **a Loja não está entre elas**, e
não existe teto nenhum de acervo.

**O login social está pronto e desligado por constante.** `Login.tsx:24` — `SOCIAL_ENABLED = false`,
com os handlers escritos e `src/lib/auth.ts:45` aceitando `'google' | 'facebook'`.

**Não existe aviso por marco de uso.** O convite aparece **uma vez por visita**
(`sessionStorage 'babel.convite_visto'`, `App.tsx:165,174`) e só é disparado por 7 padrões de ação
que pedem rede (`efemero/servidor.ts:51-55`). Depois disso, silêncio: quem gravou dez sessões e
fichou cem palavras sem conta nunca ouve que vai perder tudo ao trocar de navegador.

## What Changes

- **A porta se inverte**: sem sessão e sem escolha registrada, o app abre no APP. O Login continua
  existindo, alcançável pelo menu, pelo gate e pelos avisos — deixa de ser pedágio.
- **O teto de acervo** passa a existir no servidor efêmero, com aviso ao se APROXIMAR, não ao bater.
- **A economia exige conta**, e o recorte é por ABA, não por view: `Loja`, `Passe` e `Desafios`
  pedem conta; **`Meu visual` e o perfil de exibição continuam livres**. Gatear a view inteira
  trancaria a acessibilidade junto — e o perfil de exibição é um direito declarado no código
  (ux-v2 §4.4), não um cosmético.
- **Google ligado**, ao lado de e-mail e senha.
- **Avisos por marco de uso**: na segunda sessão salva e ao chegar perto do teto do caderno, com o
  argumento do que se perde — nunca bloqueando.

## Non-Goals

- Telas de verificar e-mail, desafio 2FA no login e sessões ativas
  (`docs/auth/auth-flow-design.md:60-69`): dependem de configurar o Supabase, que é infra do dono.
- Migrar rodadas, recordes, presenças e créditos de conquista (`migracao.ts:12-14`): cada um precisa
  de chave de idempotência própria no servidor. Fica registrado como a dívida que é.
- Facebook e Apple: a arquitetura aceita, e é decisão de quando.
