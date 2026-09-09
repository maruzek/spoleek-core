# Federated organizations — controllers, access, and sensitive data

Status: analysis, 2026-09-07. No code written against it yet.

Written because the TOP tým deployment is not the shape `docs/legal-policies.md` assumes.
That document reasons about **one organization with direct members**. The real structure is a
national NGO whose *members are regional NGOs*, and the natural persons are members of the
regional bodies. That difference changes who the controller is, which changes almost everything
downstream — including the question that prompted this: whether a regional admin may see a
member's special-category data.

Spoleek is also meant to serve organizations that are *not* federated, so the model has to make
the flat case the easy default rather than a special case of something complicated.

> **Not legal advice.** §2 below has a fork in it that only the stanovy can resolve, and the
> answer determines the model. Everything here is written so that the engineering work common to
> both branches can start before that answer arrives. A Czech practitioner has to confirm §2 and
> §3 before go-live.

---

## 1. The short version

**The current model expresses a legal boundary as an organisational one.** Regions are
`groups`; groups have no controller identity, no registration number, and no separate legal
personality. But in the real structure each region *is* a separate legal person with its own
membership contracts. Everything about lawful basis, access, and disclosure hangs off that
boundary, and right now the boundary is not represented anywhere in the schema.

Three consequences, in descending order of how much they should worry you:

1. **The national body may have no direct membership relationship with the natural persons at
   all.** If so, its Art. 6(1)(b) contract basis — the one `legal-policies.md` §2.1 relies on —
   does not exist for them, and it is relying on a basis it does not have.
2. **Sharing member data from a regional body to the national body is prima facie a disclosure
   outside "the body"**, which is exactly the condition Art. 9(2)(d) attaches to the exemption
   the whole register depends on.
3. **The access model is inverted.** Today `org_admin` sees everything and scoped leaders see
   less. In a federation the *regional* admin holds the membership relationship and generally
   has the stronger claim to the data; the national board usually has the weaker one.

That third point is the direct answer to the question that started this: yes, a regional admin
should be able to see their own members' data, including sensitive fields, and the reason is not
seniority — it is that their organization is the controller.

---

## 2. The fork: which structure is this?

Czech law offers two shapes for "a national body with regional bodies", and they have different
GDPR consequences. The stanovy decide which one applies.

### 2.1 Pobočné spolky (branch associations, § 228–231 OZ)

The regional bodies have their own legal personality, but it is **derived** from the main
spolek: they are created under its stanovy, their name incorporates the main spolek's, and
their rights are bounded by it. They are registered in the spolkový rejstřík as branches.

Under this shape there is a serious argument that the national and regional bodies together
constitute **one "body"** for Art. 9(2)(d), because the branch is structurally part of the main
association rather than a counterparty to it. If a practitioner confirms that, the whole problem
becomes much simpler: an internal transfer is not a disclosure, and one shared register is
straightforwardly lawful.

### 2.2 Independent spolky as collective members

The regional bodies are ordinary, independent associations that happen to be *members* of an
umbrella association. Arm's length. The user's description — *"one NGO that has other regional
NGOs as its member"* — reads more like this one, which is the harder case.

Here the national and regional bodies are **separate bodies**, and moving member data upward is
a disclosure outside the body. Three routes out, in order of robustness:

1. **Dual membership.** The stanovy make each natural person a member of *both* the regional and
   the national body. Then each body has its own membership relationship, its own Art. 6(1)(b)
   basis, and each is within "the body" for its own members. **This is a governance fix, not a
   technical one, and it is by far the cleanest.** Many federations do it precisely for this
   reason. Raise it before building anything.
2. **"Regular contact" under Art. 9(2)(d).** The exemption covers not only members and former
   members but *persons who have regular contact with the body in connection with its purposes*.
   A regional member who attends national events, votes in national bodies, or receives national
   communications may well qualify. Weaker than route 1 — it is an argument, not a fact — and it
   has to be assessed per organization.
3. **Consent for the specific disclosure.** Genuinely optional, granular, withdrawable. Workable
   as a fallback, but a withdrawal right over a statutory register is exactly the trap
   `legal-policies.md` §2.1 warns about, so it should not be the primary route.

### 2.3 Whichever it is: joint controllership is likely

Even under 2.1, if the national body defines the membership rules, sets the fees, runs the
register and provides the software, while the regional body holds the actual relationship, they
are **jointly determining purposes and means**. That is Art. 26 joint controllership.

Art. 26 requires a transparent arrangement allocating responsibilities — in particular who
answers data subject requests and who provides the Art. 13/14 information — and the *essence*
of that arrangement must be made available to data subjects. Crucially, **the data subject may
exercise their rights against either controller regardless of the arrangement.**

For Spoleek that has a concrete consequence: the member data export (MAR-137) and the erasure
path must work at whichever tier the member asks, not only at the one that happens to hold the
row.

---

## 3. What "the body" means, in practice

The condition in Art. 9(2)(d) is that the data **not be disclosed outside that body without the
data subject's consent**. Everything in this section is downstream of §2.

