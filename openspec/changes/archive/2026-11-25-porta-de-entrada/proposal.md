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
  (`docs/historico/auth-flow-design.md:60-69`): dependem de configurar o Supabase, que é infra do dono.
- Migrar rodadas, recordes, presenças e créditos de conquista (`migracao.ts:12-14`): cada um precisa
  de chave de idempotência própria no servidor. Fica registrado como a dívida que é.
- Facebook e Apple: a arquitetura aceita, e é decisão de quando.

## Revisão de 25/11/2026

- **Estado**: as seções 1, 4 e 5 e quase tudo das 2 e 3 estão feitas e na main (porta que abre no app, teto 5/80 na completa e 20 na estática, avisos por marco, Google ligado em `Login.tsx`). Abertas de verdade: 2.4 (só o 507 de palavras; o de sessões já tem teste), 3.3 (reescrita: a função `abaExigeConta` não existe mais, e a aba livre é a Coleção) e 6.2 (conferência no navegador). O que ficou VELHO: a `acesso-sem-conta-v2` (arquivada em 23/11) criou a porta obrigatória atrás da flag `acesso_restrito_sem_conta` (desligada); esta change descreve o comportamento com a flag DESLIGADA, que continua valendo como padrão, e a conferência 6.2 se funde com a 6.1 daquela. O "Non-Goals" sobre verificar e-mail/2FA segue valendo. Os PRs #201, #202, #205 e #206 não tocam a porta.
- **Esforço**: P (cerca de meio dia: 1 teste de servidor efêmero, 1 teste de componente, 1 roteiro manual).
- **Valor para quem usa**: médio (já entregue; falta prova e regressão).
- **Dependências**: `acesso-sem-conta-v2` 6.1 e 6.2 (rampa, do dono) decidem se a porta obrigatória substitui esta; sem conflito de arquivo com as outras cinco changes. Depois de fechar 2.4, 3.3 e 6.2, o spec `conta` deve ser sincronizado com `openspec/specs/modo-anonimo/spec.md` (já tem teto e convites) e a change arquivada.
- **Decisões do dono**:
  1. O que fazer com esta change: (A) fechar 2.4 e 3.3, fundir a 6.2 e arquivar; (B) arquivar já, sem 2.4 e 3.3, registrando-as como dívida de teste; (C) manter aberta até a rampa da `acesso-sem-conta-v2`. **Recomendo A** (barato, e o teto de palavras é regra de produto).
  2. A conferência no navegador (6.2): o dono faz junto do staging da `acesso-sem-conta-v2` (recomendado) ou o agente roda um roteiro Playwright e o dono só confere as capturas.
