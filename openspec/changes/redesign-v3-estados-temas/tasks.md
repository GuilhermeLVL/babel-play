- [x] 12.1 `--temas` no script de evidências (servidor vence; volta a babel no fim)
- [x] 12.2 varredura 6 temas × claro/escuro × 3 viewports em Início, Jogar e Capturar
- [x] 12.3 auditoria de cores fora de token nos componentes globais (zero achados)
- [x] 12.4 achado corrigido: `PUT /api/settings` substitui o blob `ui` inteiro (sem merge no
      servidor); o script de evidências perdia `onboarded` ao trocar de tema. Corrigido incluindo
      `onboarded: true` em toda escrita de tema; recapturado sem achados de cor fora de token.
