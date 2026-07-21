# Developer Cosmetics Store — Product Roadmap

Status: Future concept; not approved for implementation  
Roadmap ticket: `PP-110`  
Working name: Pull Prix Garage

## Idea in one sentence

Give developers a store where the points they earn through healthy review work
can unlock profile upgrades and other cosmetic items, while also allowing
optional real-money purchases, without ever creating a competitive advantage.

## Why this may be valuable

The store could extend the reward loop beyond a single season:

```text
Useful review work
  -> season points and recognition
  -> spendable cosmetic credits
  -> a more expressive, collectible developer identity
  -> stronger season retention and an additional revenue stream
```

It creates two potential sources of revenue:

1. Organizations may pay for a manager-enabled rewards program, fund team
   credits, or buy store access as part of a higher subscription tier.
2. Developers may optionally buy cosmetics directly with real money, either
   instead of or in addition to credits earned through season participation.

The exact commercial model is intentionally unresolved. The store should not
be included in pricing forecasts until willingness to pay and workplace-policy
constraints have been tested.

## Product principles

### Cosmetics only

Purchased or redeemed items may change presentation, identity, or celebration.
They must never:

- Add championship points or multiply future points.
- Change review eligibility, rankings, recommendations, or team-health metrics.
- Unlock a faster route through a season.
- Make another developer's review work less valuable.
- Affect GitHub or workplace permissions.

### Championship score is never spent

A developer's championship score is an immutable record of what happened in a
season. Redeeming an item must not lower that score, alter final standings, or
rewrite season history.

If championship points create purchasing power, the store should issue a
separate, noncompetitive balance such as `cosmetic credits`. The ledger should
record the score-derived grant and every redemption independently:

```text
Championship ledger (immutable competition facts)
  -> credit grant policy (versioned)
  -> cosmetic wallet (earn and spend)
  -> entitlement inventory (items the user owns)
```

This is a spendable reward balance, not a second competitive score. Its name,
conversion policy, expiration policy, and timing remain product decisions.

### Participation should still feel valuable without paying

- Earned credits must unlock desirable items, not only leftovers.
- Paid users may get more choices or obtain an item sooner, but not a stronger
  in-season position.
- Store design must not shame developers who do not purchase.
- Spending should remain private by default; ownership and equipped cosmetics
  may be visible when the developer chooses to display them.

### Managers enable the program; they do not control individual identity

The likely manager setup surface includes:

- Enabling or disabling store access for the organization.
- Choosing whether direct developer purchases are permitted.
- Selecting a company-funded budget or subscription add-on, if offered.
- Reviewing billing, invoices, program usage, and organization policy.
- Optionally choosing from Pull Prix-authored catalog collections that are
  appropriate for the workplace.

Managers should not be able to change championship scores, manually reward
favored employees, see an individual's private purchase history, or equip and
remove items on someone else's profile. Whether managers may issue equal,
non-performance-based grants is an open policy question.

## Candidate catalog

Initial items should be digital, reversible, inexpensive to fulfill, and
usable across future themes where possible.

### Profile identity

- Avatar frames and profile-card treatments.
- Nameplates, titles, banners, and backgrounds.
- Trophy-case layouts and collectible display slots.
- Profile accent colors, textures, and ambient effects.

### Season and dashboard presentation

- Racing liveries, helmets, suits, garages, podium poses, and celebration
  effects.
- Theme-specific equivalents such as planters, tools, structures, or
  construction effects.
- Loading animations, score celebrations, and replay flourishes.
- Sound packs, with audio always optional and independently mutable.

### Social expression

- Reactions, emotes, stickers, and team-safe celebration animations.
- Giftable cosmetics, only after abuse, refund, and workplace-policy rules are
  defined.
- Organization-branded collections, if managers can supply approved assets
  without turning the product into a theme editor.

### Collectibles

- Season commemoratives that remain on the profile after a season ends.
- Achievement-linked variants that must be earned and cannot be bought.
- Limited-availability cosmetics, used carefully and without manipulative
  scarcity mechanics.

Physical merchandise, cash equivalents, gift cards, loot boxes, randomized
rewards, tradable items, and user-to-user resale are out of scope for the first
store. They introduce fulfillment, tax, fraud, gambling, and marketplace risks
that are unrelated to validating the core idea.

