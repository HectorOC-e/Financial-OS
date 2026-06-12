# FinancialOS

Sistema operativo financiero asistido por IA. SaaS multi-tenant para gestionar **perfiles financieros
compartidos** (parejas, hogares, sociedades): contribuciones por porcentaje de ingreso, metas, deudas,
inversiones y presupuestos compartidos, con cuentas personales totalmente aisladas y coaching de IA
de solo lectura.

Desarrollado con **Spec Kit** (spec → plan → tasks → implement). Constitución del proyecto en
`.specify/memory/constitution.md`.

## Estado actual (2026-06-12)

### ✅ Feature 001 — Shared Financial Profiles: COMPLETA

Las 10 fases / 116 tareas de `specs/001-shared-financial-profiles/tasks.md` están implementadas y
verificadas:

| Verificación | Resultado |
|--------------|-----------|
| Unit (dominio puro + property-based) | ✅ 16 suites, 128 tests |
| Contract (SDL vs contrato curado) | ✅ 5 suites, 47 tests |
| Integración (US1–US7 + RLS, Postgres+Redis reales) | ✅ 16 suites, 20 tests |
| Typecheck + ESLint | ✅ limpios |

Cobertura funcional: gobernanza de perfiles (roles, invitaciones con expiración 14d, transferencia
de propiedad, archivado read-only), asignación porcentual con tope cross-profile 100%, tracking de
contribuciones con periodos auto-rotativos, redistribución preservando historial, elementos
compartidos (metas/deudas/tarjetas/inversiones/presupuestos), aislamiento de cuentas personales,
coaching IA read-only (OpenRouter con fallback determinista), paginación por cursor, rate limiting,
observabilidad OTel, catálogo de errores y postura PII/cifrado.

### 📍 Dónde está la app

```
apps/api/        Backend NestJS + GraphQL (code-first) + Prisma + PostgreSQL 16 + Redis 7
                 → FUNCIONAL: probable hoy vía GraphQL Playground (ver "Cómo probar")
apps/mobile/     Cliente Flutter 3 (Riverpod + graphql_flutter)
                 → PANTALLAS CONSTRUIDAS pero SIN CONECTAR: main.dart sigue siendo el
                   placeholder; falta el shell (navegación + cliente GraphQL + identidad)
packages/contracts/schema.graphql   Contrato GraphQL (fuente de verdad)
specs/001-shared-financial-profiles/  Artefactos Spec Kit (spec, plan, tasks, quickstart con
                                      resultados de validación registrados)
```

**Backend** — listo para probar. Auth es aún un stub de gateway: cada request necesita los headers
`x-tenant-id`, `x-user-id`, `x-auth-subject` (UUIDs cualesquiera en dev).

**Móvil** — existen las pantallas de perfiles, allocation, tracking, redistribución, elementos
compartidos, cuentas y coaching (`apps/mobile/lib/features/`), pero no están montadas en `main.dart`
y el cliente GraphQL manda `Authorization: Bearer` mientras el backend espera los headers `x-*`.
**Esa brecha es exactamente la Feature 002** (ver abajo).

## Cómo probar (backend, hoy)

```powershell
docker compose up -d postgres redis
# apps/api/.env →
#   DATABASE_URL="postgresql://financial_os:financial_os@localhost:5432/financial_os"
#   REDIS_URL="redis://localhost:6379"
pnpm install          # pnpm SIEMPRE, nunca npm
pnpm --filter @financial-os/api prisma:migrate
pnpm api:dev          # Playground en http://localhost:3000/graphql
```

En el Playground agrega los headers de identidad y ejecuta los escenarios de
`specs/001-shared-financial-profiles/quickstart.md` (sección "Validation scenarios").

Suites: `pnpm test:unit` · `pnpm test:contract` · `pnpm test:integration` (estas dos últimas
requieren Docker arriba; la de integración debe correr con un rol de BD **no superusuario** —
ver notas en quickstart.md, FORCE RLS no aplica a superusers).

