# Open Academic Community Library — Implementation Contract

## Product outcome

Make approved academic material discoverable without an account, while allowing authenticated students and lecturers to contribute material to a moderated academic knowledge commons.

## Implemented backend foundation in this branch

- Student and lecturer roles can submit academic resources.
- Every new submission must include an explicit licence, attribution, and affirmative rights declaration.
- New submissions are forced into pending moderation; clients cannot publish directly.
- Public catalogue, detail, and temporary file-URL endpoints expose only approved resources with a recorded rights declaration.
- Public catalogue supports keyword, course, topic, institution, level, type, licence, pagination, and bounded page size.
- Contributors can use the existing own-submissions endpoint to inspect their review status.
- The schema migration adds licence, attribution, source URL, rights declaration, and declaration timestamp.
- Existing records are not automatically assigned an open licence. Their rights flag defaults to false and they remain excluded from the public catalogue until reviewed and explicitly updated.

## Licensing and rights

- Public visibility is not the same as an open licence.
- Supported licences: CC BY 4.0, CC BY-SA 4.0, CC0 1.0, and All Rights Reserved (view-only permission). The last option is not an open licence.
- Contributors must confirm that they own the material or have permission to share it.
- Attribution and optional source URL are retained with each resource.
- Do not relicense third-party lecture notes, textbooks, exam papers, or journal articles without authority.

## API surface added

- `GET /resources/public` — public paginated catalogue.
- `GET /resources/public/:id` — public approved resource metadata.
- `GET /resources/public/:id/file-url` — short-lived inline file URL for an approved resource.
- `POST /resources` — authenticated student/lecturer submission; requires licence, attribution, and `rightsConfirmed: true`.
- `GET /resources/mine` — authenticated student/lecturer contribution history.

## Remaining delivery sequence

1. Add reporting, takedown, moderation audit improvements, and structured question/answer records.
2. Update the frontend public library, resource detail, upload centre, licence selector, rights declaration, and contributor history screens.
3. Add end-to-end verification for visitor discovery, student and lecturer uploads, moderation, and file access.

## Security and acceptance requirements

- Unapproved, rejected, flagged, and legacy resources without an explicit rights declaration are not returned by public catalogue/detail/file endpoints.
- New submissions always enter pending review.
- Only authenticated student and lecturer roles may submit.
- Moderator/admin review permissions remain separate from contributor permissions.
- Storage URLs are not included in public resource metadata; file access uses short-lived presigned URLs.
- Do not treat public access as permission to redistribute or modify a resource.