| Structure | Regional → national transfer | One shared register lawful? |
|---|---|---|
| Pobočné spolky, one body | Internal processing | Yes, with joint-controller arrangement |
| Independent + dual membership | Each body's own members | Yes |
| Independent + regular contact | Arguable, per organization | Probably, document the reasoning |
| Independent, none of the above | A disclosure | Only with consent, per purpose |

**The engineering answer is the same in every row**: the amount of data that moves upward should
be the minimum the national body actually needs, and the app should make that minimum the
default rather than something an admin has to remember to configure.

---

## 4. Where the current model breaks

| What | Today | Problem |
|---|---|---|
| Legal entity | Not modelled. `organizations` has `legalName` but no registration number, no parent, no entity role | The controller boundary exists in law and nowhere in the schema |
| Regions | `groups` under a `groupCategory` | An organisational construct standing in for a legal person |
| Member's controller | Implicit — everyone belongs to the single org | Cannot say *which* body a member contracted with |
| Access | `accessLevel: "full" | "scoped"`, national-first | Inverted: the tier with the weaker claim has the stronger access |
| Upward data flow | Implicit and total — org admins see every field | No minimisation between tiers, no record of what crosses |
| Custom fields | `orgId`-scoped, no sensitivity, no purpose | Cannot express "the region collects this, the national body never sees it" |

Two details make it clear the federation is *already* being modelled through groups, just
without the legal semantics:

- `groups` carry their own `feeAmount`, `feeBankAccount`, `feeRenewalMonth`, and
  `feePaymentWindowDays`. A group that collects its own money into its own bank account is
  behaving like a separate legal person, because it is one.
- `membership_reports` implements a two-tier workflow — groups submit a roster, the board
  approves it. That is a regional-to-national data flow with a review step, which is exactly the
  shape an Art. 26 arrangement would describe. It exists as a feature and nowhere as a lawful
  basis.

The membership report is worth dwelling on: it is currently the **one place where member-level
personal data is deliberately frozen and passed to the national tier**, and
`membership_report_members` copies `first_name`, `last_name` and `email` in as it does so. Under
§2.2 with none of the three routes available, that copy is the disclosure. Under any structure,
it should be the narrowest set of fields that satisfies the statutory reporting duty — and it
should be able to be *counts only* for organizations that do not need names at the centre.

---

## 5. The principle that resolves the access question

> **Access follows the controller relationship and the purpose — not the position in the org
> chart.**

Applied to the federation:

- The **regional admin** administers the body that holds the membership contract. For their own
  members, within the membership purpose, they have the strongest claim of anyone in the system.
  Including sensitive fields, where the purpose supports it.
- The **national board** has a narrower claim, usually confined to what its own statutory duties
  require: the register, the fee remittance, aggregate figures. It should see less than the
  region, not more.
- **Neither** has a claim to a member of a region they are not responsible for.

The current model gets the first two backwards. Fixing that is not just legal hygiene — it is
also what the organization actually wants, because the regional admin is the person who needs
the allergy field before a camp, and the national treasurer is not.

### 5.1 The inverted pyramid, concretely

```
  national board   →  membership status, fee status, counts
                      (names only where the statutory register needs them)
        ▲
        │  a defined, minimal, logged flow — not "admins see everything"
        │
  regional admin   →  the full member record for their own members,
                      including sensitive fields their body collects
        ▲
        │
     member        →  their own everything (portal + export)
```

---

## 6. Proposed model

### 6.1 Make the legal entity first-class

Add an explicit entity, distinct from `groups`:

```
legal_entities
  id, orgId
  name, legalName
  registrationNumber        -- IČO; the thing that makes it a legal person
  parentEntityId            -- null for the top of the federation
  role                      -- 'standalone' | 'national' | 'regional'
  contactEmail              -- the Art. 13 contact for THIS controller
  dpoContact                -- nullable
  controllerModel           -- 'sole' | 'joint'  (see §2.3)
```

and on `tenant_members`, a `primaryEntityId`: **which body this person is a member of.**

For a flat organization there is exactly one entity with `role: 'standalone'`, every member
points at it, and nothing in the UI changes. The federation is the configured case; the simple
case stays simple. That is the test any design here has to pass.

### 6.2 Two candidate boundaries — and the trade

**(a) Regions as separate `organizations` rows, with `parentOrgId`.** The legal boundary becomes
the `orgId` boundary, which means row-level security (MAR-150) enforces it in the database. That
is by far the strongest guarantee. It is also a large refactor: every query, every scope check,
and the national-tier views all have to become hierarchy-aware.

**(b) A `legal_entities` table inside one organization.** Much smaller change. But `orgId` no
longer corresponds to the controller boundary, so RLS cannot enforce the legal line — it stays
enforced by application convention, which §6 of `docs/gdpr-review.md` already argues is not
sufficient for special-category data.