## Proposed user journeys

### Manager setup

1. A manager sees the store/rewards feature and its workplace-policy summary.
2. The manager enables the organization program and chooses the permitted
   funding and purchase options.
3. Pull Prix shows the effective policy to every developer before the first
   credit is earned or purchase is made.
4. The manager can later disable new transactions without removing cosmetics
   developers already own, subject to an explicit entitlement policy.

### Developer earns and redeems

1. The developer completes qualifying review work and earns ordinary season
   points.
2. A versioned policy grants cosmetic credits without changing the score.
3. The wallet explains when, why, and how many credits were granted.
4. The developer previews an item on their own profile or current theme.
5. They redeem credits, pay money, or use an approved combination of both.
6. The entitlement appears in their inventory and may be equipped or removed.

### Developer pays directly

1. The store shows the real-money price, available credit discount, refund
   terms, and whether the item is theme-specific.
2. Checkout clearly identifies whether the developer or organization is being
   charged.
3. Payment success creates an auditable purchase and a durable entitlement.
4. A refund reverses the payment and applies the documented entitlement rule;
   it never changes the developer's championship score.

## Economy decisions to validate

The following should be resolved through research and small experiments before
implementation:

| Decision | Questions |
|---|---|
| Credit issuance | Are credits granted as points are earned, at season completion, at milestones, or through a capped conversion? |
| Balance lifetime | Do credits persist forever, expire, or include both permanent and seasonal forms? |
| Funding | Are earned credits subsidized by Pull Prix, included in the organization's plan, or funded by a manager budget? |
| Pricing | Are items sold for credits, money, or both? Is mixed tender worth the added payment complexity? |
| Catalog scope | Which items are global, theme-specific, organization-specific, earn-only, or purchase-only? |
| Portability | What happens to entitlements when a developer changes teams, loses organization access, or deletes their account? |
| Ownership | Does the person, organization, or account own an organization-funded item? |
| Manager control | Can a manager disable direct purchases, limit categories, or only enable/disable the whole program? |
| Equity | How should leave, part-time schedules, new hires, and different review opportunities affect credit earning? |
| Regional support | Which currencies, taxes, age rules, refund rights, and countries can be supported initially? |

## Economy and trust guardrails

- Use a double-entry or equivalently auditable wallet ledger; never store only
  a mutable balance.
- Make credit grants idempotent and reversible when their source score is
  legitimately corrected.
- Define what happens when already-spent credits are later reversed. Do not
  silently create surprise charges or alter standings.
- Version the credit-grant and price policies so historical transactions remain
  explainable.
- Keep payment records, credit transactions, item entitlements, and equipped
  presentation separate.
- Show prices and balances without dark patterns, hidden fees, or confusing
  conversions.
- Do not sell randomized rewards or use pay-to-avoid-loss mechanics.
- Rate-limit purchasing, gifting, and redemption; monitor fraud and chargebacks.
- Provide accessible previews and a reduced-motion experience for effects.
- Give organizations a clear offboarding policy and developers a data export
  and deletion path.

## Relationship to existing Pull Prix contracts

This concept extends, but does not replace, the existing contracts:

- [`scoring-philosophy.md`](scoring-philosophy.md) remains authoritative for
  qualifying work and championship points.
- [`theme-independent-season-contract.md`](theme-independent-season-contract.md)
  remains authoritative for standings, season history, and theme boundaries.
- Store entitlements may be consumed by theme packs, but a theme pack must not
  read payment data or mutate the wallet.
- Completed-season results remain immutable even if credits, prices, or item
  availability later change.

The store requires a new, explicit commerce contract covering wallets,
catalogs, purchases, entitlements, refunds, and organization policy. It should
not be added to the season snapshot as an incidental theme feature.

## Phased roadmap

### Phase 0 — Research and policy

Goal: determine whether this is desirable, acceptable at work, and financially
credible before building commerce infrastructure.

- Interview managers about funding, billing, governance, and employee-policy
  concerns.
- Interview developers about the cosmetics they value and their comfort with
  direct purchases in an employer-sponsored product.