> ⚠️ `app.module.ts` tiene `autoSchemaFile` apuntando al contrato curado
> `packages/contracts/schema.graphql`: el primer arranque del API lo sobrescribe (pierde
> comentarios). Cambiar esa ruta a un archivo generado es parte de la Feature 002.

## Siguiente paso: Feature 002 — Cliente multiplataforma (iOS + Android + web) con auth real

La rama remota anterior `002-saas-billing` fue descartada; el slot 002 es el cliente completo.
Para generar la especificación con Spec Kit, ejecuta:

```text
/speckit-specify Cliente Flutter multiplataforma (iOS, Android y web) con autenticación real
para FinancialOS (Feature 002).

Estado actual del que parte esta feature: el backend GraphQL (Feature 001) está completo y
probado — contrato en packages/contracts/schema.graphql con paginación por cursor, errores con
extensions.code estables (catálogo en apps/api/src/common/errors/catalog.ts), rate limiting y
suscripciones (poolTotalChanged, contributionStandingChanged). En apps/mobile/lib/features/ ya
existen pantallas sueltas (profiles, allocation, tracking, redistribution, shared_elements,
accounts, coaching) con repositorios graphql_flutter y estado Riverpod, pero main.dart es un
placeholder: no hay navegación, no hay provider del cliente GraphQL en el árbol, y no existe
autenticación real — el backend deriva la identidad de headers de gateway (x-tenant-id /
x-user-id / x-auth-subject) en apps/api/src/common/graphql/graphql-context.ts, diseñado
explícitamente para ser sustituido por verificación de tokens.

Alcance deseado:
1. Autenticación completa con Supabase Auth (el proyecto ya usa Supabase como Postgres — ver
   DATABASE_URL en apps/api/.env — así que Supabase gestiona también identidad): registro con
   correo y contraseña (con verificación de email), inicio de sesión, recuperación/restablecimiento
   de contraseña, cierre de sesión, y "Iniciar sesión con Google" (OAuth). El cliente Flutter usa
   el SDK supabase_flutter para el flujo de sesión; el backend NestJS valida el JWT emitido por
   Supabase (verificación de firma con el JWKS/secret del proyecto), mapea el `sub` de Supabase al
   tenant + User + PersonalProfile (creándolos en el primer acceso), y reemplaza el stub de headers
   x-* en graphql-context.ts sin tocar los resolvers existentes. Las sesiones respetan el rate
   limiting y el catálogo de errores ya existentes (UNAUTHENTICATED estable). Evaluar en /clarify si
   conviene RLS de Supabase además de la RLS propia, o sólo usar Supabase para identidad.
2. Targets: Android, iOS y web (Flutter multiplataforma desde el mismo código). Entorno de
   desarrollo: Ubuntu 24.04 — Android y web se compilan y prueban localmente; el build de iOS
   sale por CI con runner macOS (GitHub Actions / Codemagic), la arquitectura y el tooling deben
   dejarlo listo aunque la firma/publicación de iOS se haga después. En web, GraphQL por HTTPS y
   suscripciones por WebSocket; cuidar CORS en el API y los redirect URLs de OAuth por plataforma.
3. Shell de la app: navegación entre las pantallas existentes (responsive: bottom navigation en
   móvil, rail/drawer en web), inyección del GraphQLClient vía Riverpod con token de sesión,
   configuración de endpoint por entorno (emulador Android 10.0.2.2:3000, dispositivo físico por
   IP local, web por origen).
4. Diseño y experiencia (prioridad alta): interfaz moderna, futurista, animada y agradable, con
   UX/UI cuidada. Usar las skills de diseño disponibles en el repo — `ui-ux-pro-max` y
   `frontend-design` — y aplicar principios de motion/animación (transiciones con propósito,
   jerarquía, microinteracciones, feedback inmediato en cada mutación, estados de carga/optimistas,
   respeto a "reduce motion"). Sistema de temas completo: modo claro y oscuro, y un color de acento
   (secundario) personalizable por el usuario que se propaga por toda la app. Definir tokens de
   diseño (color, tipografía, espaciado, radios, sombras, curvas y duraciones de animación) y un
   theming centralizado; las pantallas existentes se rediseñan contra ese sistema, no al revés.
   Animar las transiciones de navegación, las listas (entrada escalonada), los cambios de standing
   y pool en vivo, y los estados vacíos/error.
5. Flujo end-to-end demostrable en Android físico, emulador y navegador: crear cuenta, iniciar
   sesión, crear perfil compartido, invitar y aceptar, declarar ingreso, asignar porcentaje,
   registrar contribución, ver standing y pool en vivo (suscripciones), fondear una meta, pagar
   una deuda, ver coaching.
6. Manejo de errores del catálogo (CONFLICT → refetch+retry con versión fresca, FORBIDDEN →
   ocultar acción, RATE_LIMITED → backoff con retryAfterSeconds, UNAUTHENTICATED → re-login) y
   paginación por cursor en las listas (members, contributionRecords, sharedGoals).
7. Correcciones de backend mínimas que la app destape, incluyendo mover autoSchemaFile fuera del
   contrato curado.

Restricciones (constitución): el cliente NO contiene lógica de negocio ni cálculos de dinero
(Principio VII) — los BigInt de centavos solo se formatean en el borde de presentación; toda
validación es del servidor; aislamiento multi-tenant y permisos por perfil intactos (Principios
V y IX); credenciales y tokens nunca en logs (postura PII de data-protection.ts).
```

