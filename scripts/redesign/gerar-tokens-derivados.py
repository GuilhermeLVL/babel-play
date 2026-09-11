#!/usr/bin/env python3
"""F1 — insere os 11 tokens derivados em cada bloco de tema de src/index.css.

Uso: python scripts/redesign/gerar-tokens-derivados.py check   (só mede)
     python scripts/redesign/gerar-tokens-derivados.py write   (mede e grava se tudo passar)

ATENCAO: `write` INSERE os tokens antes de `--ink-contrast` em cada bloco; rodar duas vezes duplica.
Ja foi executado na F1 (2026-09-11); serve de registro das formulas e para um tema novo.

Regras de derivação (registradas em docs/redesign/DECISOES.md, D-017):
 · `accent-hover` se AFASTA da luminância de `accent-contrast`: texto escuro → hover mais claro;
   texto claro → hover mais escuro. O protótipo escurece sempre, e isso reprovava o babel (3,65:1).
 · `surface-sunken`/`surface-raised` escurecem a superfície o máximo que `ink-muted` aguenta
   (alvo 8 %/4 %, recuando de 1 em 1 ponto até passar de 4,5:1).
 · No escuro, o painel é MAIS CLARO que a superfície, e `panel-ink-muted` é clareado para
   continuar legível sobre ele.
"""
import os, re, sys
CSS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "index.css")
ANCHOR = "--ink-contrast: var(--canvas);"
MIN_AA = 4.5

def hx(s):
    m = re.match(r"^#([0-9a-fA-F]{6})$", s.strip())
    return tuple(int(m.group(1)[i:i+2], 16) for i in (0, 2, 4)) if m else None
def tohex(c): return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in c)
def mix(a, b, pb): return tuple(a[i] * (1 - pb) + b[i] * pb for i in range(3))
def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)
def ate_passar(base, alvo, texto, pct_alvo, passo=0.01):
    """Mistura `base` com `alvo` na maior fração ≤ pct_alvo que mantém `texto` ≥ 4,5:1."""
    p = pct_alvo
    while p > 0:
        c = mix(base, alvo, p)
        if texto is None or ratio(texto, c) >= MIN_AA: return c
        p = round(p - passo, 4)
    return base

BLACK, WHITE = (0, 0, 0), (255, 255, 255)
BABEL_LIGHT = {  # literais do protótipo v3 (exceto accent-hover, ver D-017)
    "surface-sunken": "#EBE7DB", "surface-raised": "#EFEAD9", "field-bg": "#FFFFFF",
    "accent-border": "#F0C9BE", "divider": "#E5E1D4",
    "panel-bg": "#1C1A16", "panel-surface": "#26241F", "panel-border": "#45423A",
    "panel-ink": "#E6E2D6", "panel-ink-muted": "#B8B2A2",
}
ORDEM = ["surface-sunken", "surface-raised", "field-bg", "accent-hover", "accent-border", "divider",
         "panel-bg", "panel-surface", "panel-border", "panel-ink", "panel-ink-muted"]

def hover(accent, contraste):
    escuro_texto = contraste is not None and lum(contraste) < 0.5
    for p in (0.10, 0.14, 0.18, 0.22):
        c = mix(accent, WHITE if escuro_texto else BLACK, p)
        if contraste is None or ratio(contraste, c) >= MIN_AA: return c
    return mix(accent, WHITE if escuro_texto else BLACK, 0.10)

def derivar(t, escuro):
    S, C, I, A = t["surface"], t["canvas"], t["ink"], t["accent"]
    M = t.get("ink-muted") or mix(I, C, 0.35)
    F = t.get("ink-faint")
    K = t.get("accent-contrast")
    if not escuro:
        campo = ate_passar(S, WHITE, F, 0.6, passo=0.05)
        return {
            "surface-sunken": ate_passar(S, I, M, 0.08), "surface-raised": ate_passar(S, I, M, 0.04),
            "field-bg": campo, "accent-hover": hover(A, K),
            "accent-border": mix(S, A, 0.35), "divider": mix(S, I, 0.14),
            "panel-bg": mix(I, BLACK, 0.10), "panel-surface": I, "panel-border": mix(I, C, 0.20),
            "panel-ink": C, "panel-ink-muted": mix(C, I, 0.30),
        }
    pm = mix(M, I, 0.40)  # muted do painel, mais claro que o muted da superfície
    return {
        "surface-sunken": mix(S, C, 0.5), "surface-raised": ate_passar(S, I, M, 0.06),
        "field-bg": mix(S, C, 0.4), "accent-hover": hover(A, K),
        "accent-border": mix(S, A, 0.35), "divider": mix(S, I, 0.12),
        "panel-bg": ate_passar(S, I, pm, 0.08), "panel-surface": ate_passar(S, I, pm, 0.13),
        "panel-border": mix(S, I, 0.28), "panel-ink": I, "panel-ink-muted": pm,
    }

PARES = [("ink","surface-sunken"),("ink-muted","surface-sunken"),("ink","surface-raised"),("ink-muted","surface-raised"),
         ("ink","field-bg"),("ink-muted","field-bg"),("ink-faint","field-bg"),("accent-contrast","accent-hover"),
         ("panel-ink","panel-bg"),("panel-ink-muted","panel-bg"),("panel-ink","panel-surface"),("panel-ink-muted","panel-surface")]