- Test catalog concepts with static mockups and fake currency only.
- Decide whether credits accrue continuously or finalize after a season.
- Model unit economics for company-funded credits and direct purchases.
- Obtain legal/accounting review for virtual currency, sales tax/VAT, refunds,
  privacy, consumer protection, and regional availability.

Exit signal: both managers and developers understand the model, a meaningful
share want it, and one funding model has credible margins without weakening
trust in scoring.

### Phase 1 — Earned cosmetics, no payments

Goal: validate whether persistent identity and redemption improve engagement.

- Ship a small Pull Prix-authored catalog.
- Grant test credits from season activity through a versioned, capped policy.
- Build wallet history, item preview, redemption, inventory, and equip flows.
- Include at least one high-quality earn-only item.
- Measure redemption, repeat visits, equipped-item use, retention, and perceived
  fairness.

Exit signal: developers redeem and equip cosmetics, the economy is understood,
and no material scoring or workplace fairness issue emerges.

### Phase 2 — Manager-funded pilot

Goal: test business willingness to pay with limited operational risk.

- Let selected design partners enable the program.
- Offer one clear company-funded package or subscription add-on.
- Add manager billing and aggregate usage reporting without exposing individual
  private spending behavior.
- Establish support, refund, offboarding, and incident procedures.

Exit signal: design partners pay, renewal intent is positive, support cost is
manageable, and developers view the benefit as recognition rather than
surveillance or compensation substitution.

### Phase 3 — Direct purchases

Goal: validate optional developer spending after the earned economy is trusted.

- Add payment-provider checkout in a deliberately limited set of regions.
- Start with fixed-price items; do not launch randomized or tradable inventory.
- Implement receipts, refunds, chargeback handling, tax treatment, parental/age
  requirements if applicable, and account recovery.
- Test credit-only versus money-only purchasing before adding mixed tender.

Exit signal: net revenue after payment fees, tax operations, refunds, fraud,
content production, and support justifies continued investment.

### Phase 4 — Live catalog operations

Goal: operate a sustainable cosmetic business across multiple season themes.

- Establish catalog release, quality, accessibility, localization, moderation,
  pricing, deprecation, and archival processes.
- Support compatible cosmetics across themes where the creative design allows.
- Consider gifting and organization-branded items only after dedicated policy
  review.
- Build experimentation and forecasting without personalizing prices or using
  manipulative scarcity.

## Success measures

### Product

- Eligible developers who visit the store.
- Credit earners who redeem an item.
- Owners who equip or display an item.
- Repeat redemption and cross-season profile retention.
- Developer understanding of the score-versus-credit distinction.
- Reported fairness and comfort with the program.

### Business

- Organizations enabling and renewing the program.
- Manager-funded revenue per enabled organization.
- Direct-purchase conversion and average net revenue per active developer.
- Gross margin after content, payment, tax, refund, fraud, and support costs.
- Incremental retention compared with similar organizations without the store.

### Trust and safety

- Refund, chargeback, fraud, and support-contact rates.
- Complaints about pressure to spend or unequal earning opportunity.
- Incidents of scores, recommendations, or rankings being affected by commerce.
- Accessibility issues and unwanted visual/audio effects.

## Stop conditions

Pause or redesign the concept if:

- Developers perceive store spending as expected workplace behavior.
- Managers use the economy as compensation, performance evaluation, or
  individual behavioral control.
- The most desirable items are effectively unavailable without payment.
- Credit optimization distorts healthy review behavior.
- Revenue depends on manipulative urgency, randomized rewards, or confusing
  currency conversions.
- Commerce operations cost more than the additional revenue or retention they
  create.
- The store weakens trust in Pull Prix's scoring or privacy model.

## First decisions when this enters discovery

1. Who pays for score-derived credits?
2. Does a manager enable a Pull Prix catalog or configure an organization
   rewards program?
3. When do points produce credits, and can a score correction reverse them?
4. Which five cosmetic concepts are compelling enough to test first?
5. Are developer-funded purchases appropriate in an employer-sponsored product?
6. Who owns and retains an entitlement after organization access ends?
7. Is mixed credit-and-money checkout necessary for the first paid pilot?

