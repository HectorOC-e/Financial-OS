---
name: design-motion-principles
description: Principles and concrete guidance for UI motion and animation — when to animate, easing and duration tokens, choreography/orchestration, micro-interactions, performance budgets, and accessibility (reduced motion). Use when designing or implementing animated interfaces, transitions, loading/optimistic states, or a motion system, especially in Flutter. Complements frontend-design (static visual identity) and ui-ux-pro-max.
---

# Design Motion Principles

Motion is interface grammar, not decoration. Every animation must answer one question: *what does this movement help the user understand?* If it has no answer, cut it. Over-animation is the single clearest tell of an AI-generated UI — restraint and intent are what make motion feel designed.

## When motion earns its place

Animate only to do one of these jobs:

- **Continuity** — connect two states so the user doesn't lose context (a card expanding into a detail view; a list item morphing into its destination). Movement explains *where things came from and went*.
- **Feedback** — confirm an action landed the instant it happens (button press, toggle, successful mutation). Feedback must be immediate (< 100 ms perceived); never make the user wait on a flourish.
- **Status** — show that work is happening (skeletons, progress, live-value updates) without blocking.
- **Direction of attention** — guide the eye to what changed or what to do next (a new item settling in, an error shaking into view).
- **Spatial model** — teach hierarchy and relationships (drill-down moves forward/right, dismiss moves back/down).

If a movement doesn't do one of these, it's ornament. Remove it.

## A motion system, not one-off tweens

Define tokens once and reuse them — motion should feel like one hand drew it.

**Duration tokens** (scale with travel distance and surface size; small/local = fast, large/global = slower):
- `instant` 50–100 ms — state toggles, hover, tap feedback
- `quick` 150–200 ms — small elements entering/leaving, switches
- `standard` 250–300 ms — most transitions, cards, sheets
- `expressive` 350–500 ms — full-screen transitions, hero moves
- Anything > 500 ms for a routine interaction feels sluggish; reserve it for deliberate, rare moments.

**Easing tokens** (motion in the real world is never linear):
- *Standard / ease-in-out* — elements moving within the screen (both ends visible).
- *Decelerate / ease-out* — elements **entering** the screen (fast in, gentle settle). The most-used curve.
- *Accelerate / ease-in* — elements **leaving** the screen (gentle start, fast exit).
- *Spring / overshoot* — playful, physical affordances (a toggle, a FAB); use sparingly and only where personality is wanted. Never overshoot on data or money values — it reads as imprecise.
- Reserve *linear* for continuous, non-spatial things only (a looping spinner, a progress fill).

**Choreography** — when several things move, stagger them (20–40 ms apart) so the eye reads sequence, not chaos. Orchestrate one focal moment rather than scattering many simultaneous effects. Things that belong together move together; things in a hierarchy move parent-before-child.

## Micro-interactions

The small stuff is where polish lives. Each interactive element should acknowledge touch: a subtle scale (0.96–0.98), ripple, or color shift on press; a clear, *visible* focus state for keyboard/switch users; a settle animation on release. State changes (loading → loaded, empty → populated, valid → invalid) should tween, not snap. But keep each micro-interaction cheap and consistent — the same control behaves the same way everywhere.

## Loading, optimistic, and live states

- Prefer **skeletons** that match the final layout over spinners — they preview structure and reduce perceived wait.
- For mutations, show **optimistic** UI immediately and animate the reconciliation; if the server rejects (e.g. a `CONFLICT`), animate back to truth rather than hard-cutting.
- **Live values** (a pool total, a standing) should *count/transition* to the new number, not jump — but keep these short and never overshoot a financial figure.
- Never let a flourish gate interactivity. The user can always act through an animation; motion runs on top of an already-usable screen.

## Performance budget

Janky motion is worse than none. Animate only cheap properties — **transform (translate/scale/rotate) and opacity** — never properties that trigger layout/reflow on every frame. Hold 60 fps (≈16 ms/frame); on capable displays aim for 120. Avoid animating large blur/shadow on every frame. Test on a real mid-range device, not just the emulator. If a frame budget is at risk, simplify the motion — duration and easing are free, expensive layered effects are not.

## Accessibility is non-negotiable

- **Respect "reduce motion."** When the OS flag is set, replace movement with instant or simple cross-fades — never remove the feedback, just the travel. Parallax, large slides, and spring/overshoot must be disabled.
- Avoid flashing (> 3/s) and large full-screen motion that can trigger vestibular discomfort.
- Motion must never be the *only* signal — pair it with text/color/icon (an error shakes **and** says what's wrong).
- Keep essential feedback (focus, selection, errors) visible regardless of the motion setting.

## Flutter specifics (this project)

The Feature 002 client is Flutter (Riverpod + GraphQL); the screens already exist and get a motion layer.

- Centralize tokens: expose durations/curves through the theme (e.g. a `MotionTokens` extension on `ThemeData`), so a screen never hard-codes `Duration(milliseconds: 300)`. Pair this with the design-token theming from `frontend-design`/`ui-ux-pro-max`.
- Prefer implicit animations (`AnimatedContainer`, `AnimatedSwitcher`, `AnimatedOpacity`, `TweenAnimationBuilder`) for state changes; reach for explicit `AnimationController`s only for orchestrated/repeating sequences.
- Use `Hero` for shared-element continuity between list and detail; `PageRouteBuilder` / a transitions package for directional screen changes (forward = drill-down, reverse = back).
- Stagger lists with an interval-based controller or a small per-index delay; keep it subtle.
- **Read `MediaQuery.of(context).disableAnimations`** (the OS reduce-motion flag) and branch your tokens off it — this is the Flutter hook for the accessibility rule above.
- Money stays server-authoritative (Principle VII): animate the *display* of a `BigInt`-cents value, never compute or interpolate money math on the client — tween the rendered number, formatted at the edge.

## Self-critique before shipping

Watch a screen recording at normal speed, then at 0.25×. Ask: Does every motion explain something, or is any of it just movement? Does it feel like one system or many unrelated effects? Does it still feel right with reduce-motion on? Is anything overshooting a value that should read as exact? Is it 60 fps on a real device? Cut one effect — like removing one accessory before leaving the house. The goal is motion the user *feels* but rarely *notices*.