linhas = open(CSS, encoding="utf-8").read().split("\n")
anchors = [i for i, l in enumerate(linhas) if l.strip() == ANCHOR]
assert len(anchors) == 17, len(anchors)
SELETOR = re.compile(r"^\s*(:root\s*\{|\.dark\b|\[data-theme=)")

def bloco_de(i):
    j = i
    while j > 0 and not SELETOR.match(linhas[j]): j -= 1
    sel = linhas[j].strip()
    toks = {}
    for l in linhas[j:i]:
        m = re.match(r"\s*--([a-z-]+):\s*([^;]+);", l)
        if m: toks[m.group(1)] = m.group(2).strip()
    return sel, toks

claros, planos, falhas = {}, [], 0
for i in anchors:
    sel, toks = bloco_de(i)
    m = re.search(r'data-theme="([a-z]+)"', sel)
    tema = m.group(1) if m else (":root" if sel.startswith(":root") else ".dark")
    escuro = sel.startswith(".dark") or re.search(r'\]\.dark', sel) is not None or tema == "aurora"
    custom = tema == "custom"
    if not escuro and not custom: claros[tema] = dict(toks)
    herdado = claros.get(tema, {}) if escuro and tema != ".dark" else (claros.get(":root", {}) if tema == ".dark" else {})
    ef = {**herdado, **toks}
    if custom:
        novos = ({
            "surface-sunken": "color-mix(in srgb, var(--surface) 94%, var(--ink) 6%)",
            "surface-raised": "color-mix(in srgb, var(--surface) 97%, var(--ink) 3%)",
            "field-bg": "color-mix(in srgb, var(--surface) 40%, #ffffff 60%)",
            "accent-hover": "color-mix(in srgb, var(--accent) 88%, #000000 12%)",
            "accent-border": "color-mix(in srgb, var(--surface) 65%, var(--accent) 35%)",
            "divider": "color-mix(in srgb, var(--surface) 86%, var(--ink) 14%)",
            "panel-bg": "color-mix(in srgb, var(--ink) 90%, #000000 10%)",
            "panel-surface": "var(--ink)",
            "panel-border": "color-mix(in srgb, var(--ink) 80%, var(--canvas) 20%)",
            "panel-ink": "var(--canvas)",
            "panel-ink-muted": "color-mix(in srgb, var(--canvas) 70%, var(--ink) 30%)",
        } if not escuro else {
            "surface-sunken": "color-mix(in srgb, var(--surface) 50%, var(--canvas) 50%)",
            "surface-raised": "color-mix(in srgb, var(--surface) 95%, var(--ink) 5%)",
            "field-bg": "color-mix(in srgb, var(--surface) 60%, var(--canvas) 40%)",
            "accent-hover": "color-mix(in srgb, var(--accent) 88%, #000000 12%)",
            "accent-border": "color-mix(in srgb, var(--surface) 65%, var(--accent) 35%)",
            "divider": "color-mix(in srgb, var(--surface) 88%, var(--ink) 12%)",
            "panel-bg": "color-mix(in srgb, var(--surface) 93%, var(--ink) 7%)",
            "panel-surface": "color-mix(in srgb, var(--surface) 89%, var(--ink) 11%)",
            "panel-border": "color-mix(in srgb, var(--surface) 72%, var(--ink) 28%)",
            "panel-ink": "var(--ink)",
            "panel-ink-muted": "color-mix(in srgb, var(--ink-muted) 60%, var(--ink) 40%)",
        })
        planos.append((i, sel, novos, []))
        print(f"{sel[:48]:48} custom (color-mix)")
        continue
    cores = {k: hx(v) for k, v in ef.items() if hx(v)}
    novos = {k: tohex(v) for k, v in derivar(cores, escuro).items()}
    if tema == "babel" and not escuro:
        novos.update(BABEL_LIGHT)
    todos = {**ef, **novos}
    ruins = []
    for f, g in PARES:
        cf, cg = hx(todos.get(f, "")), hx(todos.get(g, ""))
        if cf and cg and ratio(cf, cg) < MIN_AA: ruins.append(f"{f}/{g}={ratio(cf, cg):.2f}")
    if ruins and tema != ':root': falhas += 1  # :root nunca esta ativo (bootTheme sempre grava data-theme); ink-faint dele ja era <4,5 sobre surface
    planos.append((i, sel, novos, ruins))
    print(f"{sel[:48]:48} {'ESCURO' if escuro else 'claro '} hover={novos['accent-hover']} " + (" ".join(ruins) if ruins else "ok"))

if sys.argv[1:] == ["write"]:
    if falhas: sys.exit("ha pares abaixo de 4,5:1 — ajuste as formulas antes de gravar")
    for i, sel, novos, _ in sorted(planos, key=lambda p: -p[0]):
        indent = re.match(r"\s*", linhas[i]).group(0)
        bloco = [indent + "/* Derivadas do redesign v3 (F1): fundos rebaixado/elevado, campo, hover e borda do accent,",
                 indent + "   divisor e o painel escuro. Hex literal de proposito: `tests/contrastePaletas.test.ts` mede. */"]
        bloco += [f"{indent}--{k}: {novos[k]};" for k in ORDEM]
        bloco.append("")
        linhas[i:i] = bloco
    open(CSS, "w", encoding="utf-8").write("\n".join(linhas))
    print("gravado em", CSS)
