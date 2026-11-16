# June’s Tees design library

The existing jtees admin is the management surface at `/admin/design-library`. The canvas remains on design.jtees.net. This release uses the existing templates, clipart, saved designs, order/quote handoff, internal service key, notification table and persistent designer volume. It adds no database migrations or runtime dependencies.

## Customer workflow

- `/shop-designs` has Ready-Made Designs and Clipart tabs, collection/search controls, artwork-first cards, hover mockups, mobile swipe and explicit image controls. All links identify both the design and default product.
- Deep links skip automatic onboarding, tour, exit and lead-capture popups. Explicit quote/change-request actions remain available.
- Complete templates lock fixed artwork. Bracketed text uses personalization inputs. Photo placeholders use the existing replacement flow. Clipart geometry is locked while its existing recolor controls remain available.
- Request additional changes uses the existing quote submission, preserving design files and the requested changes in its notes. It does not start paid artwork work or bypass quote/payment approval.
- AI generation and edits share five successful requests per account per Chicago calendar day. Guests share an IP-based allowance. Atomic reservations bound simultaneous requests; failed generations release customer allowance, while the site spend cap still counts attempts.

## Owner workflow

- Filter drafts, submitted items, changes requested, live items and archived items. Save titles, collections, default products and featured selections.
- Existing screenshots remain mockups. For a template missing its artwork-only preview, open it and press **Prepare artwork preview**, then return to the dashboard.
- Templates can gain individual product pricing using **Enable individual product pricing**. This marks the same template record; it does not create another copy. Enter prices per offered product; blank restores default pricing. Overrides include front printing, preserve size/attribute and additional-location charges, and are authoritative rather than capped at a lower regular price.
- Publication requires an artwork preview and compatible active default product. Approval submissions create a dashboard notification and immediate transactional email; the existing hourly cron retries failed submission alerts up to eight attempts and reports continuing failure.
- Attach/download an original Affinity master through the owner-only dashboard. Replacements preserve the old master. Binary files and metadata are denied direct HTTP access.

## Source and PDF preservation

Original screenshots and source designs are not deleted or rewritten by the migration. New template promotions archive the complete original saved design, including all sides, before writing the promoted template. The existing template conversion still loads its first populated side; the archive preserves other sides for recovery, but does not automatically add them to a different product.

The existing SVG-to-PDFKit path exports separate supported text, vector and image objects into PDF. Physical dimensions are converted from print pixels to PDF points, unrequested margins are removed, and missing fonts produce an error. A flattened uploaded graphic remains a single image object. Affinity opening/editing, font variants and complex effects require a real designer-file check; the native Affinity master remains the most complete source.

## Validation and remaining release checks

Local regression checks cover gallery sanitization, owner authorization, invalid writes, private settings exclusion, notification validation, atomic five-request allowance including ten concurrent callers, failed generation refunds, private source storage, exact price parity, template locks, PDF dimensions/fonts and shared navigation. Existing artwork and preview rendering must also be checked with the shop’s authenticated real files. MySQL-only integration tests require `JT_TEST_MYSQL_PORT`; they are not claimed as passed without it.

This does not add design sales analytics, margin estimates, automatic retouching, or a new designer work queue. Existing paid-job and proof controls remain the workflow for actual design work.
