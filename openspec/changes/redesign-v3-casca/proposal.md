## Why

O protótipo v3 é uma sidebar clara de 220 px à esquerda com busca e conta no rodapé. O app já tem
essa moldura (`NavRail`), mas ela não é o padrão, tem 232 px, uma barra lateral de 4 px no item
ativo e um rodapé que espreme cinco controles numa caixa. E a barra do topo (padrão atual) estoura
os rótulos do perfil sênior a 1280 px.

## What Changes

- Padrão da posição do menu passa a `left` (D-012); preferência gravada continua vencendo; as
  quatro posições seguem como itens da loja.
- `NavRail`: 220 px, item de 42 px sem barra lateral, rótulo que quebra em vez de cortar, bordas
  em `--divider`, hover em `--surface-raised`; `--shell-inset-right` acompanha (220 px).
- `ControlCluster` em coluna: busca como pílula larga com "Ctrl K" impresso, e os demais controles
  (texto, conforto, claro/escuro, conta) numa fileira. Nenhum controle sai; nomes acessíveis intactos.
- `NavBar`: rótulos só a partir de `2xl` (corrige o estouro medido em `00-base/jogar__1280__claro.png`).

## Nao-escopo

`MobileNav`, `MobileTopBar`, `data-shell`, `aria-current`, `navGuard`, classes de `body`, `age-*`.
Sem tela redesenhada.
