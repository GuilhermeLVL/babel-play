<div align="center">

# Babel Play

**Aprende un idioma con lo que ya ves, juegas y conversas.**
Transcripción y traducción en vivo de cualquier audio de tu computadora — ejecutándose **dentro del navegador** — convertidas en juegos de vocabulario y repetición espaciada.

[🇺🇸 English](README.md) · [🇧🇷 Português](README.pt-BR.md) · [🇨🇳 中文](README.zh-CN.md) · [🇫🇷 Français](README.fr.md) · [🇪🇸 Español](README.es.md)

[![CI](https://github.com/GuilhermeLVL/babel-play/actions/workflows/ci.yml/badge.svg)](https://github.com/GuilhermeLVL/babel-play/actions/workflows/ci.yml)
[![Seguridad](https://github.com/GuilhermeLVL/babel-play/actions/workflows/seguranca.yml/badge.svg)](https://github.com/GuilhermeLVL/babel-play/actions/workflows/seguranca.yml)
[![Licencia: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/img/capturar.png" alt="Pantalla de captura: subtítulos bilingües generados en el navegador" width="900">

</div>

> **Demo:** llega con el despliegue público. Mientras tanto, ejecútalo localmente en tres comandos — sin clave de API.

## Pruébalo

```bash
npm install          # también copia los binarios de ONNX Runtime / Silero VAD a public/
cp .env.example .env # define PORT; no hace falta ninguna clave de API para el pipeline local
npm run dev          # → http://localhost:<PORT>   (abre vía localhost: contexto seguro para los modelos)
```

Elige **Continuar sin cuenta**: todo el pipeline corre localmente y **ni una sola petición** llega al servidor — está medido, no prometido.

## Qué hace

| | |
|---|---|
| <img src="docs/img/hub.png" alt="Inicio" width="420"> | **Inicio** — los tres frentes de la app (capturar, practicar, vocabulario) con el estado real de cada uno. Nivel, racha y seeds se derivan de eventos medidos, nunca se escriben a mano. |
| <img src="docs/img/capturar.png" alt="Capturar" width="420"> | **Capturar** — una pestaña del navegador, el audio del sistema (loopback en Windows, sin configurar) o el micrófono. Whisper transcribe en el navegador (WebGPU, respaldo WASM); Opus-MT, la Translator API de Chrome o un LLM en la nube traducen, siempre con cadena de respaldo. Subtítulos flotantes sobre el video o el juego. |
| <img src="docs/img/jogar.png" alt="Jugar" width="420"> | **Jugar** — nueve juegos cortos construidos con *tu* vocabulario (memoria, sopa de letras, deletreo, duelo relámpago…), con una ruta CEFR basada en listas reales. Lo que aciertas aquí cuenta en el repaso. |
| <img src="docs/img/sem-conta.png" alt="Modo sin cuenta" width="420"> | **Sin cuenta** — todo el pipeline local funciona sin registrarse; las pantallas que persisten datos muestran una invitación en vez de un muro, y lo hecho en el navegador migra a la cuenta, una sola vez, al registrarte. |

**La cuenta es opcional.** Sin ella, los datos viven en IndexedDB; al registrarte, migran una sola vez, de forma idempotente. Con cuenta, el plan lo decide el servidor (free: todo local/BYOK; pro: IA en la nube gestionada).

## Cómo funciona

```mermaid
flowchart LR
    classDef src fill:#1f1f23,stroke:#e85d36,color:#f4efe6
    classDef local fill:#17171a,stroke:#7a70ff,color:#f4efe6
    classDef cloud fill:#17171a,stroke:#8f887c,color:#c9c2b6,stroke-dasharray:5
    classDef out fill:#1f1f23,stroke:#9ad29a,color:#f4efe6

    subgraph IN["🎧 Audio de entrada"]
        A1[Pestaña del navegador]:::src
        A2[Audio del sistema<br/><small>loopback en Windows</small>]:::src
        A3[Micrófono]:::src
    end

    subgraph BROWSER["🧠 En el navegador — nada sale del dispositivo"]
        VAD["Silero VAD<br/><small>AudioWorklet</small>"]:::local
        STT["Whisper<br/><small>transformers.js · WebGPU | WASM</small>"]:::local
        MT1["Opus-MT<br/><small>ONNX, local</small>"]:::local
        MT2["Translator API de Chrome"]:::local
        STORE[("IndexedDB<br/><small>modo sin cuenta</small>")]:::local
    end

    subgraph CLOUD["☁️ Opcional, según plan"]
        MT3["LLM / STT en la nube<br/><small>solo con cuenta</small>"]:::cloud
    end

    subgraph OUT["📚 Aprendizaje"]
        CAP[Subtítulos en vivo]:::out
        VOC[Vocabulario]:::out
        GAMES[9 juegos]:::out
        SRS["Repaso FSRS-5<br/><small>ruta CEFR</small>"]:::out
    end

    A1 & A2 & A3 --> VAD --> STT
    STT --> MT1 -. respaldo .-> MT2 -. respaldo .-> MT3
    STT --> CAP
    MT1 & MT2 & MT3 --> CAP
    CAP --> VOC --> GAMES --> SRS
    VOC --> STORE
```

- **Un solo embudo HTTP** (`apiFetch`): sin cuenta responde un servidor en memoria con las mismas formas que el servidor real; la UI no nota la diferencia.
- **Identidad · plan · rol** son ejes separados; el cliente solo *pinta* el plan, nunca lo decide.

Detalles en [docs/arquitetura.md](docs/arquitetura.md).

## Medido, no prometido

- **Modo sin cuenta: 0 peticiones a `/api`** en el flujo completo.
- **Contraste**: 0 nodos por debajo de WCAG AA en 14 combinaciones; 0 objetivos menores de 24 px.
- **Capacidad** (un proceso, 4 CPU): ~300 req/s; más workers *reducen* el rendimiento (SQLite tiene un único escritor).
- **Auth**: 7 vectores de token falsificado rechazados por el verificador real, y un control positivo aceptado.
- Más de 1.800 pruebas automatizadas en cada push.

## Lo que aún no funciona

- Opus-MT int8/fp16 falla en algunos dispositivos; cae al siguiente traductor, que puede no existir sin cuenta.
- El audio de pantalla compartida en Windows puede dar `NotReadableError`; usa pestaña o loopback.
- Las rondas jugadas sin cuenta no migran (sesiones, audio y tarjetas sí).
- Base de datos de un solo escritor: sirve para una beta, no para escalar.
- Sin cobro todavía — el plan lo define un admin.

## Verificar

```bash
npm run typecheck && npm run typecheck:core && npm run lint && npm test && npm run build
```

[Contribuir](CONTRIBUTING.md) · [Seguridad](SECURITY.md) · [MIT](LICENSE)
