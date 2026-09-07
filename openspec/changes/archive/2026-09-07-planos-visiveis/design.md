## Context

A raiz do app é overflow-hidden (`MenuDaConta.tsx:50`) — cards flutuantes precisariam de
`fixed`; por isso as ancoragens escolhidas são em fluxo (Hub, menu, banner de quota), não um
flutuante lateral. Anúncio ao assinante seria ruído: o gate `plan` corta.
