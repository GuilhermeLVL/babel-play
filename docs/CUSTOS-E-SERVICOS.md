# Serviços de terceiros e custos do Babel Play

Tudo o que o produto usa de fora, quanto custa, o que a v1 precisa e o que fica para depois.
Preços consultados em 04/10/2026 nas páginas oficiais (links em cada linha); confira antes de decidir,
porque mudam. Valores em dólar convertidos a **R$ 5,50 por US$ 1** (suposição para a conta, não cotação).

## Resumo

| | Custo fixo por mês |
|---|---|
| **Só o site grátis** (o que já está em produção) | **R$ 0** |
| **v1 vendendo o Premium** | **cerca de R$ 20 a R$ 30** (só o Fly) |
| Por venda de R$ 19,90 | taxa do Asaas: cerca de R$ 1,09 no cartão |
| Por assinante Premium (IA) | de R$ 0 (camada grátis do Groq) a cerca de R$ 17 no pior caso |

Uma única conta com mensalidade: o Fly. O resto é grátis ou cobrado só quando há venda ou uso.

## 1. O que a v1 precisa

| Serviço | Para que serve | Custo | Situação |
|---|---|---|---|
| [GitHub](https://github.com/pricing) | Código e testes automáticos | Grátis | Em uso |
| [Cloudflare Pages](https://developers.cloudflare.com/workers/platform/pricing/) | Hospeda o site grátis (`babel-play.pages.dev`) | Grátis (100 mil pedidos por dia) | Em produção |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) | Transcrição, tradução e voz de nuvem do site grátis (headset e aparelho fraco) | Grátis até 10 mil "neurons" por dia; o código tem teto próprio (200 min de fala por dia, somados todos os visitantes) | Em produção |
| [Hugging Face](https://huggingface.co/pricing) | De onde o navegador baixa os modelos que rodam no aparelho | Grátis | Em produção |
| [Fly.io](https://fly.io/docs/about/pricing/) | O servidor completo: contas, planos, cobrança | Máquina de 512 MB: US$ 3,69 por mês ligada o mês inteiro (menos, porque dorme sem uso; São Paulo pode custar um pouco mais). Volume de 1 GB: US$ 0,15. **Cerca de US$ 4 a 5 = R$ 20 a 30** | Staging no ar, em modo de teste: falta cadastrar cartão |
| [Supabase](https://supabase.com/pricing) | Login, senha, recuperação, 2FA | Grátis até 50 mil usuários ativos por mês | Em uso |
| [Asaas](https://www.asaas.com/precos-e-taxas) | Cobrança (cartão, Pix, boleto), assinatura, estorno | Sem mensalidade. Cartão à vista: 2,99% + R$ 0,49. Pix e boleto: R$ 1,99 por recebimento (R$ 0,99 nos 3 primeiros meses) | Sandbox provado; falta a chave de produção |
| [Groq](https://groq.com/pricing) | A IA do Premium: transcrição de nuvem, Tradução Nuance, tutor | Camada grátis sem cartão (limites por minuto e por dia). Pago: transcrição US$ 0,04 por hora de áudio; texto US$ 0,15 (entrada) e US$ 0,60 (saída) por milhão de tokens | Falta criar a chave |

### Quanto custa cada venda e cada assinante

- **Venda de R$ 19,90 no cartão:** o Asaas fica com cerca de R$ 1,09. Sobram R$ 18,81.
- **Venda de R$ 19,90 no Pix:** o Asaas fica com R$ 1,99. Sobram R$ 17,91.
- **IA de um assinante típico** (10 h de nuvem no mês): cerca de US$ 0,75, uns R$ 4.
- **IA de um assinante no teto do uso justo** (40 h de áudio e 6 milhões de tokens no mês): cerca de
  US$ 3, uns R$ 17. Nesse caso a margem da assinatura quase some. É o pior caso, não o comum; se
  aparecer, o ajuste é baixar o teto do uso justo, sem mexer em código de cobrança.
- **Teto geral de gasto de IA** já configurado no servidor: US$ 40 por mês e US$ 3 por dia. Batendo o
  teto, a nuvem para e a legenda segue no aparelho.
- **Enquanto couber na camada grátis do Groq** (cerca de 2.000 pedidos de áudio e 1.000 de texto por
  dia), a IA custa zero. Serve para os primeiros clientes.

### Riscos de custo zero que vale conhecer

- **Supabase grátis pausa o projeto depois de 7 dias sem atividade.** Sem clientes, pode acontecer. Volta
  com um clique no painel. O plano que impede isso custa US$ 25 por mês: não vale agora.
- **E-mail embutido do Supabase manda poucos e-mails por hora.** Para a v1 isso se contorna desligando a
  confirmação de e-mail no cadastro; sobra só o "esqueci a senha", que cabe no limite.

## 2. O que pode vir depois (nada disso trava a v1)

| Serviço | O que resolve | Custo | Quando vale |
|---|---|---|---|
| [Domínio próprio](https://registro.br/dominio/valores/) | Endereço com a marca; volta automática do Asaas para o app; e-mail próprio | Cerca de R$ 40 por ano (.com.br) | Quando houver os primeiros pagantes |
| [Brevo](https://www.brevo.com/pricing/) (envio de e-mail) | Confirmação de e-mail religada e e-mails em volume | Grátis até 300 por dia | Se o cadastro crescer ou houver abuso do teste de 14 dias |
| Login com Google ([Google Cloud](https://console.cloud.google.com/)) | Entrar com um clique | Grátis | Quando o cadastro por e-mail virar atrito |
| [Cloudflare Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) | Captcha contra robôs no cadastro | Grátis | Se aparecer abuso |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | Cópia de segurança do banco fora do Fly e áudio das sessões | 10 GB grátis (exige cartão) | Antes de ter dados de clientes que não podem ser perdidos; hoje o Fly guarda cópias diárias do volume por 5 dias |
| [Sentry](https://sentry.io/pricing/) | Aviso automático de erro em produção | Plano grátis para uma pessoa | Quando houver tráfego real |
| [Supabase Pro](https://supabase.com/pricing) | Projeto nunca pausa; mais limites | US$ 25 por mês | Com clientes pagantes constantes |
| Segundo provedor de IA (OpenRouter) | Reserva se o Groq cair | Por uso | Se a nuvem virar parte crítica da receita |
| Máquina maior no Fly | Mais gente ao mesmo tempo | US$ 5 a 10 por mês | Se os 512 MB não aguentarem |

## 3. Custos que não são de software

| Item | Observação |
|---|---|
| Contador e nota fiscal de serviço | Necessário a partir da primeira venda real (a NFS-e nacional passa a valer em 01/11/2026). Depende do que a empresa já paga hoje |
| Advogado para os Termos | Só para ligar o plano anual; o mensal já está coberto |
| Imposto sobre a receita | Conforme o regime da empresa |

## 4. O caminho mais barato para lançar

1. **Agora, R$ 0:** o site grátis já está no ar. Divulgar e ver se as pessoas usam.
2. **Para vender, cerca de R$ 25 por mês:** cartão no Fly, chave grátis do Groq, chave de produção do
   Asaas, confirmação de e-mail desligada no Supabase.
3. **Só com clientes pagando:** domínio, envio de e-mail, cópia de segurança fora do Fly, Supabase Pro.

Com uma venda e meia por mês o servidor já se paga.
