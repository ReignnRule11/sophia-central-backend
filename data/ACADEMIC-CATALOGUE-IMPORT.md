# Verified Nigerian faculty and department catalogue

This importer intentionally ships with an empty dataset. Do not populate it with guessed, generated, scraped-from-aggregators, or unverified academic structures.

Each JSON record represents one department and must contain:

- `institutionName`: exact name of an institution already present in the Nigerian institutions catalogue.
- `institutionWebsite`: the institution's official HTTPS website.
- `facultyName`: faculty as named by the institution.
- `departmentName`: department as named by the institution.
- `officialSourceUrl`: an official page or official document on the institution's domain that confirms the faculty and department.
- `verifiedAt`: date the record was checked, in ISO date form (`YYYY-MM-DD`).

Example schema (illustrative only; do not import this example as real catalogue data):

```json
[
  {
    "institutionName": "EXACT UNIVERSITY NAME",
    "institutionWebsite": "https://www.example.edu.ng",
    "facultyName": "FACULTY NAME AS PUBLISHED",
    "departmentName": "DEPARTMENT NAME AS PUBLISHED",
    "officialSourceUrl": "https://www.example.edu.ng/official-academic-page",
    "verifiedAt": "2026-11-05"
  }
]
```

The importer rejects non-HTTPS links, source links outside the institution's website domain, stale verification dates (older than 365 days), duplicate records, and institutions not found in the existing Nigerian catalogue. Approved faculty and department rows also retain the official source URL and verification date in the database, so moderators can audit where catalogue entries came from and when they were last checked.

## Current verified batch

The initial checked-in batch covers the University of Lagos catalogue record (`University of Lagos, Lagos`) with 19 faculties and 99 departments, based on the university's official 2025 restructuring notice. The source was rechecked on 2026-11-10. Other institutions remain unpopulated in this import file until their current official academic structures have been verified; do not infer completeness from the frontend candidate list.

## Safe execution

1. Populate the JSON file only from current official university pages/documents and manually verify each source.
2. Run a dry run first:

   `npm run import:academic-catalogue`

3. Review the counts and any errors. Dry run always rolls back and writes nothing.
4. Only after reviewing the dataset and dry-run output, apply inserts to the intended Neon production database:

   Git Bash:
   `ACADEMIC_CATALOGUE_APPLY=true ACADEMIC_CATALOGUE_CONFIRM_PRODUCTION=YES npm run import:academic-catalogue`

The script independently requires `NODE_ENV=production`, `DB_SSL=true`, a `.neon.tech` database host, and `DB_DATABASE=neondb`. It disables TypeORM schema synchronization and automatic migrations. It inserts only missing faculties/departments and never renames or deletes existing records, institutions, courses, or user profiles.

This pipeline validates the shape and provenance metadata supplied in the file; it does not automatically prove that a human has correctly interpreted the university's published structure. Keep the source review step. The moderator review panel also requires an official HTTPS source URL and a verification date within the last 365 days before approving a faculty or department submission. Institution submissions remain subject to their own recognition review.
