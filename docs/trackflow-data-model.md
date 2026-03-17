# TrackFlow Data Model

Este documento resume el modelo de datos actual de la web y la expansion de `Jogatina`.

## High-Level Flow

```mermaid
flowchart LR
  WEB[Web TrackFlow] --> AUTH[/api/auth]
  WEB --> STORAGE[/api/storage]
  WEB --> DOMAIN[/api]
  WEB --> JOGATINA[/api/jogatina]

  STORAGE --> STATE_CACHE[(state_cache)]
  STORAGE --> SYNC[(sync_counters)]

  STATE_CACHE --> USERS[(users)]
  STATE_CACHE --> GROUPS[(groups)]
  STATE_CACHE --> ATHLETES[(athletes)]
  STATE_CACHE --> GYM[(gym_exercises)]
  STATE_CACHE --> TRAININGS[(trainings)]
  STATE_CACHE --> SEASONS[(seasons)]
  STATE_CACHE --> WEEKS[(week_plans)]
  STATE_CACHE --> DAYPLANS[(athlete_day_plans)]
  STATE_CACHE --> DAYSTATUS[(athlete_day_status)]
  STATE_CACHE --> COMPS[(competitions)]

  DOMAIN --> DAYSTATUS
  DOMAIN --> COMPS
  JOGATINA --> JG[(jogatina_groups)]
  JOGATINA --> JM[(jogatina_memberships)]
  JOGATINA --> JW[(jogatina_wallets)]
  JOGATINA --> JB[(jogatina_bets_open)]
  JOGATINA --> JWG[(jogatina_wagers_open)]
  JOGATINA --> JC[(jogatina_group_carryover)]
  JOGATINA --> JBC[(jogatina_daily_bonus_claims)]
  JOGATINA --> JL[(jogatina_ledger)]

  DAYSTATUS -. daily bonus .-> JOGATINA
```

## Core Collections

```mermaid
erDiagram
  USERS {
    string _id PK
    string coachId
    string role
    string athleteId
    string usernameLower
    string emailLower
    string passwordHash
    boolean isActive
  }

  GROUPS {
    string _id PK
    string coachId
    string name
    string slug
    int position
    boolean isActive
  }

  ATHLETES {
    string _id PK
    string coachId
    string athleteId
    string name
    string nameLower
    string primaryGroupSlug
    string[] groupSlugs
    string avatar
    object maxWeights
    number[] weekKms
    boolean todayDone
    boolean isActive
  }

  GYM_EXERCISES {
    string _id PK
    string coachId
    string exerciseId
    string name
    string type
    string category
    string muscles
    string imageUrl
    object defaultPrescription
    int position
    string source
    boolean isActive
  }

  TRAININGS {
    string _id PK
    string coachId
    string trainingId
    string name
    string description
    string[] weekTypes
    object kms
    string source
    boolean isActive
  }

  SEASONS {
    string _id PK
    string coachId
    string seasonId
    string label
    string weekOneStartIso
    datetime startedAt
    datetime finalizedAt
    boolean isLocked
  }

  WEEK_PLANS {
    string _id PK
    string coachId
    string seasonId
    int weekNumber
    string startDateIso
    string endDateIso
    string status
    datetime publishedAt
    object[] days
    object raw
  }

  ATHLETE_DAY_PLANS {
    string _id PK
    string coachId
    string athleteId
    string dateIso
    string weekPlanId
    int weekNumber
    object slots
    int plannedSlotsCount
    boolean hasPlannedWork
  }

  ATHLETE_DAY_STATUS {
    string _id PK
    string coachId
    string athleteId
    string dateIso
    int plannedSlotsCount
    boolean amDone
    boolean pmDone
    boolean gymDone
    int doneSlotsCount
    string colorStatus
  }

  COMPETITIONS {
    string _id PK
    string coachId
    string athleteId
    string dateIso
    string name
    string notes
    string createdBy
  }

  STATE_CACHE {
    string _id PK
    string coachId
    string key
    string valueJsonString
    int syncVersion
    datetime updatedAt
    string updatedBy
  }

  SYNC_COUNTERS {
    string _id PK
    string coachId
    int value
    datetime updatedAt
  }

  USERS ||--o{ ATHLETES : "athlete user"
  GROUPS ||--o{ ATHLETES : "primaryGroupSlug / groupSlugs"
  SEASONS ||--o{ WEEK_PLANS : "seasonId"
  WEEK_PLANS ||--o{ ATHLETE_DAY_PLANS : "weekPlanId"
  ATHLETES ||--o{ ATHLETE_DAY_PLANS : "athleteId"
  ATHLETES ||--o{ ATHLETE_DAY_STATUS : "athleteId"
  ATHLETES ||--o{ COMPETITIONS : "athleteId"
  STATE_CACHE ||--o{ USERS : "projection source"
  STATE_CACHE ||--o{ GROUPS : "projection source"
  STATE_CACHE ||--o{ ATHLETES : "projection source"
  STATE_CACHE ||--o{ GYM_EXERCISES : "projection source"
  STATE_CACHE ||--o{ TRAININGS : "projection source"
  STATE_CACHE ||--o{ SEASONS : "projection source"
  STATE_CACHE ||--o{ WEEK_PLANS : "projection source"
  STATE_CACHE ||--o{ COMPETITIONS : "projection source"
```