**Recommendation: (b) now, (a) as the MAR-150 endgame.** Model entities explicitly and get the
semantics, the access rules and the audit trail right while the register is empty; make the
entity boundary the *enforcement* boundary when the multi-tenant work happens anyway. Doing (a)
today would stall the TOP tým delivery for a refactor whose main benefit is defence in depth
against a bug class that a small, reviewed codebase can survive for one deployment.

Note this also settles a question `gdpr-review.md` §6 left open: **a federation is one tenant
containing several legal entities; two unrelated organizations are two tenants.** They need the
same isolation primitive but opposite sharing defaults — related entities share by arrangement,
unrelated tenants never share at all.

### 6.3 Declared upward flows

Rather than "the national tier sees everything its admins can reach", make the flow explicit and
few:

- **statutory register** — the fields the law requires at the centre, per organization
- **fee remittance** — amounts and status, member-level only where reconciliation needs it
- **aggregate reporting** — counts, no member-level data at all

Anything else is off by default. Every cross-entity read of member-level data is logged
(MAR-144), because that is precisely the read someone will later ask about.

---

## 7. Sensitive custom fields under this model

This is where the original question lands, and the federation resolves it.

A field should carry, as data:

| Property | Why |
|---|---|
| `sensitivity` — `normal` \| `special_category` | What it is |
| `art9Condition` — the Art. 9(2) condition relied on | Why it may be held at all |
| `purpose` — short, plain text | What it is for, in the words of whoever set it up |
| `visibleToTiers` — which entity roles may read the value | **Who** |
| `retention` — how long | When it goes |

Then *"can a regional admin see the allergy field?"* is not a global role rule. It is answered by
the field's own declaration, made by the person who created it and knew why.

That matters more in a federation than in a flat org, because **the tiers are different
controllers**. A single global rule cannot be correct for both: the regional body collecting
allergy data for a camp it runs, and the national body that has no such purpose, are not two
levels of one permission — they are two organizations with different lawful bases. A per-field
declaration is the only model that can express that truthfully.

It also makes the record of processing (MAR-138) mostly write itself: a RoPA is close to a list
of purposes, categories, bases and retention periods, which is exactly the five columns above.

### 7.1 The safety case, resolved

The earlier worry — that hiding a field from a leader makes them assume no allergy was declared,
which is worse than the privacy exposure — stops being a dilemma. A field whose purpose is
*"medical and dietary needs for activities"* declares `visibleToTiers: [regional]`, and the
regional admin running the trip sees it because that is the purpose it was collected for. A
field whose purpose is national-level statistics declares something else. Nobody has to pick one
global rule that is wrong half the time.

Where a value genuinely is restricted from a viewer, show that the field exists and that an
answer was recorded, without the answer — the absence of a field and an unanswered field must
never look identical.

---

## 8. What generalises to any organization

The model has to serve a scout troop as well as a political federation. It does, if:

- **One entity is the default.** Setup creates a `standalone` entity; nothing about tiers appears
  in the UI until a second entity exists.
- **Sensitivity is opt-in per field.** A troop that collects only name and phone never sees an
  Art. 9 prompt.
- **Tier visibility defaults to "every tier that exists"** — which, in a flat org, is one, so the
  setting is invisible and inert.
- **The federation features are additive**: entity roles, upward flows, cross-entity logging.
  None of them acquire meaning until an organization declares a parent.

This is the same shape as `membershipReportEnabled` and `workspaceModuleEnabled` — a module that
is off until an organization needs it.

---

## 9. What needs a practitioner, precisely

Four questions. The first two block the model.

1. **Which structure (§2)?** Pobočné spolky or independent collective members. It determines
   whether one shared register is straightforwardly lawful or needs one of the three routes.
2. **If independent: which route (§2.2)?** Push for dual membership in the stanovy — it is the
   only one that is a fact rather than an argument, and it is a governance change that costs
   nothing technically.
3. **Sole or joint controllers (§2.3)?** If joint, an Art. 26 arrangement is needed, and its
   essence must be published to members. It also determines who answers a DSAR.
4. **What must actually reach the national body?** The statutory minimum for the register and
   the fee remittance. This sets the default upward flow, and it is the single most useful
   number to have before building §6.3.

---

## 10. What this changes about work already planned

- **`docs/legal-policies.md` §2.1 needs a correction.** It asserts an Art. 6(1)(b) membership
  contract between "the organization" and its members. In a federation that contract is with the
  regional body, and the national body needs its own basis. The reasoning is right; the party is
  wrong.
- **MAR-145 (field sensitivity) should be built with §7's five properties**, not the two-value
  enum originally scoped. Same amount of UI, considerably more truthful, and it is what makes the
  federation case expressible at all.
- **MAR-137 (export) already works** but will need to say *which controller* holds each part once
  entities exist, and to be reachable at either tier under Art. 26.
- **MAR-138 (RoPA)** becomes one record per legal entity, not one per deployment.
- **MAR-150 (RLS)** gains a second reason to exist, and §6.2 gives it a target shape.
- **The membership report** is the one existing feature that already moves member-level data
  between tiers. It should be re-read as a data flow, and gain a counts-only mode.
