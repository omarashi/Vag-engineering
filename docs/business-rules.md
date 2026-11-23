# Business rules and working decisions

## Posting and storage

The application stores EGP as integer piastres. Stock quantities use three decimal places. Each extended line amount rounds half up to the nearest piastre before a fixed line discount. Posted lines retain prices, quantities, and applicable stock cost. Business date and time inputs use Africa/Cairo. PostgreSQL timestamps represent instants, and display formatting uses Cairo.

Every command checks a live, individual account and its role. Mutations share a short PostgreSQL transaction lock for the single branch. The request ID, affected data, audit event, and posting commit together. The application stores request IDs for retry lookup and rejects reuse with changed input. The stock database constraint requires on-hand to cover reservations. Version checks prevent stale updates to editable masters, appointments and job cards.

Stock reserves reduce availability, issues reduce on-hand, and returns add physical stock. A job invoice uses the latest approved quote and the cost of issued stock. Quoted and issued part quantities must reconcile before posting. Counter sales deduct stock at posting. Job status, delivery, invoice and payment history remain separate. Job cancellation requires previously issued stock and linked active receipts to be reconciled.

Stock intake and supplier invoice can post together. Purchase order receipt creates a linked purchase and requires a distinct supplier reference. Current part cost defaults to the last received or explicitly maintained value. Quantity-disposition movements and credits preserve original line linkage. Amount-only write-offs use a credit and require a reason. Cash/bank refunds are separate payments and require available refundable credit. Reversed payment cash entries offset the original movements, and reversing an allocated payment releases its current effect while preserving history.

Customer and supplier payments may allocate across eligible documents for the same party. An overpayment requires explicit credit approval. Unallocations and reversals require a reason. Expense recognition and payment are separate. Internal transfers create equal opposite account movements. Dashboard collections are net of customer refunds. Margin uses posted part-cost snapshots and credits for restocked items. It excludes labor payroll and operating expenses, which are reported separately.

Payroll uses separate employee and login records. Fixed, approved daily earnings, commissions, bonuses and deductions are entered as amounts. Deductions require a reason. Advances are a cash movement once and may be allocated against a pay period once per piastre. Opening advances use a distinct recovery entry with an amount limit. Finalized payroll changes are appended as linked corrections. Pay entries cannot create a negative remaining payable. Opening transactions are labeled and excluded from revenue, purchase volume, payroll earnings, and trading cash collections.

## Decisions to review

| ID | Working decision and owner review |
| --- | --- |
| OD-01 | Commercial budget, deadline and support terms are pending. |
| OD-02 | Docker on a single branch server or managed Linux host. Choose hosting, budget, operator and ownership before production. |
| OD-03 | English or Arabic chosen on each A4 preview. Cairo dates with configurable business date style for printing. |
| OD-04 | Supplied blue logo artwork, red references, Cupra rear and workshop photography. Production contact details remain blank until verified. |
| OD-05 | Technicians manage workshop jobs, customers and vehicles. Accountants manage sales, payments, cash, expenses and payroll. Only the owner can manage users, the service catalogue, business settings and employee dismissals. |
| OD-06 | Check in a car as a quick job or an extended stay. Finish the work before billing, and use a customer name for counter sales. |
| OD-07 | Manually entered daily earnings and commission, single recovery of advances, no negative payroll payable. Detailed payable-day and negative-balance policy remains open. |
| OD-08 | Integer piastres, half-up line rounding, operational financial reporting. Confirm period and accounting treatment before live posting. |
| OD-09 | Three-decimal quantities, no negative stock, receipt or maintained cost snapshots. Damaged returns can be recorded with no stock effect. Final costing and selling price authorization remain open. |
| OD-10 | A4 with selectable language and unique prefix sequences. Confirm actual printer, document layout and walk-in policy. |
| OD-11 | Internet-required. Weekly backups and four retained copies are provisional; confirm schedule, recovery objectives and data retention. |
| OD-12 | Manual opening entries and explicit finalization. Choose opening date and reconcile with paper records before live use. |
| OD-13 | Appointments are internal. Setmore integration requires a separate decision. |
| OD-14 | Private PDF/JPEG/PNG/WebP files up to 10 MiB. Confirm permitted formats, total capacity and retention. |

Attendance, barcode scanners, public commerce, native apps, multiple branches, automated offline sync, messaging/payment integration, ECU or dyno integration, statutory payroll and full general-ledger accounting remain excluded under X-01 through X-10.

