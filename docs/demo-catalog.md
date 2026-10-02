# Isolated demo catalog

This opt-in fixture creates a visually richer **fictional demo**, not property inventory or a real sales offer. It is separate from the default `prisma/seed.ts`, which is unchanged.

## Before running

Use Node 22 and an isolated local database already migrated and populated with the default six-project development seed. The command refuses production, requires `DEMO_CATALOG_ACK=isolated-local-only`, and accepts only PostgreSQL on `localhost` or `127.0.0.1`, port `15432`, database `planda`. Only the optional `schema=public` URL parameter is permitted. Never point this workflow at a shared database. Credentials are supplied through the existing local `DATABASE_URL`; do not put them in source control.

```sh
DEMO_CATALOG_ACK=isolated-local-only npm run demo:catalog
```

The command is not run by a normal build, startup or default seed. Running it is an explicit separate step. No database operation was performed to implement this script.

## Data and repeat runs

The script preserves the original names/slugs and owners of Seed Bosphorus, Seed Park, Seed Garden, Capital Vista, Capital Metro and Capital North. It adds illustrative cover photographs and an explicit DEMO notice. Their two default units and Plan A are aligned to the project's existing starting price/currency; corresponding seed broker prices are aligned too. Placeholder floor-plan links are cleared rather than replaced with invented floor plans.

Nine additional projects belong only to `demo-yapi` / “Demo Yapı (Demo)”: Avlu Evleri, Koruluk, Kıyı Teras, Zeytin Bahçesi, Liman Evleri, Nilüfer Konakları, Urla Taş Avlu, Mavi Yamaç and Kent Bahçesi. Every new name contains `(Demo)` and every summary starts with an explicit fictional/illustrative notice. The organization is not marked verified. The resulting default-seed catalog has 15 published projects across İstanbul, Ankara, İzmir, Muğla, Antalya and Bursa, with TRY/USD prices, varied construction states, known/unknown dates and 1+1 through 4+1 units. New projects have available, reserved and sold example units.

Every project has two available price points; the minimum matches its starting price. Demo plans use 40% down and 24 installments of 2.5%, totaling 100%. These are fictional examples, not affordability advice. No freshness timestamps are fabricated. New records have no fictional media file sizes, floor-plan URLs, verified developers, credentials or sales contacts.

Writes run in one serializable transaction with ownership checks. A missing/mismatched seed project, foreign `demo-yapi` organization or non-demo collision on a new project slug aborts without committing. Re-running updates the same stable project, unit and plan keys and does not add duplicates. No records are deleted; no user, password, role, membership, saved-project or lead tables are changed. Existing unrelated projects are left alone, so a nonempty test database may contain more than 15 total projects. Reset/disposal is deliberately not automated; retain the isolated database or discard its dedicated environment through the operator's normal process.

## Illustrative photography and attribution

Images were supplied from observed Unsplash photographs for this demo. They are not photographs of these fictional Turkish projects, and no location, ownership or endorsement claim is made. Five photos are reused across 15 projects. Remote image availability is an external dependency; the frontend's honest missing-image state remains available. No image files are downloaded into the repository.

- Maks Makarov: [photo page](https://unsplash.com/photos/gHW12U88exs), image ID `photo-1673350772389-8629363cf6ba`.
- Mathias Reding: [photo page](https://unsplash.com/photos/5g4f8TPjZMU), image ID `photo-1690221120099-7556a7f67fcc`.
- Joy: [photo page](https://unsplash.com/photos/S1d6cLEBGcps), image ID `photo-1685631107156-95098e83b730`.
- [Supplied Unsplash image](https://images.unsplash.com/photo-1534655610770-dd69616f05ff); photographer metadata was not supplied and is not invented here.
- Maks Makarov: [photo page](https://unsplash.com/photos/x33WfmLfZoU), image ID `photo-1673350474055-e62f5818fcfe`.

Image requests use `https://images.unsplash.com/<image-id>?auto=format&fit=crop&w=1200&q=85`. The applicable source is the [Unsplash license](https://unsplash.com/license); these are indicative stock photos, not evidence of any offered property. Review upstream photo terms/availability before any non-demo deployment. Hosting and email-provider setup are outside this task.
