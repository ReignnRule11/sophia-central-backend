# Open Academic Community Library — Implementation Contract

## Product outcome

Make approved academic material discoverable without an account, while allowing authenticated students and lecturers to contribute material to a moderated, reusable academic knowledge commons.

This is an implementation contract for the staged feature. It does not claim that the capabilities below are already implemented.

## User journeys

1. A visitor opens the public library, searches by keyword, discipline, course, institution, level, material type, and year, then opens or downloads an approved resource.
2. An authenticated student or lecturer submits notes, past questions, worked answers, slides, projects, or research material with academic metadata and a rights declaration.
3. A submission remains private/pending until a moderator approves it. Rejected or flagged material is not publicly discoverable.
4. A community member reports copyright infringement, plagiarism, personal data, or unsafe content. Moderators can hide material while investigating and record the resolution.
5. Approved question-and-answer material is indexed as structured content so it can be searched independently of an uploaded document.

## Licensing and rights

- Public visibility is not the same as an open licence. Each resource must carry an explicit rights state.
- Require the contributor to confirm they own the material or have permission to share it.
- Support explicit licence choices: CC BY 4.0, CC BY-SA 4.0, CC0 1.0, and “All rights reserved / view-only permission” as distinct choices. The last choice must not be represented as open-licensed.
- Store attribution/author, source, licence identifier, licence URL, and rights declaration timestamp.
- Do not permit a contributor to relicense third-party lecture notes, textbooks, exam papers, or journal articles without authority.
- Provide a takedown/report path and preserve an audit record of moderation actions.

## Backend delivery sequence

### Phase 1 — Resource rights and student contribution
- Extend resource metadata with licence, attribution, source, rights declaration, visibility, and moderation state where not already represented.
- Permit authenticated student and lecturer accounts to submit resources; do not broaden moderator/admin powers or bypass approval.
- Enforce ownership on edits/deletes and keep all public reads restricted to approved/public records.
- Validate upload ownership, file metadata, allowed types, size limits, and storage access at the server boundary.
- Add migration and service/controller tests for student submission, lecturer submission, unauthorized roles, pending visibility, and approval.

### Phase 2 — Public discovery API
- Expose unauthenticated read-only catalogue/search/detail/download access for approved public resources only.
- Add pagination, stable sorting, and filters for discipline, institution, course, level, type, year, and licence.
- Ensure unapproved, private, rejected, or hidden resources cannot leak through search, detail, counts, or download URLs.

### Phase 3 — Community knowledge records
- Add structured past-question and answer records linked to resources and academic metadata.
- Track contributor, source/provenance, review state, and revision history.
- Keep answers searchable and accessible without requiring a PDF download.

### Phase 4 — Trust and moderation
- Add resource reports, moderation queue actions, audit history, and takedown workflow.
- Add plagiarism/copyright review status; automated similarity checks may assist moderators but must not make final legal determinations.
- Add rate limits and abuse controls for submissions and reports.

### Phase 5 — Frontend and release verification
- Build public library, resource detail, upload centre, contributor profile/attribution, and moderation screens in the frontend repository.
- Verify visitor access, student and lecturer uploads, moderation, licensing display, search filters, downloads, and report/takedown flows end to end.
- Run migrations against a fresh test database and the existing migration chain; run unit, integration, authorization, and CI checks before deployment.

## Acceptance criteria

- Visitors can browse and download only approved public resources without signing in.
- Students and lecturers can submit resources after authentication.
- New submissions are pending by default and are never publicly visible before approval.
- Every public resource displays contributor attribution and an explicit rights/licence label.
- A resource marked “All rights reserved” is clearly distinguished from CC-licensed/open material.
- Unauthorized users cannot approve, publish, hide, or modify another contributor's resources.
- Search, resource detail, and download endpoints enforce the same visibility policy.
- Moderation and rights changes are auditable.
- Automated tests cover positive and negative authorization paths, especially student submissions and public data leakage.

## Open technical decisions to resolve during implementation

- Confirm the existing Resource entity and migration history before adding columns; avoid duplicate fields for moderation or visibility that already exist.
- Confirm the frontend's current resource API contract before changing response shapes.
- Confirm the configured object-storage provider and existing upload limits before changing file handling.
- Confirm whether institution/course taxonomies are normalized tables or currently free-text fields; preserve compatibility until a migration plan is agreed.

## Non-goals for the first release

- Automatically declaring all uploaded content open-licensed.
- Hosting pirated textbooks, paid course packs, or copyrighted exam papers without permission.
- AI-generated answers presented as authoritative or as a substitute for lecturer review.
- Anonymous uploads or anonymous moderation actions.
