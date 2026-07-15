# CareMyMed Motion Design System Guidelines

This document establishes the official motion language, design principles, and implementation patterns for the CareMyMed platform. Future contributors must adhere to these conventions to ensure the app remains accessible, performant, and reassuring.

---

## 1. Motion Philosophy

Motion in a healthcare application must prioritize **calmness, clarity, and reassurance**. Animations are a tool to communicate state changes and build spatial hierarchy, never to distract or entertain.

### Core Principles:
* **Calm Over Spectacle:** Avoid aggressive bounce, high-frequency oscillations, or playful bouncy behaviors on primary clinical components. Urgency should settle quickly.
* **Reduce Cognitive Load:** Motion should explain *where* elements came from and *where* they go, establishing consistent spatial mapping.
* **Never Delay Action:** Critical tasks (confirming medications, logging vitals, dialing companion) must be immediately responsive. Animations must not lock user interaction.
* **Accessibility First:** Motion is a secondary cue. All states must be fully readable and navigable with animations disabled.

---

## 2. Motion Tokens (Physics & Timing)

All animations must import tokens from [reanimatedMotion.js](file:///c:/dev/CareCoUsers/users-mobile/src/theme/reanimatedMotion.js) rather than defining inline physics.

### A. Spring Presets (`springs`)

Springs drive physical spatial transitions. Under the hood, they map to physical equations of Damping ($c$), Stiffness ($k$), and Mass ($m$):

| Spring Name | Stiffness ($k$) | Damping ($c$) | Mass ($m$) | Intent / Best Use |
| :--- | :--- | :--- | :--- | :--- |
| `snappy` | 250 | 15 | 0.8 | Button taps, selection toggles, press-down states |
| `default` | 150 | 18 | 0.9 | Card lifts, list item entries, expanders |
| `gentle` | 80 | 24 | 1.0 | Page transitions, modal slide-ins, bottom sheets |
| `bouncy` | 100 | 10 | 0.8 | Celebrations, rewards, confetti particles |
| `breathing` | 40 | 20 | 1.2 | Continuous AI orb loops, pulse alerts |

### B. Timing Targets (`durations`)

Durations are used as timing fallback values or when timing animations (`withTiming`) are explicitly required (e.g. opacity fades):

* `instant` (80ms): Reduce-motion fallbacks.
* `tap` (150ms): Quick tap scaling feedback.
* `fast` (200ms): Dropdowns, toggles, badge fades.
* `normal` (350ms): Standard screen content entries.
* `slow` (600ms): Expressive celebratory banners.

---

## 3. Interaction Design Conventions

### When NOT to animate:
- **During Scroll Actions:** Do not trigger entry animations on cells that are currently scrolling on the screen.
- **Fast Retries:** If a user repeatedly clicks or triggers a toggle, throttle the animation lifecycle or execute it instantly.
- **Data Tables:** Multi-row lists and tables should mount instantly rather than cascading in slow staggers.

### Snoozing Urgency Pattern:
For warning layouts (e.g. high vitals warnings, emergency notifications), map alerts to pulse **exactly twice** and settle to a static state. Continuous pulsing increases cortisol and patient anxiety:
```javascript
// Example: Intercept pulse twice on render
borderOpacity.value = withSequence(
    withTiming(1, { duration: 400 }),
    withTiming(0.2, { duration: 400 }),
    withTiming(1, { duration: 400 }),
    withTiming(0.2, { duration: 400 }),
    withTiming(1, { duration: 400 }) // Settle static
);
```

---

## 4. Accessibility & Performance Budgets

### A. Respecting Reduce Motion
Always wrap timing/spring values inside the `MotionProvider` context helpers. If a user turns on "Reduce Motion" in their device OS settings:
1. `getSpring()` returns the `instant` preset, immediately executing layouts.
2. `getDuration()` returns the `instant` duration (80ms), collapsing delays.
3. Translates (`translateY`) resolve to `0` to prevent screen movement, utilizing subtle opacity fades instead.

```javascript
// Preferred implementation pattern
const { getSpring } = useMotion();
entering={FadeInDown.springify().damping(getSpring('default').damping)}
```

### B. Frame Rate Performance Budgets
- **UI Thread:** Must remain locked at `60 FPS` (or `120 FPS` on ProMotion screens). All spring coordinates must run on the UI thread using Reanimated shared values.
- **JS Thread:** Must not drop below `55 FPS` during transitions. Heavy business logic or network serialization should be deferred using `InteractionManager.runAfterInteractions` or deferred via requestAnimationFrame.
