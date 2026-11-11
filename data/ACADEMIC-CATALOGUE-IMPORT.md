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

Checked against official institutional pages on 2026-11-10 and 2026-11-11:

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
| University of Abuja, Abuja | 14 | 71 | https://www.uniabuja.edu.ng/faculty and individual faculty pages |
| University of Uyo, Uyo | 17 | 89 | https://uniuyo.edu.ng/academics and individual faculty pages |
| Ekiti State University, Ado-Ekiti | 11 | 27 | https://eksu.edu.ng/siwes/ and individual faculty pages |
| Federal University, Oye-Ekiti | 17 | 87 | https://fuoye.edu.ng/faculty-areas/ and individual faculty pages |
| University of Maiduguri, Maiduguri | 18 | 96 | https://unimaid.edu.ng/Faculties.php and individual faculty pages |
| Akwa Ibom State University, Ikot Akpaden | 15 | 5 | https://aksu.edu.ng/web/sitemap and official Faculty of Agriculture page |
| University of Jos, Jos | 19 | 0 | https://www.unijos.edu.ng/unijos-academics |
| University of Calabar, Calabar | 23 | 0 | https://unical.edu.ng/faculties.php |
| Federal University of Agriculture, Abeokuta | 11 | 0 | https://funaab.edu.ng/funaab-schedules-orientation-ict-training-for-2026-2027-fresh-students/ |
| Rivers State University of Science & Technology, Port Harcourt, Rivers State | 13 | 0 | https://www.rsu.edu.ng/faculties/ |

This is a verified starter batch, not a claim that all Nigerian institutions are populated. The staged file currently contains 1,071 source rows representing 326 academic units and 817 departments across 20 of the 769 production institutions. The production catalogue contains 328 universities, 199 polytechnics, and 242 colleges of education. Before this expansion branch, the production database contained 296 academic units and 620 departments across 17 institutions; these totals included existing records beyond the original source batch.

### Manual-entry fallback / intentionally omitted batches

- Federal University of Technology, Akure: the earlier homepage-only school list was not sufficient to verify the current academic hierarchy; the current schools portal was not reliably readable for a full reconciliation.
- Abubakar Tafawa Balewa University: the official page contains conflicting labels for the Education/Technology Education faculty and nested College of Medical Sciences faculties. Its units are omitted until the direct student-facing structure can be reconciled without flattening a parent and its child units.
- University of Abuja: 14 faculty units and 71 departments are now sourced from the university's individual faculty pages. Three faculty pages (Clinical Science, Law, and Veterinary Medicine) do not publish department names in the reviewed page content; no departments were invented for them.
- University of Uyo: 17 faculty units and 89 departments are staged from its official faculty pages and College of Health Sciences directory. The Management Sciences page conflicts on its department count, so no departments were imported for that faculty; Vocational Education has no published department list in the reviewed page. The College of Health Sciences parent itself is not duplicated as a separate selectable unit; its named student-facing faculties are represented directly.
- Ekiti State University: 11 faculty/college units and 27 departments are staged. Official pages were accessible for Agriculture, Engineering, Law and Science. Other faculty pages were inaccessible or did not provide complete directories; their departments are deliberately left for the onboarding manual-entry fallback. A newly announced Agriculture department awaiting accreditation was not included.
- Federal University, Oye-Ekiti: 17 academic units and 87 departments are staged from current official faculty pages. The university announced a new college system for October 2026. The current academic-unit schema stores units directly under institutions and cannot represent college-to-faculty parent relationships; the faculty and department records are retained, but the five parent-college groupings are not flattened into selectable units.
- University of Maiduguri: 96 departments are now sourced across 16 of its 18 existing academic units. The Communications and Media Studies faculty page is still being set up, and the Pharmacy directory does not publish its departments; those two units remain available for manual department entry rather than receiving guessed or partial department lists.
- Akwa Ibom State University: 15 faculties are staged from the current university sitemap; five Agriculture departments are confirmed by the current faculty page. The sitemap also lists a College of Health Sciences parent, but it is not flattened as an independent selectable unit because the current schema cannot represent its child-faculty relationship. Other faculty department directories remain incomplete in the reviewed sources and use the manual-entry fallback.
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
4. Feature-branch dry-runs can be launched from the GitHub Actions workflow using this branch; the workflow checks out the selected ref and still connects read-only to production during dry-run.
5. Production apply is permitted only from `main`, after the dataset and dry-run output have been reviewed:

   Git Bash:
   `ACADEMIC_CATALOGUE_APPLY=true ACADEMIC_CATALOGUE_CONFIRM_PRODUCTION=YES npm run import:academic-catalogue`

The importer independently requires `NODE_ENV=production`, `DB_SSL=true`, a `.neon.tech` database host, and `DB_DATABASE=neondb`. It disables TypeORM schema synchronization and automatic migrations. The GitHub Actions workflow allows dry-runs from feature branches but rejects production apply unless the selected ref is `main` and the exact confirmation phrase is supplied. Do not run the apply command until the intended production Neon configuration is confirmed and the migration adding `faculties.unitType` has been deployed.
