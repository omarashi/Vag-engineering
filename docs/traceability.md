# Traceability checklist

The [source requirements](requirements.md) define each ID. The implementation links below identify the main files. Checked items have a delivered application path or documented rule. Notes identify limited implementations and acceptance work. Open decisions remain listed in [business rules](business-rules.md#decisions-to-review).

## Operational requirements

| ID | Implementation | Validation or remaining work |
| --- | --- | --- |
| ✓ FR-ACC-01 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-ACC-02 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-ACC-03 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-ACC-04 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-ACC-05 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-ACC-06 | [lib/auth.ts](../lib/auth.ts) · [lib/permissions.ts](../lib/permissions.ts) | AT-10 and role unit checks |
| ✓ FR-CFG-01 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ✓ FR-CFG-02 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ◐ FR-CFG-03 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Catalogue values are editable. Vehicle make, model, tuning stage, and storage location remain free text in operational forms. |
| ✓ FR-CFG-04 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ✓ FR-CFG-05 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ◐ FR-CFG-06 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | EGP and Cairo time work throughout. The configured date format applies to printed documents. |
| ✓ FR-CFG-07 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ✓ FR-CFG-08 | [lib/masters.ts](../lib/masters.ts) · [lib/locale.ts](../lib/locale.ts) | Browser language, theme and Settings |
| ✓ FR-CUS-01 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-02 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-03 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-04 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-05 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-06 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-07 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-08 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-CUS-09 | [lib/masters.ts](../lib/masters.ts) · [components/records.tsx](../components/records.tsx) | AT-01, AT-11 and vehicle browser navigation |
| ✓ FR-APT-01 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | AT-01 and browser calendar |
| ✓ FR-APT-02 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | AT-01 and browser calendar |
| ✓ FR-APT-03 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | AT-01 and browser calendar |
| ✓ FR-APT-04 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | AT-01 and browser calendar |
| ✓ FR-APT-05 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | AT-01 and browser calendar |
| ◐ FR-APT-06 | [lib/workshop.ts](../lib/workshop.ts) · [components/modules.tsx](../components/modules.tsx) | Open. Setmore remains a separate system. |
| ✓ FR-JOB-01 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ◐ FR-JOB-02 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | Job data are captured. The original arrival date, title and mileage are kept as entered. |
| ✓ FR-JOB-03 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-04 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-05 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-06 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-07 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-08 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-09 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-10 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ✓ FR-JOB-11 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | AT-01, AT-03 and browser create/update |
| ◐ FR-JOB-12 | [lib/workshop.ts](../lib/workshop.ts) · [lib/stock.ts](../lib/stock.ts) | Tuning notes and attachments work. Follow-up and dyno entries are text or dates with no automatic reminders. |
| ✓ FR-INV-01 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-02 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-03 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-04 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-05 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-06 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ✓ FR-INV-07 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ◐ FR-INV-08 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | Low stock is visible and inventory can be filtered by category. Supplier filtering is pending. |
| ✓ FR-INV-09 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | AT-03, AT-04, AT-06, AT-07 and AT-08 |
| ◐ FR-INV-10 | [lib/stock.ts](../lib/stock.ts) · [lib/trade.ts](../lib/trade.ts) | Open. Receipt-based cost snapshots and a negative-stock block are development defaults. |
| ✓ FR-PUR-01 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ✓ FR-PUR-02 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ✓ FR-PUR-03 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ◐ FR-PUR-04 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | Receiving and supplier liability post atomically in one operation. |
| ✓ FR-PUR-05 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ✓ FR-PUR-06 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ✓ FR-PUR-07 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | AT-07 and purchasing browser navigation |
| ◐ FR-PUR-08 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | Purchases support attachments and supplier history. Part history shows purchase movements. |
| ◐ FR-PUR-09 | [lib/trade.ts](../lib/trade.ts) · [components/modules.tsx](../components/modules.tsx) | Draft order and linked receipt work. Editable order revisions and staged partial intake are pending. |
| ✓ FR-SAL-01 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-02 | [lib/trade.ts](../lib/trade.ts) · [lib/visit-billing.ts](../lib/visit-billing.ts) · [components/bill-items.tsx](../components/bill-items.tsx) | [Visit billing](../tests/receipts.mjs) checks separate service and parts prices. [Browser verification](../tests/browser.mjs) checks those prices and service details on both the invoice and receipt in English and Egyptian Arabic A4 print. |
| ◐ FR-SAL-03 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | Posted and reversed invoices plus linked credits are supported. Draft invoice editing is pending. |
| ✓ FR-SAL-04 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-05 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-06 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-07 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-08 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-09 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-10 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-SAL-11 | [lib/trade.ts](../lib/trade.ts) · [lib/cash.ts](../lib/cash.ts) | AT-02, AT-03, AT-05, AT-08, AT-11 and A4 |
| ✓ FR-BAL-01 | [lib/cash.ts](../lib/cash.ts) · [lib/customer-debt.ts](../lib/customer-debt.ts) · [components/customer-debt.tsx](../components/customer-debt.tsx) | AT-02, AT-07, AT-08 and AT-12. The [receipt and debt tests](../tests/receipts.mjs) cover manual payments without due dates, oldest-first allocation across vehicles and opening balances, reprints, overpayment, and reversals. |
| ✓ FR-BAL-02 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | AT-02, AT-07, AT-08 and AT-12 |
| ✓ FR-BAL-03 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | AT-02, AT-07, AT-08 and AT-12 |
| ✓ FR-BAL-04 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | AT-02, AT-07, AT-08 and AT-12 |
| ◐ FR-BAL-05 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | Statement shows dated entries, references and allocation links; current running balances reconcile. |
| ◐ FR-BAL-06 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | Due dates and overdue labels work. A dedicated overdue-only register is pending. |
| ✓ FR-BAL-07 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | AT-02, AT-07, AT-08 and AT-12 |
| ✓ FR-BAL-08 | [lib/cash.ts](../lib/cash.ts) · [lib/views.ts](../lib/views.ts) | AT-02, AT-07, AT-08 and AT-12 |
| ✓ FR-CASH-01 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-CASH-02 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-CASH-03 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-CASH-04 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-CASH-05 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-CASH-06 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ◐ FR-CASH-07 | [components/modules.tsx](../components/modules.tsx) | Transactions are available from Cash & expenses. The manual cash count was retired. |
| ✓ FR-CASH-08 | [lib/cash.ts](../lib/cash.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02, AT-07, AT-08 and AT-09 |
| ✓ FR-PAY-01 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-02 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-03 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ◐ FR-PAY-04 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | Fixed, daily and manual commission amounts are entered. Explicit separately entered days are pending. |
| ✓ FR-PAY-05 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-06 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-07 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-08 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-09 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ✓ FR-PAY-10 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | AT-09, AT-10 and AT-12 |
| ◐ FR-PAY-11 | [lib/cash.ts](../lib/cash.ts) · [components/records.tsx](../components/records.tsx) | Open. Manual amounts and single application of advances are development defaults. |
| ✓ FR-REP-01 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02 statement export and browser Reports |
| ✓ FR-REP-02 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02 statement export and browser Reports |
| ✓ FR-REP-03 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | AT-02 statement export and browser Reports |
| ◐ FR-REP-04 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | Registers, line reports, statements and ledgers are available. Dedicated overdue and aggregated service reports are pending. |
| ◐ FR-REP-05 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | Sales margin uses retained stock cost. Job-specific margin reporting is pending. |
| ◐ FR-REP-06 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | Date, party, employee, status and category filters exist on applicable registers. Filter coverage varies by report. |
| ◐ FR-REP-07 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | Posted totals and current balances are distinct. Historical as-of reconciliation across all period boundaries remains unverified. |
| ◐ FR-REP-08 | [lib/views.ts](../lib/views.ts) · [components/modules.tsx](../components/modules.tsx) | Report CSV and print are available. CSV exports the selected page. |
| ✓ FR-AUD-01 | [lib/transaction.ts](../lib/transaction.ts) · [components/modules.tsx](../components/modules.tsx) | AT-05, AT-06 and AT-11 |
| ✓ FR-AUD-02 | [lib/transaction.ts](../lib/transaction.ts) · [components/modules.tsx](../components/modules.tsx) | AT-05, AT-06 and AT-11 |
| ✓ FR-AUD-03 | [lib/transaction.ts](../lib/transaction.ts) · [components/modules.tsx](../components/modules.tsx) | AT-05, AT-06 and AT-11 |
| ✓ FR-AUD-04 | [lib/transaction.ts](../lib/transaction.ts) · [components/modules.tsx](../components/modules.tsx) | AT-05, AT-06 and AT-11 |
| ✓ FR-AUD-05 | [lib/transaction.ts](../lib/transaction.ts) · [components/modules.tsx](../components/modules.tsx) | AT-05, AT-06 and AT-11 |
| ✓ FR-OPS-01 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | AT-12 and local migration |
| ◐ FR-OPS-02 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | Opening review and finalization work. Paper reconciliation requires the workshop's opening data. |
| ✓ FR-OPS-03 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | AT-12 and local migration |
| ◐ FR-OPS-04 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | Full PostgreSQL and attachment backup are provided. Report CSV covers listed transaction views. Bulk master CSV is pending. |
| ◐ FR-OPS-05 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | Backup and alert scripts are provided. Production scheduler, off-site replication and alert delivery are pending. |
| ◐ FR-OPS-06 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | Backup restored to a clean PostgreSQL database and reconciled in the Windows rehearsal. |
| ◐ FR-OPS-07 | [docs/operations.md](../docs/operations.md) · [lib/cash.ts](../lib/cash.ts) | Open. Paper data can be entered through opening records. |

## User needs

| IDs | Application screens and validation |
| --- | --- |
| UR-01, UR-02, UR-10, UR-11 | Overview, Invoices, Cash and Balances. AT-02, AT-07, AT-08. |
| UR-03, UR-04, UR-05, UR-06, UR-07 | Workshop jobs, global search, Customers and Vehicles. Quotations were retired. AT-01, AT-03, AT-10, AT-11. |
| UR-08, UR-09 | Inventory, movement history, job part issue, counter sales. AT-03, AT-04, AT-06. |
| UR-12, UR-13 | Employees, payroll and bilingual A4 documents. AT-09, AT-10, AT-13. |
| UR-14, UR-15 | Branded bilingual responsive shell and Docker/TLS deployment guide. Hosted access pending. |
| UR-16, UR-17, UR-18 | Opening balances, CSV and full export, retry status. AT-05, AT-12, AT-14 and AT-15. |

## Posting rules

| IDs | Implementation and validation |
| --- | --- |
| BR-01, BR-02, BR-03 | [Transactional dispatcher](../lib/transaction.ts), [stock ledger](../lib/stock.ts), AT-04 through AT-06 and AT-15. |
| BR-04, BR-15 | [Piastre and decimal rules](../lib/rules.ts), rounding unit test. |
| BR-05, BR-08 | [Allocations, cash and reversals](../lib/cash.ts), AT-02, AT-07, AT-08. |
| BR-06, BR-07 | [Job stock](../lib/stock.ts) and [cancellation](../lib/workshop.ts), AT-03. |
| BR-09, BR-14 | [Snapshots](../lib/documents.ts) and [archival](../lib/masters.ts), AT-11. |
| BR-10, BR-11, BR-13 | [Payroll and advances](../lib/cash.ts), AT-09, AT-10. |
| BR-12 | [Ledger summary and statement queries](../lib/views.ts), AT-02 and AT-12. |

## Non-functional requirements

| ID | Item | Verification |
| --- | --- | --- |
| NFR-01 | Phone layout | Browser at 360 px; actual devices pending |
| NFR-02 | Browser coverage | Desktop Edge exercised; other physical browsers pending |
| NFR-03 | Usability | Edge workflows; workshop acceptance pending |
| NFR-04 | Themes and imagery | English dark and Arabic light inspected |
| NFR-05 | WCAG 2.2 AA | Form labels and focus styling; formal audit pending |
| NFR-06 | Routine performance | Production-equivalent load test pending |
| NFR-07 | Reporting performance | Production-equivalent load test pending |
| NFR-08 | Concurrency and atomicity | AT-04 and AT-06 |
| NFR-09 | Security | Auth, permission and dependency checks; production proxy controls pending |
| NFR-10 | Attachments | Protected attachment test |
| NFR-11 | Privacy | Role/API tests and private file download |
| NFR-12 | Availability | Host and monitor pending |
| NFR-13 | Backups | Scripts and retention documented; scheduled verification pending |
| NFR-14 | Recovery | Clean PostgreSQL restore verified. Production-host rehearsal pending. |
| NFR-15 | Connectivity | AT-05, AT-15 and browser lost-response case |
| NFR-16 | Concurrent edits | Version checks in services; concurrent edit scenario requires workshop review |
| NFR-17 | Maintainability | Server modules and repeatable Prisma migration |
| NFR-18 | Testability | Unit and authenticated HTTP suite |
| NFR-19 | Deployment | Production build; Docker runtime requires staging verification |
| NFR-20 | Monitoring | Health route and backup wrapper; production alert validation pending |
| NFR-21 | Portability | PostgreSQL dump, files and CSV procedures |
| NFR-22 | Localization | Browser layout and Cairo date unit checks |
| NFR-23 | Printing | Browser A4 proofs; physical printer pending |
| NFR-24 | Cost control | Budget and tier pending |
| NFR-25 | Scale | Production-equivalent headroom test pending |

## Acceptance

| ID | Scenario | Verification |
| --- | --- | --- |
| AT-01 | Customer/vehicle/appointment/job links | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-02 | Partial EGP receipts, amount due and statement | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-03 | Reserve, issue, invoice with no double deduction | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-04 | Two users selling the last unit | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-05 | Duplicate payment replay and single cash entry | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-06 | Atomic failure after first stock update | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-07 | Purchase, partial supplier payment and duplicate-reference block | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-08 | Credit, separate refund, refund reversal and stock reversal | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-09 | Manual commission, deduction, allocated advance and pay lock | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-10 | Technician reads payroll and API denies deduction and export | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-11 | Ownership and price changes preserve historical values | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-12 | Separate opening and operating balances | Passed in the [HTTP acceptance suite](../tests/acceptance.mjs) |
| AT-13 | English/Arabic, themes, 360 px, multipage A4 | Edge browser suite; hardware acceptance pending |
| AT-14 | Full restore into an empty environment | Passed in the [isolated local rehearsal](verification.md). |
| AT-15 | Status lookup and retry after interrupted response | HTTP suite and browser retry |
| AT-16 | Production-equivalent five-user load | Pending production-equivalent load test |

CTX-01 through CTX-22 are reflected in the requirements, implementation plan and decision register. X-01 through X-10 remain excluded. OD-01 through OD-14 are tracked in the decision register.

