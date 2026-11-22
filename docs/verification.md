# Verification results

Verification ran on Windows with Next.js 16.4.6, Prisma 7.10.1, Better Auth 1.7.25, PostgreSQL 18.6 and Microsoft Edge.

| Check | Result |
| --- | --- |
| Initial migration and demo bootstrap | Applied on an isolated UTF-8 PostgreSQL database. |
| TypeScript, production build and unit tests | Passed. Four focused unit tests covered EGP precision, Cairo dates, role rules and attachment signatures. |
| Authenticated HTTP acceptance | 14 checks passed. Includes one winner in a concurrent last-unit sale, transaction rollback after an earlier stock change, idempotent receipt replay, debt reconciliation, return/refund/reversal, salary advance and direct technician permissions. |
| Browser | Job creation and update, module navigation, simulated lost response and safe retry, 360 px layout, dark and light themes, and Arabic RTL passed. |
| A4 PDFs | Edge generated English and Arabic multipage invoices and receipts and verified A4 media boxes. Physical printer review remains pending. |
| Recovery | PostgreSQL dump and attachment archive restored to a new database in two seconds for the sample dataset. Document totals, allocations, cash, stock, payroll, audit counts and attachment hashes matched the source. |
| Production dependency audit | No npm advisories reported at verification time. |

Docker runtime verification requires a Docker host. Workshop device coverage, production-tier load testing, production monitoring, operator notification delivery, off-site replication and client review remain release checks. The [traceability checklist](traceability.md) records functional coverage and partial proposed items. The [decision register](business-rules.md#decisions-to-review) keeps approvals and defaults visible.

