# Verified Nigerian academic structure catalogue

The academic structure catalogue is institution-specific. It stores faculties, schools, or colleges under their owning institution, then departments under the correct academic unit.

## Data rules

- Use only an institution already present in the Nigerian institution catalogue.
- Use the exact institution name as stored in `institutions.name`.
- Use the academic-unit name and type as published by the institution: `faculty`, `school`, or `college`.
- A record may omit `departmentName` when the official source confirms the academic unit but does not publish its departments on that source.
- Do not invent departments, borrow another institution's structure, or treat generic discipline lists as institution-specific.
- When a public directory is incomplete or inaccessible, students may enter their academic unit and full department name manually during onboarding. These profile values are not catalogue submissions and are not sent to moderators.
- Keep manual academic placement on the user profile only; do not insert it into `faculties`, `departments`, or `academic_catalogue_submissions`.
- Referral rewards remain pending until the institution → academic unit → department placement is independently present in the verified catalogue. An unlisted manual value does not create a moderator-review item.
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
| University of Port-Harcourt, Port-Harcourt | 16 | 74 | https://www.uniport.edu.ng/faculties/ and official faculty pages |
| University of Benin, Benin City | 17 | 41 | https://uniben.edu/academic-programmes.html and official faculty pages |
| Ahmadu Bello University, Zaria | 19 | 0 | https://abu.edu.ng/faculties/ and https://abu.edu.ng/schools-and-colleges/ |
| Bayero University, Kano | 19 | 0 | https://www.buk.edu.ng/instituitional_data |
| Federal University of Technology, Minna | 12 | 0 | https://staff.futminna.edu.ng/faculties |
| Federal University of Technology, Owerri | 10 | 0 | https://futo.edu.ng/schools |
| University of Abuja, Abuja | 14 | 0 | https://www.uniabuja.edu.ng/faculties |
| University of Maiduguri, Maiduguri | 18 | 0 | https://unimaid.edu.ng/Faculties.php |
| University of Jos, Jos | 19 | 0 | https://www.unijos.edu.ng/unijos-academics |
| University of Calabar, Calabar | 23 | 0 | https://unical.edu.ng/faculties.php |
| Federal University of Agriculture, Abeokuta | 11 | 0 | https://funaab.edu.ng/funaab-schedules-orientation-ict-training-for-2026-2027-fresh-students/ |
| Rivers State University of Science & Technology, Port Harcourt, Rivers State | 13 | 0 | https://www.rsu.edu.ng/faculties/ |

This is a verified starter batch, not a claim that all Nigerian institutions are populated. The staged file currently contains 636 source rows representing 266 academic units and 442 departments across 16 of the 769 production institutions. The production catalogue contains 328 universities, 199 polytechnics, and 242 colleges of education; the production audit found zero academic-unit and department records before this PR.

### Manual-entry fallback / intentionally omitted batches

- Federal University of Technology, Akure: the earlier homepage-only school list was not sufficient to verify the current academic hierarchy; the current schools portal was not reliably readable for a full reconciliation.
- Abubakar Tafawa Balewa University: the official page contains conflicting labels for the Education/Technology Education faculty and nested College of Medical Sciences faculties. Its units are omitted until the direct student-facing structure can be reconciled without flattening a parent and its child units.
- University of Calabar: 23 clearly student-facing academic units are staged. Ambiguous directory entries such as the library, non-academic listing, and institute-level entries are not treated as faculty destinations without further confirmation.
- Where the public directory is incomplete, inaccessible, or internally inconsistent, the student enters the exact academic unit and department during onboarding. No placeholder catalogue values are created and no moderator submission is generated.

The remaining institutions must be researched in batches from their own official websites, handbooks, directories, or prospectuses.

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
