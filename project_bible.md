# VAULT — Product Bible
**Automated Personal Finance Tracker — Android-first, M-Pesa native**
v1.0

---

## 0. Positioning

**What it is:** The expense tracker that fills itself in. You don't log transactions — Vault reads what M-Pesa already told you.

**What it is not:** A budgeting app that asks you to type in receipts. If a user is typing more than a category correction, the product has failed.

**Platform reality (stated, not buried):** Vault's core mechanism — SMS-based transaction capture — is **Android-only**. There is no iOS equivalent; Apple does not expose SMS content to third-party apps. iOS gets a degraded manual-entry mode, framed honestly as "Vault Lite," not as a missing feature to apologize for. This goes on the App Store listing, not just in this doc.

**Distribution reality (stated, not buried):** Google Play restricts `READ_SMS` to default-handler use cases. Vault ships two intake paths so SMS read is an *opt-in power feature*, not the only way in:
1. **Primary, Play-compliant:** user forwards/pastes M-Pesa SMS, or grants notification-listener access to read M-Pesa's own push notifications.
2. **Power-user, sideload/internal-track:** full SMS inbox sync, gated behind a settings toggle with explicit Play Store risk disclosure to the user if they're on a build where this matters.

---

## 1. Information Architecture

```
Onboarding
 └─ Welcome → Privacy Promise → Intake Method Choice → Starting Balance → App Lock Setup

Tab Bar (4)
 ├─ Home (balance, recent activity, sync status)
 ├─ Insights (charts, category breakdown, budgets)
 ├─ Review (unparsed/uncertain transactions — badge count)
 └─ Settings (sync, backup, security, notifications)

Modals / Stacks
 ├─ Transaction Detail
 ├─ Add Manual Transaction
 ├─ Category Manager
 ├─ Budget Setup
 ├─ Backup & Export
 └─ App Lock (biometric prompt, overlays everything on resume)
```

Four tabs, not five. "Review" is promoted to a tab, not buried in Settings — because an unparsed transaction is unrecorded money, and that has to be impossible to ignore.

---

## 2. Visual Design System

### 2.1 Palette — dark-first, ember/gold/earth, no cold blues, no gradients

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0E0D0C` | App background |
| `bg-elevated` | `#1A1715` | Cards, sheets |
| `bg-sunken` | `#070605` | Input fields, recessed areas |
| `accent-primary` | `#F59E0B` | CTAs, active states, sync pulse |
| `accent-ember` | `#D9772E` | Secondary accent, expense markers |
| `accent-gold` | `#E8C468` | Highlights, balance figures |
| `text-primary` | `#F4EFE8` | Body text |
| `text-muted` | `#9A9388` | Secondary text, timestamps |
| `border-hairline` | `#2A2622` | Dividers, card edges |
| `status-income` | `#7A9B5C` | Earth green — income only, never UI chrome |
| `status-expense` | `#C2502E` | Burnt clay — expense only |
| `status-pending` | `#C9A227` | Review queue badge |

No blue anywhere. No gradient fills — flat color, depth comes from elevation (`bg-base` → `bg-elevated`) and hairline borders, not shadows or gradients.

### 2.2 Typography

| Role | Font | Weight | Use |
|---|---|---|---|
| Display (balance figure) | Bebas Neue | Regular | Hero balance, large stat callouts |
| Headings | Bebas Neue | Regular | Section titles, screen titles |
| Body | Nunito | 400/600 | All paragraph text, labels |
| Numeric/Data | DM Mono | 500 | Transaction amounts, dates, IDs, anything tabular |

Rule: any number a user might want to compare against another number (amounts, balances, percentages) renders in DM Mono for fixed-width alignment. Never Nunito for figures in a list.

### 2.3 Spacing & Grid

- Base unit: 4px. Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Screen margin: 16px standard, 20px on tablets/large Android.
- Card radius: 12px. Input radius: 8px. No fully-rounded pill buttons except status chips.

### 2.4 Iconography