## Jogatina Collections

```mermaid
erDiagram
  JOGATINA_GROUPS {
    string _id PK
    string coachId
    string code5
    string ownerAthleteId
    string name
    int openBetLimit
  }

  JOGATINA_MEMBERSHIPS {
    string _id PK
    string coachId
    string athleteId
    string groupId
    datetime joinedAt
  }

  JOGATINA_WALLETS {
    string _id PK
    string coachId
    string athleteId
    string seasonKey
    int points
    int joinCount
    datetime lastBetActivityAt
  }

  JOGATINA_BETS_OPEN {
    string _id PK
    string coachId
    string groupId
    string creatorAthleteId
    string questionText
    datetime closeAt
    datetime resolveDeadlineAt
    int carryoverIn
    string status
    string[] winnerAthleteIds
    datetime resolvedAt
    datetime resolvedEditableUntil
  }

  JOGATINA_WAGERS_OPEN {
    string _id PK
    string coachId
    string groupId
    string betId
    string athleteId
    string pickedAthleteId
    int stake
  }

  JOGATINA_GROUP_CARRYOVER {
    string _id PK
    string coachId
    string groupId
    int amount
  }

  JOGATINA_DAILY_BONUS_CLAIMS {
    string _id PK
    string coachId
    string athleteId
    string localDate
    string source
  }

  JOGATINA_LEDGER {
    string _id PK
    string coachId
    string athleteId
    string groupId
    string seasonKey
    int delta
    string reason
    string refId
    object meta
  }

  ATHLETES {
    string _id PK
    string athleteId
    string coachId
    string name
  }

  SEASONS {
    string _id PK
    string seasonId
    string coachId
  }

  ATHLETES ||--o| JOGATINA_MEMBERSHIPS : "1 active membership max"
  JOGATINA_GROUPS ||--o{ JOGATINA_MEMBERSHIPS : "groupId"
  ATHLETES ||--o{ JOGATINA_WALLETS : "athleteId"
  SEASONS ||--o{ JOGATINA_WALLETS : "seasonKey logical"
  JOGATINA_GROUPS ||--o{ JOGATINA_BETS_OPEN : "groupId"
  ATHLETES ||--o{ JOGATINA_BETS_OPEN : "creatorAthleteId"
  JOGATINA_BETS_OPEN ||--o{ JOGATINA_WAGERS_OPEN : "betId"
  ATHLETES ||--o{ JOGATINA_WAGERS_OPEN : "athleteId / pickedAthleteId"
  JOGATINA_GROUPS ||--|| JOGATINA_GROUP_CARRYOVER : "groupId"
  ATHLETES ||--o{ JOGATINA_DAILY_BONUS_CLAIMS : "athleteId"
  ATHLETES ||--o{ JOGATINA_LEDGER : "athleteId"
  JOGATINA_GROUPS ||--o{ JOGATINA_LEDGER : "groupId"
```

## Notes

- `coachId` es la particion principal del sistema. Casi todas las colecciones quedan scopeadas por entrenador.
- `state_cache` guarda el estado bruto tipo key-value y desde ahi se proyectan las colecciones operativas Mongo.
- `athlete_day_plans` y `athlete_day_status` separan plan previsto de ejecucion real.
- `jogatina_bets_open` y `jogatina_wagers_open` solo guardan apuestas activas. Al finalizar se purgan y se conserva trazabilidad en `jogatina_ledger`.
- `jogatina_wallets` maneja saldo por `seasonKey`, no saldo global historico.
