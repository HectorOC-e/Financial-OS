# Feature Specification: Multiplatform Client with Real Authentication

**Feature Branch**: `002-multiplatform-client-auth`

**Created**: 2026-06-12

**Status**: Draft

**Input**: User description: "Cliente Flutter multiplataforma (iOS, Android y web) con autenticación real para FinancialOS (Feature 002)."

## Overview

FinancialOS today has a complete, tested backend (Feature 001) but no way for a real person to use
it: the only client is a placeholder screen, and identity is a development stub that trusts gateway
headers. This feature turns FinancialOS into a product people can actually sign up for and use, from
a phone or a browser. It delivers a real account system (create an account, sign in with email or
Google, recover access) and a usable, navigable application that connects the already-built screens
into one coherent experience across iOS, Android, and the web — so a household or couple can manage
their shared finances end to end.

The boundary with Feature 001 is firm: this feature adds **identity and the client experience**. All
financial rules, money math, and validation remain server-side and untouched.

## Clarifications

### Session 2026-06-12

- Q: Which provider handles email/password, verification, recovery, and Google sign-in? → A: Supabase Auth (the project's existing managed Postgres provider); the backend verifies Supabase-issued tokens and does not store credentials itself.
- Q: What is the client's offline/caching scope? → A: Online with a read cache — cached reads for fast re-entry, but every mutation requires connectivity and the server's authoritative response (no offline mutation queue).
- Q: When one person uses both email/password and Google with the same email, what happens? → A: Auto-link by verified email — both methods resolve to one account when the email is verified on both sides.
- Q: What session lifetime and re-login policy? → A: Short access token (~1 hour) plus long refresh (~30 days) renewed silently in the background.
- Q: In which language(s) must the interface be available? → A: Bilingual Spanish and English with an in-app language selector, defaulting to the device language; localization infrastructure in place for adding more later.
- Q: How customizable is the accent color? → A: Curated accent palettes (contrast-guaranteed) plus an optional advanced free color picker for power users.
- Q: What accessibility conformance target is the acceptance criterion? → A: WCAG 2.2 Level AA across the app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and sign in (Priority: P1)

A new person opens the app (on their phone or in a browser) and creates a FinancialOS account, either
with their email and a password or with their Google account. After verifying their email (for the
email path), they are signed in and land on their own, empty FinancialOS workspace. The next time they
open the app they are still signed in; if their session has expired, signing in again restores access.

**Why this priority**: Without identity, nothing else in the product is reachable. This is the
foundation every other journey depends on, and on its own it already delivers a real, demonstrable
outcome: a person has a private, persistent account.

**Independent Test**: Install/open the app with no prior session, complete account creation by both
methods (email+password and Google), confirm email verification gates the email path, sign out, and
sign back in — verifying the same private workspace returns and that another person's account is never
visible.

**Acceptance Scenarios**:

1. **Given** a person with no account, **When** they register with a valid email and password, **Then** they receive a verification step and, once verified, reach their own empty workspace.
2. **Given** a person with a Google account, **When** they choose "Continue with Google" and approve access, **Then** they are signed in and reach their own workspace without a separate password.
3. **Given** a returning signed-in person, **When** they reopen the app, **Then** they are taken straight to their workspace without signing in again.
4. **Given** a person whose session has expired, **When** they attempt any action, **Then** they are returned to sign-in and, after re-authenticating, resume where they were.
5. **Given** an attempt to register with an email already in use, **When** they submit, **Then** they are told the account exists and offered sign-in or recovery instead.
6. **Given** invalid credentials at sign-in, **When** they submit, **Then** they see a clear, non-revealing error and remain on the sign-in screen.

---

### User Story 2 - Use FinancialOS end to end while signed in (Priority: P1)

A signed-in person navigates the app through clear, consistent navigation and runs the full shared-
finance flow: create a shared profile, invite another member and have them accept, declare income,
set an allocation percentage, record a contribution, watch the pool total and their standing update
live, fund a goal, pay a shared debt, and view AI coaching — all without ever leaving the app or
seeing raw technical errors.

**Why this priority**: This is the reason the product exists. Authentication only matters because it
unlocks this journey; together, US1 + US2 form the minimum viable product — a person can sign up and
actually manage shared finances.

**Independent Test**: Signed in as two different members, complete the entire flow (profile → invite →
accept → declare income → allocate → contribute → live standing/pool → fund goal → pay debt → coaching)
on a phone and confirm each step reflects the server's authoritative result.

**Acceptance Scenarios**:

1. **Given** a signed-in person on the home screen, **When** they move between the main areas (profiles, contributions, shared elements, accounts, coaching), **Then** navigation is obvious, consistent, and preserves their place.
2. **Given** a shared profile owner, **When** they invite a member and that member accepts on their own device, **Then** both see the updated membership.
3. **Given** a member who records a contribution, **When** the contribution is accepted, **Then** the pool total and affected standings update on all viewers' screens within a few seconds, without a manual refresh.
4. **Given** a person funding a goal or paying a shared debt, **When** the action succeeds, **Then** the displayed amounts reflect the server's recomputed values exactly.
5. **Given** a person viewing AI coaching, **When** they open it, **Then** they see advisory insights only, with no ability to change financial state from that screen.
6. **Given** a long list (members, contribution history, or goals), **When** the person scrolls, **Then** additional items load smoothly in pages without duplicates or gaps.

---

### User Story 3 - Recover and manage access (Priority: P2)

A person who forgot their password requests a reset, receives a recovery link by email, sets a new
password, and signs in. A signed-in person can sign out from any device, and a person whose session
lapses is guided cleanly back to sign-in and then back to what they were doing.

**Why this priority**: Account recovery and clean session handling are essential for a real product
but not required to demonstrate the core value; they make US1 durable rather than enabling it.

**Independent Test**: From the sign-in screen, trigger password recovery, complete it via the emailed
link, sign in with the new password, then sign out and confirm the session is fully cleared.

**Acceptance Scenarios**:

1. **Given** a person who forgot their password, **When** they request recovery for their email, **Then** they receive recovery instructions and can set a new password that works on the next sign-in.
2. **Given** a recovery request for an email with no account, **When** submitted, **Then** the response does not reveal whether the email is registered.
3. **Given** a signed-in person, **When** they sign out, **Then** their session is cleared on that device and reopening the app requires signing in again.
4. **Given** a recovery or verification link, **When** it is expired or already used, **Then** the person is told clearly and can request a fresh one.

---

### User Story 4 - Same experience on web and mobile (Priority: P2)

A person uses FinancialOS in a desktop browser and gets a layout suited to a large screen (side
navigation, comfortable spacing), then picks up their phone and gets a layout suited to a small screen
(bottom navigation) — the same accounts, data, and capabilities in both, adapting to the screen rather
than being a cut-down version.

**Why this priority**: Reaching people on whichever device they have widens the product's value, but
the core journeys (US1, US2) are demonstrable on a single platform first.

**Independent Test**: Sign in to the same account on a phone and in a browser; confirm both present the
full feature set, adapt their layout to the screen size, and show identical underlying data.

**Acceptance Scenarios**:

1. **Given** the app on a small screen, **When** it loads, **Then** primary navigation is reachable with one hand and content fits without horizontal scrolling.
2. **Given** the app on a large screen, **When** it loads, **Then** navigation and content use the available width without feeling like a stretched phone layout.
3. **Given** the same account on two platforms, **When** data changes on one, **Then** the other reflects it on next view or live where applicable.

---

### User Story 5 - Polished, animated, themeable experience (Priority: P3)

The interface feels modern and alive: navigation, list changes, and live value updates animate with
purpose; actions give immediate feedback; loading shows structured placeholders rather than blank
screens. A person can use the app in Spanish or English, switch between light and dark mode, and choose
a personal accent color that carries through the whole app. People who prefer reduced motion get a calm,
still version that keeps all feedback, and the whole experience meets a recognized accessibility bar.

**Why this priority**: Craft, personalization, language reach, and accessibility strongly affect
adoption and delight, but the product is functional without them; they elevate rather than enable the
core journeys.

**Independent Test**: Toggle light/dark, change the accent color, and switch language, confirming each
applies app-wide and persists; enable the device's reduced-motion setting and confirm motion is replaced
by calm transitions while all feedback remains; run an accessibility audit confirming WCAG 2.2 AA.

**Acceptance Scenarios**:

1. **Given** any screen, **When** the person switches between light and dark mode, **Then** the entire app updates immediately and the choice persists across sessions.
2. **Given** the personalization setting, **When** the person selects a curated accent color, **Then** that color is reflected consistently across the app, meets the contrast bar, and persists.
3. **Given** the advanced color picker, **When** the person picks a color that fails the contrast bar, **Then** the app warns them and/or preserves legibility rather than applying an unreadable combination.
4. **Given** a person who has enabled reduced motion at the OS level, **When** they use the app, **Then** animated transitions are replaced by minimal ones and no essential feedback is lost.
5. **Given** any data-loading screen, **When** content is pending, **Then** a structured placeholder previews the layout instead of a blank or spinner-only screen.
6. **Given** the app open in one language, **When** the person switches language in-app, **Then** every screen updates with no untranslated text and the choice persists across sessions.
7. **Given** a person using a screen reader, **When** they navigate any screen, **Then** interactive elements and live updates are announced with meaningful labels (WCAG 2.2 AA).

---

### Edge Cases

- A person abandons account creation midway (e.g., never verifies their email): the unverified account
  must not grant access to financial workspaces, and the person can restart or re-trigger verification.
- A person signs in on a second device while already signed in on a first: both sessions remain valid
  unless explicitly signed out (concurrent sessions are allowed).
- Connectivity drops mid-action: the person sees that the action did not complete and can retry; no
  partial or duplicated financial change is shown as if it succeeded. Previously loaded data may still
  be viewed from cache, but no new action can be performed until connectivity returns.
- A live update (pool/standing) arrives while the person is mid-edit: the incoming change is reflected
  without discarding the person's unsaved input.
- The server rejects an action because another person changed the same record first (a version
  conflict): the person is shown the current state and can retry against it, rather than seeing a raw
  error or silently overwriting.
- The person hits a rate limit after many rapid actions: they are told to wait briefly and the app
  recovers automatically after the indicated time.
- The person's role does not permit an action (e.g., a viewer trying to edit): the action is not
  offered, and if attempted, it is refused with a clear explanation and no state change.
- A Google sign-in is cancelled or denied mid-flow: the person returns to sign-in with a clear message
  and no half-created account.
- An email address is associated with both an email/password registration and a Google sign-in for the
  same person: they reach one single account, not two separate ones.

## Requirements *(mandatory)*

### Functional Requirements

**Account & identity**

- **FR-001**: The system MUST allow a person to create an account using an email address and a password.
- **FR-002**: The system MUST verify ownership of the email address before granting full access to a financial workspace via the email/password path.
- **FR-003**: The system MUST allow a person to create an account and sign in using their Google account.
- **FR-004**: The system MUST allow a signed-in session to persist across app restarts and MUST restore the person to their workspace without re-entering credentials until the session expires or they sign out. Sessions use a short-lived access credential (about 1 hour) renewed silently by a longer-lived refresh credential (about 30 days); a person is only prompted to sign in again when the refresh window lapses or they sign out.
- **FR-005**: The system MUST allow a person to sign out, fully clearing their session on that device.
- **FR-006**: The system MUST allow a person to request a password reset and set a new password through a recovery flow delivered to their email.
- **FR-007**: The system MUST NOT reveal, through registration, sign-in, or recovery responses, whether a given email is already registered, beyond what is strictly necessary to guide the legitimate owner.
- **FR-008**: The system MUST resolve a person who uses both email/password and Google for the same email address to a single account, not duplicates, by automatically linking the methods when the email address is verified on both sides.
- **FR-009**: On a person's first successful authentication, the system MUST provision their isolated workspace (tenant) and their personal profile automatically, with no manual setup.
- **FR-010**: The system MUST treat every authenticated request as belonging to exactly one workspace (tenant) and one person, and MUST reject unauthenticated requests with a clear, stable "not authenticated" outcome that the client recognizes and responds to by returning the person to sign-in.

**Application experience**

- **FR-011**: The client MUST provide coherent navigation between the existing functional areas (profiles, contributions/allocation/tracking/redistribution, shared elements, accounts, coaching) and preserve the person's location across navigation.
- **FR-012**: The client MUST surface the complete Feature 001 capability set to a signed-in person: creating and governing shared profiles, inviting and accepting members, declaring income, setting and redistributing allocations, recording contributions, viewing standings and pool totals, managing shared goals/debts/investments/budgets, managing personal accounts, and viewing AI coaching.
- **FR-013**: The client MUST reflect live changes to pool totals and contribution standings without requiring a manual refresh, updating affected viewers within a few seconds of a change.
- **FR-014**: The client MUST always display money and financial figures exactly as computed and returned by the server, performing no financial calculation of its own; it MAY only format values for display.
- **FR-015**: The client MUST present AI coaching as advisory only, offering no means to change financial state from the coaching surface.
- **FR-016**: The client MUST load long lists (members, contribution history, shared goals) in pages as the person scrolls, without duplicating or skipping items.
- **FR-016a**: The client MAY cache previously loaded data for fast re-entry and offline viewing, but MUST require connectivity for every action that changes state and MUST display the server's authoritative result for that action; the client MUST NOT queue or apply financial changes while offline.

**Resilience & error handling**

- **FR-017**: When the server reports that a record was changed by someone else (a version conflict), the client MUST show the person the current state and let them retry, rather than overwriting silently or showing a raw error.
- **FR-018**: When the server reports that the person's role does not permit an action, the client MUST avoid offering that action and, if attempted, explain the refusal without implying any change occurred.
- **FR-019**: When the server reports that the person is making requests too quickly (a rate limit), the client MUST inform them and automatically recover after the indicated wait.
- **FR-020**: When a session is no longer valid, the client MUST guide the person back to sign-in and, after re-authentication, return them to their prior context where feasible.
- **FR-021**: The client MUST present all server-reported error conditions in plain, human language tied to the action attempted, never exposing internal technical details.

**Platforms**

- **FR-022**: The client MUST run from a single shared codebase on Android, in a web browser, and on iOS.
- **FR-023**: The client MUST adapt its layout to the screen: compact, one-handed navigation on small screens and width-appropriate navigation on large screens, with the full feature set available on each.
- **FR-024**: Android and web MUST be buildable and runnable in the team's standard development environment; iOS MUST be buildable through an automated build pipeline, with the application architecture imposing no barrier to iOS even though iOS signing and distribution may be completed later.
- **FR-025**: The client MUST be configurable to reach the backend across environments (local development, networked device, and hosted web origin) without code changes per environment.

**Presentation & personalization**

- **FR-026**: The client MUST offer light and dark modes, apply the choice across the entire app immediately, and persist it across sessions.
- **FR-027**: The client MUST let a person choose a personal accent (secondary) color that is applied consistently across the app and persists across sessions. It MUST offer a set of curated accent palettes whose color combinations meet the accessibility contrast target (FR-035), plus an optional advanced free color picker for power users; when a freely picked color would fail the contrast target, the client MUST warn the person and/or adjust to preserve legibility.
- **FR-028**: The client MUST respect the operating system's reduced-motion preference, replacing motion with minimal transitions while preserving all feedback and information.
- **FR-029**: The client MUST give immediate visual feedback for actions and show structured loading placeholders for pending content rather than blank screens.

**Security & privacy**

- **FR-030**: The system MUST never write credentials, tokens, or other secrets to logs or diagnostics, on either client or server.
- **FR-031**: The system MUST preserve existing multi-tenant isolation and per-profile permissions for every authenticated request, with no cross-workspace data exposure.
- **FR-032**: The system MUST transmit all data between client and server over encrypted connections, including live-update channels.

**Localization & accessibility**

- **FR-033**: The client MUST present its interface in both Spanish and English, default to the device's language on first run, and let a person switch language in-app at any time, with the choice persisting across sessions.
- **FR-034**: The client MUST externalize all user-facing text so additional languages can be added without code changes to screens, and MUST localize formatting that varies by locale (dates, numbers, currency display) at the presentation edge only — never altering the server's authoritative money values.
- **FR-035**: The client MUST conform to WCAG 2.2 Level AA across all screens, including sufficient color contrast, visible keyboard/switch focus, adequate touch-target sizes, screen-reader labelling for interactive elements and live updates, and the reduced-motion behavior in FR-028.

### Key Entities *(include if feature involves data)*

- **Person (Account holder)**: A human who authenticates to FinancialOS. Has one or more sign-in methods (email/password, Google) that all resolve to the same account, a verified-email state, and a session lifecycle. Maps to exactly one workspace and the existing User/PersonalProfile concepts from Feature 001.
- **Authentication method**: A way a person proves identity (email+password, Google). Multiple methods may attach to one Person.
- **Session**: An authenticated period of access on a device, with a lifetime, the ability to be ended (sign-out), and renewal until expiry.
- **Workspace (Tenant)**: The isolated container provisioned for a Person on first sign-in; everything they own and the shared profiles they participate in live within tenant isolation (Feature 001 concept; not redefined here).
- **Client session preferences**: Per-person presentation choices that persist — theme mode (light/dark), accent color (curated or advanced free pick), and interface language (Spanish/English) — plus respect for OS-level reduced-motion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person can go from opening the app to a usable, signed-in workspace in under 3 minutes via email/password, and under 1 minute via Google.
- **SC-002**: A person can complete the full core journey — sign in, create a shared profile, invite and accept a member, declare income, allocate, record a contribution, fund a goal, pay a debt, and view coaching — without encountering a raw technical error or needing a manual refresh to see live updates.
- **SC-003**: Live pool/standing updates appear to all relevant viewers within 5 seconds of the change in at least 95% of cases.
- **SC-004**: 95% of people who start password recovery can regain access on their first completed attempt.
- **SC-005**: The same account, signed in on a phone and in a browser, exposes the identical set of capabilities and the same data.
- **SC-006**: 100% of server-reported error conditions (version conflict, permission denied, rate limited, not authenticated) are presented to the person as understandable guidance with a clear next step, and none results in a silent overwrite or a misleading "success".
- **SC-007**: Switching theme mode or accent color applies across the entire app within one interaction and persists after closing and reopening the app.
- **SC-008**: With the OS reduced-motion setting enabled, no screen relies on motion to convey state, and all feedback remains available.
- **SC-009**: No credential or token value appears in any client or server log during the full authentication and usage flow.
- **SC-010**: A person can never see or act on data belonging to another workspace, verified across the entire authenticated surface.
- **SC-011**: The full interface is available in both Spanish and English, the app opens in the device language by default, and switching language in-app updates every screen with no untranslated user-facing text and persists across sessions.
- **SC-012**: All screens meet WCAG 2.2 Level AA (verified for color contrast, focus visibility, touch-target size, and screen-reader labelling), and every curated accent palette passes the contrast requirement.

## Assumptions

- **Reused backend**: Feature 001's GraphQL backend, domain logic, money handling, multi-tenant isolation, per-profile permissions, error semantics, pagination, and live-update channels are reused as-is; this feature adds identity and the client, and makes only the minimal backend changes that real authentication and a real client require (e.g., validating real identity in place of the development header stub, and ensuring the published API contract is generated separately from the curated source-of-truth contract).
- **Identity provider**: Supabase Auth handles credential storage, email verification, password-reset delivery, and Google sign-in, issuing a short-lived access token (~1 hour) with a long-lived refresh token (~30 days). The backend verifies Supabase-issued tokens and never stores credentials itself; Supabase is already the project's managed Postgres provider. Whether Supabase's own row-level security is also adopted, or Supabase is used for identity only while Feature 001's existing tenant RLS remains authoritative, is a planning decision — the existing multi-tenant isolation must remain intact either way.
- **Email delivery**: Verification and password-reset emails are sent by Supabase Auth; FinancialOS does not operate its own mail infrastructure for this feature.
- **Account linking**: When the same verified email is used for both email/password and Google, the methods are automatically linked to one account. Linking only occurs on a verified email on both sides.
- **Caching / connectivity**: The client keeps an online-first read cache for fast re-entry and offline viewing of previously loaded data, but all state-changing actions require connectivity and reflect the server's authoritative result. There is no offline mutation queue or client-side sync/conflict resolution.
- **One workspace per person at first**: Each newly registered person receives their own isolated workspace on first sign-in. Joining someone else's workspace happens through the existing shared-profile invitation flow, not through a separate organization/tenant-joining mechanism in this feature.
- **iOS completion later**: iOS is in scope architecturally and buildable via CI, but iOS code signing, device provisioning, and App Store distribution may be finished after this feature, using a macOS build runner the team will provision.
- **Development environment**: Day-to-day development targets Android and web locally on Ubuntu; iOS is built on a hosted macOS runner.
- **Localization scope**: The interface ships in Spanish and English with localization infrastructure ready for more languages; backend-originated content (e.g., AI coaching text from the existing service) is presented as returned and is not separately translated by the client in this feature.
- **Accessibility target**: WCAG 2.2 Level AA is the acceptance bar for all screens; the curated accent palettes are designed to pass contrast, and the advanced free picker is gated by a contrast check.
- **Concurrent sessions allowed**: A person may stay signed in on multiple devices simultaneously; signing out affects only the device where it is performed.
- **Existing screens**: The per-area screens already present in the client are reused and connected; this feature does not redesign their core information, though it applies the unified theme, motion, and navigation around them.
- **Reasonable security defaults**: Password strength rules, verification/reset link expiry windows, and lockout-on-abuse follow Supabase Auth's industry-standard defaults unless tightened during planning. Session lifetime is fixed by clarification at ~1 hour access / ~30 day refresh.
