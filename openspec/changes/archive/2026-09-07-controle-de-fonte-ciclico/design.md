## Context

A escala é aplicada via `document.body.style.zoom` (`App.tsx:226-235`), único mecanismo desde a
consolidação que matou os 4 concorrentes (comentário em `index.css:1258`). O ciclo não muda a
aplicação — só a transição de estado. Risco: quem estiver no `xl` e clicar esperando "mais"
recebe `sm`; mitigado pelo rótulo do botão dizendo o estado, e pelo "A" que encolhe visivelmente.
