# Verified Nigerian academic structure catalogue

The academic structure catalogue is institution-specific. It stores faculties, schools, or colleges under their owning institution, then departments under the correct academic unit.

## Data rules

- Use only an institution already present in the Nigerian institution catalogue.
- Use the exact institution name as stored in `institutions.name`.
- Use the academic-unit name and type as published by the institution: `faculty`, `school`, or `college`.
- A record may omit `departmentName` when the official source confirms the academic unit but does not publish its departments on that source.
- Do not invent departments, borrow another institution's structure, or treat generic discipline lists as institution-specific.
- Every record must include the institution's official HTTPS website, an official source URL on that website or its subdomain, and a verification date within the last 365 days.
- The importer is additive: it inserts missing units/departments and refreshes provenance on exact matches. It does not rename or delete existing catalogue records or user profiles.

## Current verified batch

Checked against official institutional pages on 2026-11-10:

| Institution | Academic units | Departments | Official source |
|---|---:|---:|---|
| University of Lagos, Lagos | 19 | 99 | https://unilag.edu.ng/when-the-future-calls-unilag-answers-with-new-faculties-and-a-new-vision/ |
| University of Ibadan, Ibadan | 20 | 47 | https://ui.edu.ng/content/faculties-and-departments |
| University of Nigeria, Nsukka | 17 | 91 | https://www.unn.edu.ng/departments/ |
| University of Ilorin, Ilorin | 19 | 90 | https://www.unilorin.edu.ng/academics/ and official faculty pages |

This is a verified starter batch, not a claim that all Nigerian institutions are populated. The production catalogue currently contains 769 institutions: 328 universities, 199 polytechnics, and 242 colleges of education. The production audit currently finds zero academic-unit and department records across those institution categories. Remaining institutions must be researched in batches from their own official websites, handbooks, directories, or prospectuses.

## Record format

Each JSON row represents one academic unit, optionally with one department:

```json
[
  {
    "institutionName": "EXACT INSTITUTION NAME",
    "institutionWebsite": "https://www.example.edu.ng",
    "facultyName": "School of Engineering",
    "facultyType": "school",
    "departmentName": "Civil Engineering",
    "officialSourceUrl": "https://www.example.edu.ng/academics",
    "verifiedAt": "2026-11-10"
  },
  {
    "institutionName": "EXACT INSTITUTION NAME",
    "institutionWebsite": "https://www.example.edu.ng",
    "facultyName": "College of Health Sciences",
    "facultyType": "college",
    "officialSourceUrl": "https://www.example.edu.ng/academics",
    "verifiedAt": "2026-11-10"
  }
]
```

The second record creates the academic unit without asserting any department names.

## Safe execution

1. Review the source pages and exact institution-name matches.
2. Run a dry run first:

   `npm run import:academic-catalogue`

3. Review the institution/unit/department counts and any errors.
4. Apply only after the dataset and dry-run output have been reviewed:

   Git Bash:
   `ACADEMIC_CATALOGUE_APPLY=true ACADEMIC_CATALOGUE_CONFIRM_PRODUCTION=YES npm run import:academic-catalogue`

The importer independently requires `NODE_ENV=production`, `DB_SSL=true`, a `.neon.tech` database host, and `DB_DATABASE=neondb`. It disables TypeORM schema synchronization and automatic migrations. Do not run the apply command until the intended production Neon configuration is confirmed and the migration adding `faculties.unitType` has been deployed.