- Line icons, 1.5px stroke, no filled/duotone style.
- No emoji as functional UI (confirmed from style preference) — category icons are custom line glyphs, not emoji shortcuts, even though M-Pesa-adjacent apps lean on emoji heavily. This is a deliberate differentiation point.

### 2.5 Motion

- Sync pulse: a slow 1.5s ember-colored ring pulse on the sync icon while polling — never a spinner, never blue.
- New transaction insert: slide-in from top + 150ms fade, list reflows beneath without jump.
- No bounce/spring easing on financial figures — balance updates should feel deliberate, not playful. Use ease-out, 200ms.

---

## 3. Screen-by-Screen Spec

### 3.1 Onboarding

| Screen | Content | Notes |
|---|---|---|
| Welcome | Logo, one-line promise: "Hela zako, zikijieleza zenyewe." (Your money, explaining itself.) | Swahili line as emotional hook, English subhead beneath for clarity |
| Privacy Promise | Plain-language explanation: nothing leaves your phone, here's exactly what we read and why | Show the actual permission, not a vague "we value your privacy" |
| Intake Method Choice | Two cards: "Forward/Paste Messages" (recommended, badge: Play Store safe) vs "Auto-read SMS inbox" (badge: requires extra permission) | User picks deliberately — this is the fix for the Play policy risk, surfaced as user choice, not hidden default |
| Starting Balance | Single numeric input, DM Mono, large | Optional skip → defaults to 0, reconciled later |
| App Lock Setup | Biometric or PIN, **not skippable** | Finance app, no exceptions |

### 3.2 Home

- Hero balance, Bebas Neue, top third of screen, accent-gold figure on bg-base.
- Sync status row directly beneath: last synced timestamp + manual sync button (ember pulse when active).
- "Needs Review" banner if queue > 0 — burnt-clay left border, tappable, jumps to Review tab. Disappears entirely when queue is empty (no permanent empty-state chrome).
- Recent activity list: last 10 transactions, grouped by day, DM Mono amounts right-aligned, category icon left-aligned.

### 3.3 Insights

- Vertical bar chart, category-by-category, accent-ember bars on bg-elevated.
- Tap a bar → filtered transaction list for that category.
- Budget progress bars beneath each category bar **only if a budget is set** — unset categories show the bar alone, no "set a budget" nag inline (that lives in Category Manager, not as constant pressure on the main view).
- Threshold alert state: bar fill turns `status-pending` gold at 80% of budget, `status-expense` clay at 100%+.

### 3.4 Review (new — fixes the silent-failure gap)

- List of every SMS/message that failed regex parsing or matched with low confidence.
- Each item: raw message text shown verbatim, with a quick-fill form beneath (amount, direction, category, counterparty) pre-populated with whatever the parser *did* extract.
- One-tap "looks right" confirms and trains the keyword-category mapping for next time.
- Badge count on tab icon — red dot, not a number, to avoid the screen feeling like a chore list. Detail count appears once opened.

### 3.5 Transaction Detail

