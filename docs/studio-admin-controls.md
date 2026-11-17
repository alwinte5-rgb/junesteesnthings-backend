# Designer management in jtees admin

The customer gallery is `/shop-designs`; legacy `/design-ideas.html` and `/design-ideas` redirect there. `/admin/design-library` is the owner management page, with search, status/type/collection filters and 24 items per page. The customer gallery renders 48 items at a time.

`/admin/studio-controls` manages existing product names, descriptions, base prices, size/color labels and extras, defaults, availability, images and allowed decoration methods. Print-area previews support dragging and exact values, using the existing cross-colorway helper. `/admin/studio-controls?tab=pricing` edits existing decoration quantity ceilings, minimums and prices per location. Both surfaces write the existing Lumise records; no second price catalog is created. Product/method saves retain private pre-change snapshots and reject stale revisions.

Fonts have web (WOFF2) and PDF (TTF) attachments. New fonts stay disabled until both exist; originals are retained on replacement. PNG/JPEG artwork uploads start in draft. Mockups can be uploaded and their carousel order chosen per design without deleting source files. Per-design personalization switches further restrict bracketed text, photo slots and clipart recoloring; they do not unlock fixed artwork.

The clipart organizer adds useful category memberships from existing names, tags and categories; it retains existing memberships and artwork. The gallery reads its collection index, with manual collection choices taking precedence. Generic/ambiguous names are flagged for review. This categorization is a metadata-based first pass, not a claim that every image has been visually identified.

AI controls expose pause/resume, aggregate daily usage and a site attempt cap. The customer allowance remains five successful requests per Chicago day; failures release the customer allowance but consume the site cap. This is a request cap, not a dollar budget. No allowance identity hashes are exposed to the browser.

`/admin/design-requests` consolidates unquoted change requests and existing quote/art/proof states. It links to the existing assignment, files, messages, proofs and payment controls. It does not create duplicate job records or release work around the existing approval/payment gate. Library approval email respects notification preferences and shares the sweep's atomic email claim.

Validation includes authorization/refusal cases, query validation, upstream failure/conflict handling, exact cents, pagination across the full inventory, categorization, private storage and AI limits. Existing print-area regressions cover source preservation, scaled colorways, conflict refusal and idempotence. Actual font import in Affinity, unsupported decoration calculation types, and creating entirely new product structures remain manual/original-editor operations. Existing ready-made templates still need artwork-only previews before publication.

Implementation follows the existing Lumise category/reference tables and authenticated backend proxy. A search of GitHub and Reddit found compatible category-based Lumise integrations, but no suitable drop-in management extension for this standalone PHP installation. No new runtime dependencies or schema migrations were introduced.
