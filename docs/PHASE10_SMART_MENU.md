# ZORONA 2.0 — Phase 10

This phase adds the customer-facing smart-menu data layer and UX hooks.

## Smart product metadata
- `tags`: currently supports `spicy`.
- `dietary`: supports `vegetarian`, `vegan`, `gluten-free`.
- `spiceLevel`: 0–3.
- `chefChoice`: boolean.
- `isNew`: boolean, with a 30-day recency fallback when `createdAt` exists.

## Popularity
Ordering was removed from the platform, so the public product API no longer calculates a `smart.popular` flag.

## Customer UX
Category pages support smart filters and popular sorting, while product pages render available smart badges and dietary/spice metadata. Existing availability filtering and ordering flows remain unchanged.

Dietary badges are only shown when explicit product metadata exists; the system does not infer allergy-related claims from product names.
