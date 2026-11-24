> **Fase 1 de 6 do "Intérprete v3".** Plano: `C:\Users\Guilh\.claude\plans\faca-um-brain-storm-temporal-crystal.md`.
> Ordem: **1 histórico e toque** → 2 fim de fala inteligente → 3 vozes por falante → 4 conversa virtual → 5 voz para a
> chamada (dentro da 4) → 6 nível "Ao vivo". Parte do `modo-interprete` (E1–E7, já na `main`).

## Why

Hoje a tela do intérprete mostra só a última frase de cada lado (`ultimaDoLado`, `ModoInterprete.tsx`). Quem quer
rever uma fala, conferir um número ou ouvir de novo a pronúncia perde o que acabou de acontecer. O componente já
recebe **todas** as falas (`falas={speechSegments}`), então o histórico é só apresentação. E o recurso de ouvir a
pronúncia ao tocar na palavra ou na frase já existe no chat e na captura, mas **não no intérprete**. É o maior ganho
percebido com o menor risco: não mexe no pipeline de voz.

## What Changes

- **Histórico em tela.** Cada metade mostra, em cima da frase grande atual, as frases anteriores menores e
  esmaecidas (rolagem própria, presa no fim). Novo modo de tela "Conversa": linha do tempo única, em bolhas por
  falante, para quem lê sozinho (sem a metade virada 180°).
- **Tocar para ouvir.** Tocar numa palavra ou frase da tradução ou do original lê em voz alta no idioma certo
  (reaproveita `examineWord`, `falar` e `ouvirNaLegenda`, com o modo lento 0,7×); a palavra de vocabulário abre a
  folha da palavra. O "Repetir" continua e passa a valer para qualquer frase do histórico.
- **Corrigir e guardar.** Tocar e segurar numa frase do original abre a edição; ao confirmar, a tradução é refeita.
  Favoritar frase ou palavra manda para a revisão.
- **Exportar.** "Exportar conversa" (Markdown e PDF) com original e tradução lado a lado, reaproveitando o relatório
  da sessão que já existe (`ExportarSessao`).
- **Estados e acabamento.** Faixa de estado clara (ouvindo, reconheci, traduzindo, lendo), medidor de nível do
  microfone, parcial em cinza, tamanho de letra, leitor de tela por bolha, falhas com ação (sem permissão, sem rede).
- **Sem mudar:** ícones, cores, atalhos (1, 2, R, P, Esc) e a tela dividida atual. O desenho novo só acrescenta.

## Capabilities

### New Capabilities
- `interprete-historico`: lista das falas na tela (por metade e em "Conversa"), rolagem, estados e acabamento.
- `interprete-ouvir-ao-tocar`: ouvir palavra ou frase tocando, no idioma da própria palavra, com modo lento.
- `interprete-revisao`: corrigir uma fala, favoritar para estudo e exportar a conversa.

### Modified Capabilities
<!-- Nenhuma: a especificação do modo intérprete ainda está na change `modo-interprete` (não arquivada). -->

## Impact

- UI: `src/components/views/captura/interprete/ModoInterprete.tsx`, `PaginaDoInterprete.tsx`,
  `src/styles/modoInterprete.css`; novos componentes pequenos no mesmo diretório (lista, bolha, folha de edição).
- Lógica: `src/lib/captura/controleDoInterprete.ts` (ouvir uma frase fora do turno), novo
  `src/lib/captura/historicoDoInterprete.ts` (agrupamento e janela, puro e testável).
- Cola: `src/components/views/LiveCapture.tsx` (ponte `corrigirFala`, `ouvirFrase`; exportação).
- Sem mudança de API, de banco nem de plano: vale em Grátis e Premium.
- Testes: `tests/modoInterprete.test.tsx`, `tests/controleDoInterprete.test.ts`, novo `tests/historicoDoInterprete.test.ts`,
  `tests/e2e/modo-interprete.e2e.ts`.