> Skills de diseño: `ui-ux-pro-max` y `frontend-design` están instaladas en este repo y deben
> invocarse durante el diseño/implementación de la UI. La intención de "motion/animación" se
> expresa como principios en el prompt porque **no hay una skill `design-motion-principles`
> instalada** — si quieres una skill dedicada, instálala antes de `/speckit-implement`.

Después de `/speckit-specify`: `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-analyze` → `/speckit-implement`. El hook de git crea la rama `002-*` automáticamente.

## Roadmap

1. **Feature 002 — cliente multiplataforma + auth + diseño** (prompt de arriba): auth con Supabase
   (Google y correo, recuperación de contraseña), iOS + Android + web, UI moderna/animada con
   temas claro-oscuro y acento personalizable, y el shell que conecta las pantallas ya construidas.
2. **Feature 003 — paridad del perfil personal (PREVISTA, aún sin prompt)**: hoy el perfil
   personal solo tiene cuentas aisladas; las metas, deudas, presupuestos y tracking existen
   únicamente en perfiles compartidos. Esta feature lleva ese mismo comportamiento al perfil
   personal (metas/deudas/presupuestos propios, periodos y standing individuales), reutilizando
   los servicios de dominio existentes (Principio X) y manteniendo el aislamiento total del
   perfil personal (FR-004). Redactar su prompt cuando 002 esté cerrada.
3. **Deploy**: contenedores Linux para el API + Postgres/Redis gestionados; producción exige
   `sslmode=require` en DATABASE_URL (el arranque falla sin TLS, por diseño) y registrar un SDK
   de OpenTelemetry para exportar trazas/métricas.
4. **Features 004+**: facturación SaaS (el spec descartado de 002-saas-billing puede reciclarse
   aquí), exportes/analytics, automatizaciones.

> Nota de entorno: el desarrollo se hace en **Ubuntu 24.04** (Android + web localmente; iOS vía
> CI con macOS). Los comandos PowerShell de este README provienen de una máquina Windows usada
> para la Feature 001 — en Ubuntu son los mismos `docker compose` y `pnpm` sin cambios.

## Documentación

- Mapa de módulos del backend: `apps/api/src/modules/README.md`
- Guía de validación + resultados: `specs/001-shared-financial-profiles/quickstart.md`
- Plan técnico: `specs/001-shared-financial-profiles/plan.md`
- Contrato GraphQL: `packages/contracts/schema.graphql` · Eventos: `specs/.../contracts/events.md`
