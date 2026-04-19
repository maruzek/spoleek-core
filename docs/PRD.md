# Product Requirements Document (PRD): Spoleek

## 1. Executive Summary

**Spoleek** is a modern, open-source (FOSS) web application engineered for youth organizations, scout troops, and clubs to manage memberships, groups, events, payments, and administrative tasks.

**The Core Engineering Directive:** The application utilizes a multi-tenant architecture optimized for single-organization deployments. It relies on a strictly PostgreSQL-based infrastructure to bridge the gap between two deployment models using a single unified codebase:

1.  **Zero-Cost Cloud SaaS:** Deployed on Vercel's edge network using Neon Serverless Postgres (`spoleek-neon-vercel` fork/configuration).
2.  **FOSS Self-Hosted:** Deployed on traditional VPS infrastructure via a standardized `docker-compose.yml` file that spins up the Next.js application alongside a dedicated local Postgres container.
3.  **SaaS platform hosted by Spoleek:** A platform where Spoleek hosts the application for organizations that do not want to host it themselves. This will be a paid service.

## 2. Architecture & Tech Stack

- **Frontend/Backend:** React, Next.js (App Router), `next-safe-action` for type-safe server mutations.
- **Database:** PostgreSQL (Strictly enforced for all environments).
- **ORM:** Drizzle ORM (Optimized for edge performance and minimal RAM footprint).
- **Authentication:** Better Auth (Email/Password default, Google OAuth integration).
- **UI/Styling:** Tailwind CSS, `shadcn/ui` (with custom theming).
- **Localization (i18n):** English language primary, architected for multi-language expansion (Czech is secondary).

## 3. Database Architecture & Multi-Tenancy

To prevent "split-brain" data synchronization and ensure strict GDPR compliance, the database utilizes the **"Tenant Profile" Pattern**:

- **Global Identity (`users`):** The absolute source of truth for authentication (ID, Email, Name).
- **Tenant Isolation (`tenant_members`):** A single associative entity linking a `user` to an `organization`. It stores all org-specific logistical data (address, phone), roles, and statuses.
- **Shadow Accounts:** The `userId` on `tenant_members` is nullable, enabling Organization Admins to create offline profiles and assign groups to children before they (or their parents) officially register a digital account. All queries are strictly filtered by `orgId`.

## 4. User Roles & Access Control (RBAC)

1. **System Administrator:** Manages physical infrastructure, environment variables, and initial tenant setup.
2. **Organization Administrator (Org Admin):** Top-tier tenant manager. Approves pending members, manages Google Workspace sync, sets up ToS/Privacy Policies, and defines overarching group categories.
3. **Group Leader / Category Manager:** Mid-level manager overseeing specific sub-groups (e.g., "Troop A"). Manages group-specific rosters, events, and form responses. An org can setup the app in a way where one group category "is king" and the admins of each sub-group can also manage the whole member/user info, data, status, etc. This is useful when the org has a regional structure and each region manages its own members and sub-groups.
4. **Member:** Authenticated user with access to a self-service profile portal, internal events, and restricted forms.
5. **Non-Member (Public):** Unauthenticated user interacting with open registration or public event forms.

## 5. Core Modules & Features

### 5.1. Authentication & Google Workspace Automation

- **Login Flow:** Email and password default. Members register using personal emails. Google OAuth is available as a secondary option.
- **Workspace Sync (Opt-In):** Gated by `WORKSPACE_SYNC_ENABLED`. Spoleek acts as an identity provider for Google Workspace via the Admin Directory API, auto-provisioning `user@org.com` accounts and managing group aliases. Fails gracefully if the API is offline. Must expect that the accounts are already in the workspace, so the app will need to sync the users and groups from the workspace to the app. There will also be a separate import function to import users from a CSV file (i.e. from an old db system)
- It will be possible to turn on the workspace module right from the begining of deploying the app. This will include the system admin logging in with his google account and setting up the workspace module.

### 5.2. App setup / onboarding

- The app will guide the system admin through the setup process with a wizard. This wizard will help the system admin to set up the app in a way that it will work for their organization (i.e. setting up the workspace module, setting up the group categories, setting up the payment methods, etc.). This will include the system admin to set up the .env file with the correct values, Google login, workspace sync, etc.

### 5.3. Onboarding & Member Portal

- **Registration & ToS:** Public-facing dynamic forms. Includes mandatory custom Terms of Service / Privacy Policy checkboxes (with templates provided per organization).
- **Self-Service Portal:** Members manage their own contact info, address, avatars, and view group assignments, reducing admin overhead.

### 5.4. Advanced Group Categorization

- Admins define "Group Categories" (e.g., _Regions_, _Expert Committees_).
- Categories can be pinned to the main navigation, routing to specialized data tables of sub-groups (e.g., _Praha_, _Brno_).
- Support for concurrent multi-group memberships across varying categories.

### 5.5. Events Engine

- Creation of events (dates, times, locations, rich-text descriptions).
- **Visibility Scoping:** Events can be Public, Private (Org-wide), or Targeted (restricted to specific groups - triggering automated invites, or individual users).
- Direct integration with Forms (RSVPs/logistics) and Payments (ticketing).

### 5.6. Custom Forms Module (EAV Pattern)

- Internal, database-native alternative to Google Forms.
- Admins build forms with varied input types (text, selects, booleans) linked to Events or Profiles.

### 5.7. Payments Management

- **QR Payments:** Automated generation of QR codes for frictionless mobile banking.
- **Dynamic Membership Fees:** Subscription fee routing that dynamically adjusts amounts or destination bank accounts based on a member's region or group assignment.

### 5.8. Administration & Documentation

- **Export Engine:** Granular data table exports to CSV, JSON, Excel, and print-ready PDFs with customizable column definitions and saved presets.
- **Built-in Wiki:** Integrated knowledge base for app documentation and internal organizational guides.

## 6. Security & GDPR Compliance

Spoleek classifies and protects data using three distinct layers of security to minimize liability:

- **Symmetric Field-Level Encryption (FLE):** Persistent Special Category Data (e.g., medical diagnoses, severe allergies) is encrypted via AES-256-GCM at the application layer (`encryptedValue`). The database stores only ciphertext.
- **The "Data Shredder" (TTL):** Ephemeral high-risk data (e.g., National ID numbers for travel) is stored in a dedicated JSON payload. A scheduled Cron Job automatically nullifies this data after the associated event threshold passes (e.g., 7 days post-event).
- **The "Chef's Export" (Data Minimization):** Standard logistical data (e.g., Vegan, Gluten-Free) is stored unencrypted for querying. The system generates anonymized aggregate reports for event staff (e.g., "4 Gluten-Free, 38 Standard") completely stripped of PII.
