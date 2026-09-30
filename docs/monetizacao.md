# Monetização do Babel Play — opções, requisitos e recomendação (2026-08-27)

O que dá para fazer com um app hospedado de graça (Cloudflare Pages), sem servidor pago, feito por
um desenvolvedor independente — em ordem do mais viável hoje para o mais distante.

## 1. Apoio direto (JÁ IMPLEMENTADO na tela Sobre)

**Pix** (botão copiar na tela Sobre — preencha a chave em `src/lib/criador.ts`), GitHub Sponsors,
Ko-fi / Buy Me a Coffee. Custo zero, sem requisito legal além de declarar a renda. Rende pouco em
valores absolutos, mas é o que combina com o momento (build-in-public, lançamento indie): quem doa
vira defensor do projeto. **Ação**: preencher `pix`/`linkedin`/`email` no `criador.ts`; ativar
GitHub Sponsors (github.com/sponsors — precisa de conta Stripe) quando quiser o canal internacional.

## 2. Google AdSense — dá, mas não agora

Requisitos reais para aprovação:

- **Domínio próprio.** O Google raramente aprova subdomínio de hospedagem (`*.pages.dev`). O
  `.com.br` já planejado no registro.br (~R$ 40/ano) resolve.
- **Conteúdo indexável.** O app é uma SPA atrás de interação — o robô do AdSense precisa ver
  páginas de conteúdo. Caminho: uma _landing_ estática (o que é, como funciona, capturas) e
  algumas páginas de conteúdo real (ex.: "como aprender inglês com jogos", guias por idioma) —
  isso também ajuda SEO.
- **Política de privacidade + consentimento de cookies (LGPD/GDPR).** AdSense usa cookies de
  publicidade; é obrigatório banner de consentimento (o Google fornece o CMP próprio) e página de
  política. Hoje o app não tem cookie nenhum — colocar anúncio quebra o argumento "nada sai do seu
  computador" DENTRO do app; por isso a recomendação é anúncio **só na landing/páginas de
  conteúdo**, nunca dentro da captura/jogos.
- **Expectativa honesta de receita**: RPM no Brasil ~R$ 1–8 por mil visualizações. Com menos de
  ~50 mil visitas/mês, é troco. AdSense faz sentido como consequência de tráfego, não como plano.

**Ação quando chegar a hora**: domínio → landing indexável com 4–6 páginas de conteúdo → política
de privacidade + CMP → candidatura AdSense (leva de dias a semanas).

## 3. Freemium — o que está no código (planos v2, 30/09/2026)

> A versão de 27/08 desta seção (R$ 9–19/mês, Stripe ou Mercado Pago, "tradução de qualidade superior")
> foi substituída pela decisão do dono de 29/09/2026 (ADR 0011, change `planos-v2`). A matriz é
> `src/core/planos.ts`; a conta de custo, `scripts/custo/modelo.mjs`.

|                   | Grátis                                                                           | Premium                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como a tela chama | "Tradução rápida ao vivo"                                                        | "Tradução Nuance"                                                                                                                                                      |
| Preço             | —                                                                                | R$ 19,90/mês · R$ 179/ano à vista (Pix, boleto ou cartão; renova em um ano) · R$ 179 em 12x no cartão (11 × R$ 14,91 + R$ 14,99; não renova)                           |
| Nuvem             | 3 h/mês para aparelho fraco (`FRANQUIA_DE_ALIVIO`, flag `nuvem_gratuita_alivio`) | "sem limite no dia a dia" com **uso justo**: 2 h/dia e 40 h/mês até o B7 medir a cascata barata (depois, 60 h); passando disso, a legenda segue no aparelho, sem venda |
| Aparelho          | sem limite                                                                       | sem limite                                                                                                                                                             |
| Extras            | —                                                                                | outras formas, formal/informal, variantes, glossário; tutor; voz natural no intérprete (Fase E)                                                                        |
| Teste             | —                                                                                | 14 dias sem cartão, um toque, um por pessoa (marca HMAC do e-mail, 730 dias); nunca cobra sozinho                                                                      |

- **Cobrança:** Asaas (assinatura mensal ou `YEARLY`, parcelamento em 12x só no cartão). Quem concede o
  plano é o webhook, pelo valor pago. Pix Automático fica para quando a conta for PJ elegível.
- **Arrependimento de 7 dias** devolve tudo (o ano inteiro no anual, o parcelamento inteiro no 12x).
  Depois disso, cancelar para a renovação e o acesso vale até o fim do período, **sem reembolso
  proporcional** — padrão do dono a validar com o jurídico (`public/termos.html` §3).
- **Por que o anual custa R$ 179:** equivale a 3 meses grátis contra 12 × R$ 19,90 (R$ 238,80) — é o que a
  tela diz, calculado da matriz.
- **Menores:** o perfil protegido não compra nem recebe oferta promocional; o responsável vinculado assina
  ou ativa o teste pela conta dele.

## 4. Outras vias, em uma linha cada

- **Ko-fi Shop / Gumroad**: vender packs (decks temáticos prontos, guia PDF) — esforço baixo.
- **Patrocínio/afiliados**: cursos de idioma, VPN, hardware — só com audiência; cuidado com o tom.
- **Product Hunt / Hacker News**: não é receita, é tráfego — alimenta todos os itens acima.
- **GitHub Sponsors com metas públicas** ("com R$ X/mês pago o servidor de tradução") — transparência
  funciona bem em projeto open source.

## Recomendação

1. **Agora**: Pix + contato na tela Sobre (feito), preencher `criador.ts`, ativar GitHub Sponsors.
2. **No lançamento** (set/2026): domínio `.com.br` + landing indexável (serve para SEO e para o
   futuro AdSense) + metas públicas de apoio.
3. **Freemium com o Asaas**: Grátis + Premium (seção 3) — é a única via com teto de receita real.
4. **AdSense**: só quando houver landing + tráfego; nunca dentro do app.
