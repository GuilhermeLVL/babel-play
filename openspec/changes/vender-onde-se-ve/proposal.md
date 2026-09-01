## Why

O app tem quatro coisas à venda — dois planos de assinatura, três pacotes de Créditos e o Passe —
e **não conta isso a ninguém**. A auditoria de 01/09 mediu onde cada uma está:

- **`ComprarCreditos` não tem rota própria.** Vive dentro de uma aba (`Loja.tsx:536`) que
  DESMONTA o componente quando inativa (`ui/Abas.tsx:130`). Não há URL que leve a ela.
- **`Assinar` também não**, e **não está no menu**: `shell/navItems.ts` tem oito itens e `planos`
  não é um deles. Chega-se por três atalhos escondidos — menu do avatar, um card no Hub, um botão
  em Ajustes.
- **A rota é `/plano`, no singular** (`lib/rotas.ts:45`). **`/planos` não existe** e cai no Hub em
  silêncio (`rotas.ts:128`) — o plural é o que qualquer pessoa digita.
- **Quatro preços escritos à mão** fora da matriz única: `Planos.tsx:174`, `Planos.tsx:178`,
  `MenuDaConta.tsx:145`, e o tipo `SkuDeCredito` redeclarado em `credits.ts:21`. Preço duplicado
  diverge — foi por isso que `PLAN_MATRIX` existe.
- **`Sobre` cita o Passe como coisa à venda** (`Sobre.tsx:159`) **sem dizer o preço e sem levar a
  lugar nenhum**.
- **Sem Asaas configurado as duas telas somem em silêncio** (`ComprarCreditos.tsx:53`,
  `Assinar.tsx:48` devolvem `null`). Quem abre não descobre que não dá — descobre que não existe.

As Fases 1 a 3 fizeram a economia ser confiável, o Crédito ter destino e a conta ter porta. Esta
faz o que está à venda ser **encontrável**.

## What Changes

- **`/creditos` vira rota**, e `/planos` passa a valer como alias de `/plano` em vez de cair no Hub.
- **Planos entra na navegação** — hoje só existe por três atalhos que o próprio dono não achou.
- **Os quatro preços à mão derivam da matriz**, e `SkuDeCredito` passa a importar do core.
- **Sobre ganha o preço e o caminho** até a compra do que ela já diz que vende.
- **Sem Asaas, a tela DIZ que não dá** em vez de sumir — como a Loja já faz no cartão de Créditos.

## Non-Goals

- Mudar preço, plano ou o que cada um entrega: é decisão do dono, e a matriz já é o lugar.
- Landing page pública, SEO e AdSense (`docs/monetizacao.md`): outro trabalho, outro momento.