- Full-screen modal, swipe-down to dismiss.
- Raw SMS source text available via "View original message" disclosure — for trust and for manual audit.
- Edit category, amount (if correction needed), notes field.
- Delete with confirmation, not swipe-to-delete on the list (financial data shouldn't be one accidental swipe from gone).

### 3.6 Backup & Export (new — fixes the data-loss gap)

- Manual "Export Encrypted Backup" → writes an encrypted file to a user-chosen destination (device storage / user's own Google Drive via share sheet). Vault never touches a server.
- Restore flow: pick file → enter backup passphrase (set at export time, not the device PIN) → restore.
- CSV export separately, for tax/audit use, explicitly unencrypted, with an inline warning before export: "This file is not encrypted. Store it somewhere safe."
- This preserves the "100% client-side" privacy claim while closing the device-loss-equals-total-loss gap.

### 3.7 Settings

- Sync method toggle (with Play Store risk note if inbox-read is active on a sideloaded build).
- App Lock settings (biometric/PIN, lock timing — immediate, 1 min, 5 min).
- Notification time picker for the daily reminder (currently hardcoded 8PM in spec — fixed here).
- Category Manager, Budget Manager.
- Backup & Export entry point.
- Multi-MNO / bank source toggles (Airtel Money, named bank senders) — off by default, user enables what they actually use.

---

## 4. Component Library

| Component | Spec |
|---|---|
| Balance display | Bebas Neue 48px, accent-gold, tabular figures, no currency symbol clutter — "Ksh" prefix in text-muted 16px above the figure |
| Transaction row | 56px height, icon (24px) + title/subtitle (Nunito) + amount (DM Mono, right, colored by income/expense) |
| Category chip | Pill, bg-elevated fill, text-primary, 12px Nunito 600, icon inline |
| Sync button | Circular, 40px, ember pulse ring on active, static ember icon idle |
| Budget bar | 8px height, rounded, bg-sunken track, fill color shifts gold→clay by threshold |
| Empty state | Single line icon (48px, text-muted), one line Nunito copy, no illustration — keep it spare, not cutesy |
| Alert banner | Left border 3px in status color, bg-elevated fill, dismissible only if non-critical |

---

## 5. Microcopy & Tone

- Direct, no padding. "Synced 14 new transactions" not "Great news! We found some new transactions for you."
- Swahili used sparingly and meaningfully — onboarding hook, the daily reminder notification ("Angalia matumizi yako" / Check your spending), not sprinkled everywhere as decoration.
- Error states state the problem and the fix in one line: "Couldn't read that message. Fix it in Review." Not "Oops! Something went wrong."
- Never anthropomorphize the app ("I noticed...", "I think..."). It's a tool, not a companion.

---

## 6. Edge & Error States

| State | Behavior |
|---|---|
| Parse failure | Routed to Review, never silently dropped |
| Duplicate ID collision with no clean ID extracted | Flagged in Review as "possible duplicate," not auto-merged or auto-kept |
| SMS permission revoked mid-use | Banner on Home, sync button disabled, manual paste path still available |
| Backup restore with wrong passphrase | Explicit failure message, no partial restore |
| Budget exceeded | Bar goes clay, no modal interruption — financial shame-modals are a non-goal |
| First launch, zero transactions | Home shows balance only + a single CTA: "Sync your first message" |

---

## 7. Security UX

- App Lock is mandatory at onboarding, enforced on every resume from background after the configured timeout — not just app launch.
- Sensitive fields (amounts, balance, counterparty names) stored via `expo-secure-store` / encrypted SQLite, not plaintext AsyncStorage — this is a data-layer decision but it's a UX one too: the privacy promise screen has to be *true*, or the whole positioning collapses.
- Screenshot/screen-recording blocking on the balance and transaction screens (Android `FLAG_SECURE`) — finance apps showing in a screen-record or App Switcher preview is a real leak vector worth closing.
- No data leaves the device — backup destination is always user-chosen, never Vault's own server, because Vault doesn't have one.

---

## 8. Accessibility

- Minimum touch target 44px regardless of visual size.
- Color is never the only signal — income/expense also carry a directional arrow icon, not just green/clay.
- DM Mono at minimum 14px for any financial figure — never shrink amounts for layout convenience.
- Dynamic type support; Bebas Neue display sizes scale but cap at a max to avoid balance overflow on accessibility text sizes — fallback to Nunito bold if Bebas Neue would clip.

---

## 9. What Ships in v1 vs Later

| v1 (must ship) | v2 (deliberately deferred) |
|---|---|
| Dual intake (paste/notification-listener + optional SMS) | Multi-device sync |
| Review queue | ML-based auto-categorization beyond keyword learning |
| Encrypted local backup/export | Recurring transaction auto-detection |
| App Lock | Bank SMS support beyond M-Pesa/Airtel |
| Budgets + threshold coloring | In-app notification time customization beyond basic picker |

The line is deliberate: v1 ships nothing that requires a server, and nothing that requires Play Store policy exceptions to function for a normal user.