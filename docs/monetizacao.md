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
  páginas de conteúdo. Caminho: uma *landing* estática (o que é, como funciona, capturas) e
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

## 3. Freemium (o caminho de receita de verdade, quando a API subir)

A fundação já existe no código (identidade/planos/entitlements atrás da flag). Plano grátis =
tudo local (o que está no ar hoje). Plano pago (ex.: R$ 9–19/mês) = o que custa dinheiro de
servidor: tradução por LLM (qualidade superior), Whisper na nuvem (rápido em máquina fraca),
sincronização entre aparelhos, importação de YouTube. Cobrança: Stripe (aceita Pix) ou
Mercado Pago. Pré-requisitos: Cloud Run + Turso (pendentes de faturamento) e contas de pagamento.

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
3. **Depois da API**: freemium com Stripe/Mercado Pago — é a única via com teto de receita real.
4. **AdSense**: só quando houver landing + tráfego; nunca dentro do app.
