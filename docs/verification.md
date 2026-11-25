# Verification results

## Release checks

Run `npm run check`, `npm test`, `npm run build`, and `npm run test:workflows`. The workflow runner uses `TEST_DATABASE_ADMIN_URL` and separates acceptance, receipt, role, accountant, browser, photo and mobile fixtures. Use `npm run test:accountant` for the accounting suite against a running isolated demo with `TEST_URL` and a `DATABASE_URL` ending in `_test`.

Check payroll lock and reopen, excess recovery and waiver, stock totals and CSV access. The mobile suite checks 320, 375, 390, 414 and 768 px in English and Arabic, runs automated accessibility checks, and verifies that browser Back preserves a draft when discard is declined. Before release, verify input focus on a physical iPhone in Safari and the native Back gesture on Android. Rehearse recovery in a separate database and attachment directory.

## Recorded checks

The audit-remediation build passed TypeScript, all four unit tests, the production build, and the seven isolated workflow suites on Windows. The photo suite used a JPEG fixture. The mobile suite ran in Edge with simulated phone and tablet viewports. A backup restored into a separate database with matching accounting totals and attachment hashes.

Verification ran on Windows with Next.js 16.4.6, Prisma 7.10.1, Better Auth 1.7.25, PostgreSQL 18.6 and Microsoft Edge.

| Check | Result |
| --- | --- |
| Initial migration and demo bootstrap | Applied on an isolated UTF-8 PostgreSQL database. |
| TypeScript, production build and unit tests | Passed. Four focused unit tests covered EGP precision, Cairo dates, role rules and attachment signatures. |
| Authenticated HTTP acceptance and receipt tests | Cover workshop validation, retired statuses, technician access, concurrent sales, transaction rollback, idempotent receipt replay, debt reconciliation, returns, reversals and salary advances. |
| Browser | Job creation and update, module navigation, simulated lost response and safe retry, 360 px layout, dark and light themes, and Arabic RTL passed. |
| A4 PDFs | Edge generated English and Arabic multipage invoices and receipts and verified A4 media boxes. Physical printer review remains pending. |
| Recovery | PostgreSQL dump and attachment archive restored to a new database in two seconds for the sample dataset. Document totals, allocations, cash, stock, payroll, audit counts and attachment hashes matched the source. |
| Dependency audit | The latest npm check reports a high-severity advisory in the Prisma dependency chain. Its suggested automatic fix is a major Prisma downgrade. |

Docker runtime verification requires a Docker host. Workshop device coverage, production-tier load testing, production monitoring, operator notification delivery, off-site replication and client review remain release checks. The [traceability checklist](traceability.md) records functional coverage and partial proposed items. The [decision register](business-rules.md#decisions-to-review) keeps approvals and defaults visible.

