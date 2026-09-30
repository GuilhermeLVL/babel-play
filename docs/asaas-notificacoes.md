# Asaas: avisos de cobrança por e-mail ao cliente

O app avisa quando a assinatura está com o pagamento atrasado (a faixa "Não conseguimos confirmar o
pagamento da sua assinatura", `src/components/conta/AvisoDePagamentoAtrasado.tsx`), mas só quem
abre o app vê. O e-mail do próprio Asaas cobre quem não abre. O app **não** manda esses e-mails:
eles são configurados no painel do Asaas, pelo dono da conta.

> Os nomes de menu abaixo são os que o Asaas costuma usar, mas o painel muda de tempos em tempos.
> Se um nome não bater, procure pela palavra **"Notificações"** (no menu da conta, nas
> configurações da conta ou dentro do cadastro de um cliente) ou use a busca/ajuda do painel. Na
> dúvida, confira na central de ajuda do Asaas antes de mudar algo.

## Passo a passo

1. Entre no painel do Asaas com a conta que recebe as assinaturas (a mesma de `ASAAS_API_KEY`).
   Se houver sandbox e produção, faça nas duas — a configuração não passa de uma para a outra.
2. Abra a área de **notificações ao cliente**. Em geral fica nas configurações da conta
   (algo como "Minha conta" → "Notificações"). Pode existir também uma configuração por cliente,
   no cadastro dele.
3. Ligue o canal **e-mail** para estes eventos (os nomes variam; o sentido é este):
   - **cobrança criada** — o cliente recebe a fatura quando ela é gerada;
   - **aviso antes do vencimento** — o lembrete alguns dias antes (escolha quantos, se o painel
     deixar);
   - **cobrança vencida** — o aviso no dia em que venceu sem pagamento, e os lembretes depois;
   - **pagamento confirmado** — o recibo quando o pagamento entra.
4. Se o painel oferecer SMS, WhatsApp ou voz, decida à parte: podem ter custo por envio. Este guia
   só pede o e-mail.
5. Salve. Se já houver clientes cadastrados, abra o cadastro de um deles e confira se as
   notificações dele ficaram como as da conta; se não, ajuste ali (ou procure no painel uma opção
   de aplicar a todos).
6. Teste no ambiente de testes do Asaas (sandbox), se usar um: crie uma assinatura de teste pelo
   app com um e-mail seu e veja se "cobrança criada" chega.

## O que o app faz sozinho

- O webhook do Asaas (`server/lib/billingEventos.ts`) é quem marca a assinatura como atrasada
  (`past_due`) ou paga; ele não depende destas notificações.
- A faixa do atraso aparece em qualquer tela para quem tem conta, leva a Planos → Sua assinatura
  e pode ser dispensada até o fim da sessão do navegador.
