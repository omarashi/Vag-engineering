# VAG Engineering ERP Requirements

Version 1.1 | 17 November 2026 | Prepared for Omar and VAG Engineering

## 1 Purpose and requirement status

This document defines the working requirements for a customized internal ERP for VAG Engineering. It brings together the information supplied in the project conversation, publicly listed services, proposed implementation rules, and decisions still to be made. It provides a starting point for design, development, and acceptance testing; it is not a fixed-price contract or a claim that every proposed detail has been approved.

Status labels used throughout:

- **C Confirmed**: explicitly stated by Omar, including his latest corrections.
- **P Proposed**: a recommended behavior or measurable target needed to make the agreed modules concrete. These are working defaults, subject to revision.
- **O Open**: not decided; it must not be silently treated as an agreed requirement.
- **X Excluded**: explicitly excluded from the current project or not included in the current baseline.

The requested modules are all in scope. Development stages describe implementation order, not removal of modules from the required system.

## 2 Information gathered

| ID | Detail | Status |
|---|---|---|
| CTX-01 | Business name is VAG Engineering, a car tuning and maintenance business focused on Volkswagen Group vehicles. | C |
| CTX-02 | One branch and approximately 10 employees, with small changes in employee count expected. | C |
| CTX-03 | Expected simultaneous system use is approximately one or two people. | C |
| CTX-04 | User roles are owner, accountant, and technician. Employees may exist as payroll records without needing login accounts. | C for roles; P for separate employee and login records |
| CTX-05 | Internet is available at the branch. Computers are the primary devices; phone access is also needed. | C |
| CTX-06 | Access from outside the workshop should be supported; owner remote access was described as a possible use. | P based on stated use |
| CTX-07 | Dark and light themes are required, with dark as the main theme. | C |
| CTX-08 | Use VAG Engineering's existing visual identity with Volkswagen Group car imagery, plus dark and light themes. Exact colors and approved brand assets are still to be obtained. | C and O |
| CTX-09 | Customers and vehicles, workshop jobs, inventory, purchases and suppliers, sales and invoicing, debts, expenses and cash, employees and salaries, reports, and appointments are all required modules. | C |
| CTX-10 | Vehicle records should include plate, model, year, tuning stage, and mileage, with additional optional fields. Whether each initial field is mandatory at creation is open. | C and O |
| CTX-11 | Parts can be sold separately from workshop jobs. Barcodes and barcode scanners are not required. | C |
| CTX-12 | Payment and debt tracking are needed in Egyptian pounds (EGP). Detailed formal accounting and financial-statement requirements have not been established. | C and O |
| CTX-13 | Employee pay uses a mixture of arrangements. Commissions are entered manually as amounts, without automatic commission formulas. Attendance is excluded. Owner and accountant can enter salary deductions. | C |
| CTX-14 | There is no special owner-only category of private information. Owner, accountant, and technicians may view all business information. Editing authority remains separate. | C |
| CTX-15 | Printed invoices and receipts shall use A4 for the initial version. The actual printer model is unknown; additional formats are not currently required. | C for initial A4; O for hardware |
| CTX-16 | Existing operations are recorded on paper. No existing digital database or import file has been supplied. | C |
| CTX-17 | This project is an internal ERP. A public marketing website, online store, and customer portal are outside the current scope. | C |
| CTX-18 | Development budget, recurring hosting budget, delivery deadline, opening date, outage behavior, and approved workflow remain open. No date has been set. | O |
| CTX-19 | The supplied Setmore page lists performance parts installation, maintenance, tuning, and dyno testing. Its service catalogue can inform initial job categories. | Public source; P for ERP catalogue |
| CTX-20 | Setmore is already a separate public booking page. Automatic synchronization with it has not been requested or approved. | Public source; O for integration |
| CTX-21 | Both English and Arabic are required, including correct left-to-right and right-to-left interface layouts. | C |
| CTX-22 | Omar asked about weekly recovery. The working interpretation is an automated backup every week, with restoration only when needed. Weekly frequency is provisional because it was asked as a question. | P pending confirmation |

### Business references

- Instagram: https://www.instagram.com/vagengineering/
- Facebook: https://www.facebook.com/VAGEngineerin/
- Booking page: https://vag-engineering.setmore.com/
- Company profile reviewed during discovery: https://www.linkedin.com/company/vag-engineering

The booking page supplied readable service information. Instagram could not be retrieved reliably and Facebook returned an access restriction, so exact brand colors and a full visual identity have not been verified. Published contact details, opening hours, and addresses must be confirmed with the client before being used in invoices or settings. The company profile describes ECU and TCU calibration and diagnostics, which support optional tuning-specific records; it does not create a requirement for direct vehicle hardware integration.

## 3 Scope boundaries

### Included modules

Internal appointments; customer management; vehicle management and service history; workshop job cards and quotations; service catalogue; technicians and job assignments; inventory; parts counter sales; suppliers and purchases; sales invoices and receipts; customer and supplier debts; deposits and partial payments; returns and refunds; expenses; cash and bank account tracking; employee compensation and payments; dashboards and reports; document printing; settings; permissions; change history; opening balances; backups and recovery.

### Excluded from the current baseline

- **X-01** Attendance, biometric devices, and employee check-in tracking.
- **X-02** Barcode generation and scanning.
- **X-03** Public marketing pages, online checkout, public booking development, and customer accounts or portals.
- **X-04** Separate native Android, iOS, and desktop applications.
- **X-05** Multiple branches and cross-branch stock transfers.
- **X-06** Automatic offline writing and multi-device synchronization.
- **X-07** Automatic Setmore synchronization, messaging campaigns, WhatsApp or SMS automation, and payment gateway integration.
- **X-08** Direct ECU flashing, vehicle diagnostics, CAN communication, and automatic dyno-machine integration. Recording notes or attachments is included as a proposal.
- **X-09** Full double-entry accounting and automatic statutory payroll calculations until their precise requirements are established.
- **X-10** Automatic commission formulas, commission percentages, and rule-based commission recognition. Users enter the commission amount manually.

Except for explicit exclusions such as attendance and barcodes, these boundaries can be revisited through a scope decision. They should not be assumed to be hidden deliverables.

## 4 Users and proposed permissions

Every user receives an individual account. The expected one or two simultaneous users is a usage estimate, not a reason to share accounts.

| Capability | Owner | Accountant | Technician | Status |
|---|---|---|---|---|
| View business modules, reports, balances, employee pay records, and documents | Yes | Yes | Yes | C |
| Add salary deductions | Yes | Yes | No | C |
| Create and update customer and vehicle records | Yes | Yes | Proposed yes | P |
| Create and update job cards, work notes, and job status | Yes | Yes | Proposed yes | P |
| Post financial transactions and receive or issue payments | Yes | Proposed yes | Proposed no | P |
| Post purchases, inventory adjustments, or financial reversals | Yes | Proposed yes | Proposed no | P |
| Calculate pay and record salary payments | Yes | Proposed yes | Proposed no | P |
| Manage user accounts, permissions, and system configuration | Proposed yes | Proposed limited settings | Proposed no | P |
| Initiate a data restore or change the restore policy | Proposed yes | Proposed no | Proposed no | P |

All proposed edit permissions require review. The application must enforce the eventual permissions on the server for both page access and direct API requests. Any permission granted later must also be recorded in the change history.

## 5 User requirements

| ID | User requirement | Status |
|---|---|---|
| UR-01 | The owner needs an overview of workshop activity, money received and paid, debts, stock, and employee amounts payable. | P derived from C modules |
| UR-02 | The accountant needs to record purchases, sales, payments, expenses, salary transactions, and the balances they produce. | P derived from C modules |
| UR-03 | Technicians need to view customers, vehicles, jobs, service history, parts information, and other business records allowed by the confirmed visibility rule. | C and P |
| UR-04 | Technicians should be able to update their work notes and job progress without accidentally changing financial postings. | P |
| UR-05 | Users need to find customers and cars quickly using name, phone, plate, or job number. | P |
| UR-06 | Users need one history for each vehicle covering visits, maintenance, modifications, tuning, and related documents. | P |
| UR-07 | Users need to prepare an estimate and turn approved work into a traceable job and invoice. | P |
| UR-08 | Users need to know what parts are available and which parts were purchased, installed, sold, returned, or adjusted. | P |
| UR-09 | Users need to sell parts over the counter without requiring a vehicle or workshop job. | C |
| UR-10 | Users need to see what each customer owes, including partial payments and deposits. | C |
| UR-11 | Users need to see supplier invoices and amounts still owed to suppliers. | C through required modules |
| UR-12 | Owner and accountant need to manage mixed employee pay, type commission amounts manually, enter deductions, and track payments and remaining amounts. | C |
| UR-13 | Users need professional branded invoices, receipts, and account statements. | C for invoices and receipts; P for statements |
| UR-14 | Users need English and Arabic layouts on workshop computers and phones, with dark and light themes, VAG Engineering branding, and Volkswagen Group car imagery. | C |
| UR-15 | Authorized users should be able to work from outside the branch through a secure internet connection. | P |
| UR-16 | Users need to transfer starting paper balances into the system without manufacturing past sales or distorting new-period results. | P |
| UR-17 | The owner needs business data to be exportable and recoverable after a device, application, or hosting failure. | P |
| UR-18 | Users need clear errors and protection against duplicate submissions or lost changes. | P |

## 6 Proposed operational workflows

### 6.1 Workshop visit

Find or create customer and vehicle; open a job card; record complaint and mileage; inspect; prepare a versioned quotation; record approval; assign technicians; reserve and issue parts; record work; complete quality check if used; finalize the invoice; record payment or credit balance; record delivery; retain the vehicle history.

Proposed job states: New, Inspecting, Awaiting approval, Approved, In progress, Waiting for parts, Ready, Delivered, Cancelled. Completion, delivery, invoice status, and payment status are separate facts. A delivered vehicle can still have an unpaid invoice. Status names and required transitions remain open for client review.

### 6.2 Parts counter sale

Find or create customer when needed; select parts; validate available stock; apply permitted prices and discounts; finalize sale; reduce stock; record payment or allowed credit; print invoice and payment receipt. A vehicle and job card are optional. Whether anonymous cash sales are allowed is open.

### 6.3 Purchase and supplier payment

Select supplier; record purchase information; receive actual quantities; record supplier invoice; post the receipt and payable without duplicating stock; record one or more payments; allocate payments to supplier invoices; retain remaining balance. The first version may combine receipt and invoice in one screen while keeping the underlying effects distinct.

### 6.4 Employee pay period

Select employee and period; record applicable fixed or daily earnings; type the commission amount manually; add bonuses or deductions; apply eligible advances once; record partial or full salary payments; retain the amount due or carried forward. The application totals the entered amounts but does not calculate commissions from percentages, sales, job completion, or collections. A commission may optionally reference a job or invoice. Daily pay, if used, requires manually entered approved payable days because attendance is excluded. Advance recovery and daily-pay details remain open.

### 6.5 Paper record transition

Choose an opening date; enter active customers, vehicles, suppliers, and employees; enter starting stock with quantities and costs; enter outstanding customer and supplier items; enter cash and bank balances; enter unpaid employee amounts and outstanding advances; review totals against paper records; authorize opening entries; begin new transactions from the opening date.

## 7 Functional system requirements

Each requirement is testable. C indicates an explicit requested capability; P defines proposed behavior for implementing it. These details should be reviewed before financial posting and payroll rules are finalized.

### 7.1 Accounts and permissions

- **FR-ACC-01 [C]** The system shall support owner, accountant, and technician roles.
- **FR-ACC-02 [P]** The system shall support individual login, logout, session expiry, account deactivation, and administrator-assisted account recovery.
- **FR-ACC-03 [C]** All three roles shall be able to view all business information; no special owner-only information category shall be implemented.
- **FR-ACC-04 [P]** The system shall enforce separate permissions for viewing, creating, editing, posting, reversing, exporting, and administration.
- **FR-ACC-05 [C]** Only the owner and accountant roles shall be able to enter salary deductions under the current permission rule.
- **FR-ACC-06 [P]** The system shall retain historical attribution when a user is deactivated and shall prevent removal of the last active owner account.

### 7.2 Configuration and service catalogue

- **FR-CFG-01 [P]** Authorized users shall configure business name, logo, contact details, address, invoice footer, and document numbering.
- **FR-CFG-02 [P]** The system shall support an editable catalogue of maintenance, tuning, parts-installation, dyno, and additional services with default prices and descriptions.
- **FR-CFG-03 [P]** The system shall provide configurable vehicle makes, models, tuning-stage values, expense categories, payment methods, and storage locations.
- **FR-CFG-04 [C]** The system shall provide dark and light themes, with dark as the initial default and a saved user preference.
- **FR-CFG-05 [P]** The system shall keep document sequences unique and protect finalized document numbers from reuse.
- **FR-CFG-06 [C/P]** All monetary records, totals, balances, and reports shall use Egyptian pounds (EGP). Proposed working precision is two decimal places, with a documented rounding policy. Date formats remain configurable.
- **FR-CFG-07 [C]** The interface shall support English and Arabic with a language switcher, saved preference, translated navigation, labels, validation, statuses, and system-generated messages. User-entered notes are not automatically translated.
- **FR-CFG-08 [C/P]** The interface shall use VAG Engineering's visual identity and include Volkswagen Group car imagery. Proposed placements include the login screen, dashboard, and vehicle pages; imagery shall preserve the readability and speed of operational screens. Exact brand assets remain to be supplied or verified.

### 7.3 Customers and vehicles

- **FR-CUS-01 [C]** The system shall create, view, update, search, and archive customer records.
- **FR-CUS-02 [P]** Customer records shall include name, phone, optional alternative contact details, and notes; potential duplicate phones or names shall be surfaced for review.
- **FR-CUS-03 [P]** The system shall link multiple vehicles to one customer and allow a reviewed ownership change without rewriting historical invoice ownership.
- **FR-CUS-04 [C]** Vehicle records shall provide plate, model, year, tuning stage, and mileage fields.
- **FR-CUS-05 [P]** Optional vehicle details shall include make, VIN, engine code, transmission, modifications, photos, and notes.
- **FR-CUS-06 [P]** The system shall show a chronological vehicle history with jobs, quotations, invoices, recorded mileage, tuning-stage changes, and attachments.
- **FR-CUS-07 [P]** Users shall search customers and vehicles by name, phone, plate, VIN when present, and associated document number.
- **FR-CUS-08 [P]** Mileage readings shall include their dates; a reading below a previous reading shall produce a warning with a documented correction or explanation path.
- **FR-CUS-09 [P]** Archiving shall preserve historical jobs, invoices, payments, and statements.

### 7.4 Appointments

- **FR-APT-01 [C]** The system shall provide an internal appointment calendar.
- **FR-APT-02 [P]** Appointments shall record date, time, expected duration, customer, optional vehicle, requested service, notes, and optional assigned technician.
- **FR-APT-03 [P]** Appointment status shall support scheduled, arrived, completed, cancelled, and no-show.
- **FR-APT-04 [P]** Users shall be able to create a job card from an appointment without re-entering the customer and vehicle.
- **FR-APT-05 [P]** The system shall warn about overlapping assignments while allowing an authorized override.
- **FR-APT-06 [O]** Automatic Setmore synchronization is undecided and shall not be assumed in the initial implementation.

### 7.5 Quotations and workshop jobs

- **FR-JOB-01 [C]** The system shall create numbered job cards linked to a customer and vehicle.
- **FR-JOB-02 [P]** A job card shall record complaint, requested work, arrival date, mileage when known, inspection findings, notes, attachments, and assigned technicians.
- **FR-JOB-03 [P]** Job lines shall distinguish labor, services, stocked parts, and customer-supplied parts. Customer-supplied parts shall not reduce workshop stock or create a workshop part purchase cost.
- **FR-JOB-04 [P]** Users shall prepare quotations with quantities, EGP prices, discounts, validity, and notes.
- **FR-JOB-05 [P]** The system shall record quotation versions and approval method, date, recorder, and approved amount. Additional approved work shall retain a change record.
- **FR-JOB-06 [P]** Job status shall be independently tracked from quotation approval, delivery, invoicing, and payment status.
- **FR-JOB-07 [P]** Authorized users shall assign one or more technicians and record work completion. A manually entered commission may optionally reference the relevant job or technician assignment.
- **FR-JOB-08 [P]** The system shall support stock reservation, actual part issue, and unused-part return with traceable links to the job.
- **FR-JOB-09 [P]** An issued part shall not be deducted again when the related invoice is finalized.
- **FR-JOB-10 [P]** Job cancellation shall release unused reservations and require reconciliation of already-issued parts and received payments.
- **FR-JOB-11 [P]** Authorized users shall convert billable job lines into an invoice while preserving the job, customer, vehicle, and line references.
- **FR-JOB-12 [P]** The system shall support optional maintenance follow-up date or mileage, ECU/TCU notes, tuning-stage changes, and before/after dyno figures or graph attachments. Direct machine communication is excluded.

### 7.6 Inventory

- **FR-INV-01 [C]** The system shall manage parts that can be consumed in jobs or sold separately without barcode scanning.
- **FR-INV-02 [P]** Part records shall include an internal code, name, category, unit, optional OEM number, brand, cost, selling price, minimum level, and optional compatibility notes and storage location.
- **FR-INV-03 [P]** The system shall maintain a stock movement ledger covering opening stock, receipts, sales, job issues, returns, and authorized adjustments.
- **FR-INV-04 [P]** The system shall separately display on-hand, reserved, and available quantities.
- **FR-INV-05 [P]** Concurrent stock deductions shall be validated transactionally; available stock shall not become negative unless an explicitly approved policy is configured.
- **FR-INV-06 [P]** The system shall support fractional quantities for suitable units such as litres, using configured quantity precision.
- **FR-INV-07 [P]** Adjustments and stock counts shall record reason, quantity difference, user, and date.
- **FR-INV-08 [P]** Low-stock items shall be visible in a report or dashboard and filterable by category or supplier.
- **FR-INV-09 [P]** Each sold or issued part shall retain the applicable cost snapshot according to the selected costing policy, so later price changes do not rewrite historical margins.
- **FR-INV-10 [O]** The costing method, treatment of damaged parts, price overrides, and any negative-stock exception remain open.

### 7.7 Suppliers and purchasing

- **FR-PUR-01 [C]** The system shall manage suppliers and purchase records.
- **FR-PUR-02 [P]** Supplier records shall include name, contacts, optional address, reference information, and statement history.
- **FR-PUR-03 [P]** Purchase documents shall record supplier, supplier invoice reference, dates, line items, quantities, EGP unit costs, discounts, and total.
- **FR-PUR-04 [P]** Receiving quantities and recording a supplier invoice shall update stock and supplier liabilities once, even if the same purchase is edited or retried.
- **FR-PUR-05 [P]** Purchases shall support paid, partially paid, and unpaid balances, with multiple allocated payments and optional due dates.
- **FR-PUR-06 [P]** The system shall support supplier returns and credits, including an explicit stock disposition and the resulting payable or supplier-credit adjustment.
- **FR-PUR-07 [P]** Duplicate supplier invoice references shall produce a warning or configured blocking rule.
- **FR-PUR-08 [P]** Authorized users shall be able to attach supplier documents and view purchase history by supplier or part.
- **FR-PUR-09 [P]** The system shall support a simple draft purchase order and later receipt/invoice linkage; the exact ordering workflow may be simplified after client review.

### 7.8 Sales invoices and receipts

- **FR-SAL-01 [C]** The system shall support invoices for workshop jobs and independent parts sales.
- **FR-SAL-02 [P]** Invoice lines shall distinguish parts, labor, and other services and retain descriptions, quantities, EGP prices, discounts, and totals.
- **FR-SAL-03 [P]** The system shall distinguish draft, posted, credited or reversed documents. Payment status shall be calculated separately from payments and allocations.
- **FR-SAL-04 [P]** Posted invoices shall receive a unique number, retain relevant customer and business detail snapshots, and resist silent historical edits.
- **FR-SAL-05 [C]** The system shall record full payments, deposits, partial payments, and remaining customer debt.
- **FR-SAL-06 [P]** Receipts shall represent actual money received, record method and cash/bank destination, and reference their allocation. Issuing an invoice alone shall not create a cash receipt.
- **FR-SAL-07 [P]** The system shall support separate payment records for different methods or dates and allocation across one or more customer invoices.
- **FR-SAL-08 [P]** Returns, credit notes, and refunds shall preserve the original invoice reference and separately record stock and money effects. A credit note shall not automatically imply that cash has been refunded.
- **FR-SAL-09 [C/P]** The system shall print branded A4 invoices and receipts; users shall be able to reprint without creating another sale or payment. Proposed document language selection is English or Arabic with the appropriate layout.
- **FR-SAL-10 [P]** Printable documents shall include document number, issue date, parties, relevant vehicle reference, line details, totals, payment summary, and amount due where applicable.
- **FR-SAL-11 [P]** Duplicate requests or repeated clicks shall not create duplicate invoices, stock deductions, receipts, or refunds.

### 7.9 Balances and payment allocation

- **FR-BAL-01 [C]** The system shall show customer amounts owed and supplier amounts payable.
- **FR-BAL-02 [P]** Balances shall derive from posted opening entries, invoices, credits, payments, and allocations, rather than an independently editable balance field.
- **FR-BAL-03 [P]** The system shall distinguish invoice amounts due from unapplied customer or supplier credits and shall prevent accidental double allocation.
- **FR-BAL-04 [P]** A payment exceeding an invoice balance shall be rejected or explicitly recorded as an unapplied credit; excess money shall not disappear or silently change the invoice total.
- **FR-BAL-05 [P]** Customer and supplier statements shall list dated transactions, references, amounts, allocations, and a running balance.
- **FR-BAL-06 [P]** Debt reports shall distinguish all outstanding balances from overdue balances; overdue status requires a recorded due date.
- **FR-BAL-07 [P]** Adjustments, write-offs, unallocations, and payment reversals shall require suitable permission, a reason, and a full audit trail.
- **FR-BAL-08 [P]** Opening debts shall be identifiable as opening entries, with separate opening items or invoice references when available.

### 7.10 Expenses and cash accounts

- **FR-CASH-01 [C]** The system shall record operating expenses and movements of money.
- **FR-CASH-02 [P]** Expense records shall include category, date, amount, payee when known, description, attachment, and payment status.
- **FR-CASH-03 [P]** The system shall distinguish an expense or payable from the subsequent payment that settles it, preventing duplicate expense recognition.
- **FR-CASH-04 [P]** Users shall track one or more cash or bank accounts, payment methods, opening balances, incoming money, outgoing money, and transfers.
- **FR-CASH-05 [P]** Internal transfers shall move money between accounts without counting as sales or expenses.
- **FR-CASH-06 [P]** Salary payments, supplier payments, refunds, and receipts shall link to their corresponding cash/bank movement once.
- **FR-CASH-07 [P]** The system shall support a daily money-movement summary and a manual closing count with a recorded variance and explanation.
- **FR-CASH-08 [P]** Owner contributions and withdrawals shall be recorded separately from trading revenue and operating expenses.

### 7.11 Employees and compensation

- **FR-PAY-01 [C]** The system shall manage approximately 10 employees with room to add more, independently from login accounts.
- **FR-PAY-02 [C]** The system shall accommodate mixed pay arrangements and shall not require attendance records.
- **FR-PAY-03 [P]** Employee records shall include name, contact information, active dates, pay arrangement, rate history with effective dates, and optional notes.
- **FR-PAY-04 [C/P]** Per-period earnings shall support applicable fixed salary or manually approved payable days, manually entered commission amounts in EGP, bonuses, deductions, and carried balances. The system shall total the entered amounts and shall not automatically calculate commission amounts.
- **FR-PAY-05 [C]** Owner and accountant shall be able to enter a salary deduction with amount and reason. Changes shall retain attribution and history.
- **FR-PAY-06 [P]** Advances and partial salary payments shall be recorded with dates, periods or recovery links, amounts, payment methods, and cash/bank accounts.
- **FR-PAY-07 [P]** The system shall show earned amount, adjustments, settled advances, payments, and remaining amount for each employee and period without counting an advance twice.
- **FR-PAY-08 [C/P]** Owner and accountant shall be able to type an employee's commission amount in EGP for a pay period, with an optional note and optional job or invoice link. The system shall retain the recorder and timestamp, prevent duplicate submissions, and audit corrections. No commission formula or automatic recognition event shall apply.
- **FR-PAY-09 [P]** Finalized pay periods shall be protected from silent edits. Corrections shall retain the original entries and traceable adjustments.
- **FR-PAY-10 [P]** The system shall produce a printable employee payment statement and salary-payment acknowledgment or receipt.
- **FR-PAY-11 [O]** Payable-day rules where used, advance recovery, correction of finalized pay, and treatment of negative balances require decisions. Manually entered commissions require no percentage or recognition-rule setup.

### 7.12 Dashboard and reporting

- **FR-REP-01 [C]** The system shall provide dashboard and reporting capabilities for the required modules.
- **FR-REP-02 [P]** The dashboard shall show open jobs by status, appointments, low stock, customer debt, supplier debt, and employee amounts payable.
- **FR-REP-03 [P]** Financial summaries shall separately identify invoiced sales, money collected, money paid, unpaid amounts, credits, costs, and expenses for a selected period.
- **FR-REP-04 [P]** Reports shall cover sales by service or part, purchase history, stock on hand, stock movements, customer and supplier statements, outstanding and overdue balances, expenses, cash movements, and employee pay.
- **FR-REP-05 [P]** Job and sales margin reports shall use recorded cost snapshots and disclose the costing basis. Any operating result report shall state its included expenses and period basis.
- **FR-REP-06 [P]** Reports shall support applicable date, customer, supplier, employee, category, and status filters, with drill-down to source documents.
- **FR-REP-07 [P]** Report totals shall reconcile to their underlying posted records, exclude drafts, and reflect reversals consistently.
- **FR-REP-08 [P]** Authorized users shall export tabular reports as CSV and use printable views or PDFs for documents and statements. A dedicated Excel workbook export can be added if needed.

### 7.13 Audit history and document integrity

- **FR-AUD-01 [P]** The system shall record actor, timestamp, action, affected record, and appropriate before/after values for material business changes.
- **FR-AUD-02 [P]** Audit history shall cover login administration, prices, stock changes, approvals, postings, payment allocations, reversals, deductions, pay periods, and opening entries.
- **FR-AUD-03 [P]** Posted financial and stock records shall be corrected through traceable reversal or adjustment, not unlogged hard deletion.
- **FR-AUD-04 [P]** Historical documents shall preserve their relevant transaction values even when master records or current prices change.
- **FR-AUD-05 [P]** Ordinary application users shall not be able to edit audit entries. Hosting administrators' technical database access shall be treated separately from business permissions.

### 7.14 Opening data and operations

- **FR-OPS-01 [P]** The system shall provide controlled entry of starting stock and costs, customer debts, supplier debts, cash/bank balances, employee balances, and outstanding advances at a selected opening date.
- **FR-OPS-02 [P]** Authorized users shall review opening totals and finalize them with an audit entry. Later corrections shall remain traceable.
- **FR-OPS-03 [P]** Opening balances shall not be counted as new-period sales, purchases, cash receipts, or employee earnings.
- **FR-OPS-04 [P]** The system shall export core master data and transaction records in documented formats.
- **FR-OPS-05 [P]** Automated backup jobs shall provisionally run weekly, record success or failure, and notify the designated operator after failure. This creates recoverable copies; it does not restore or overwrite live data every week. Final frequency and the designated backup day/time remain open.
- **FR-OPS-06 [P]** A controlled restore procedure shall exist for the complete database and stored attachments, with post-restore checks and audit records where feasible.
- **FR-OPS-07 [O]** Spreadsheet import is optional pending discovery of usable source files; initial paper entry is sufficient for the current migration assumption.

## 8 Cross-module business rules

All rules below are proposed implementation safeguards unless they restate a confirmed decision.

1. **BR-01 Atomic posting**: an invoice posting and its required stock and financial entries succeed together or fail together. A later payment is a separate transaction with its own consistent entries.
2. **BR-02 Safe concurrency**: simultaneous requests cannot both consume the same final unit of available stock. Database validation and locking or suitable transaction isolation must enforce this.
3. **BR-03 Safe retry**: posting requests, payment requests, reversals, and imports use unique request or document references so a retry cannot repeat the business effect.
4. **BR-04 Monetary precision**: money uses fixed precision decimal values or integer minor units with one documented rounding policy. Binary floating-point arithmetic is not the authoritative basis for totals.
5. **BR-05 Payment allocation**: one payment may settle several invoices, and an invoice may be settled by several payments. Allocation totals cannot exceed the available payment amount.
6. **BR-06 Stock issue timing**: part reservations do not reduce on-hand stock. Actual issues do. Invoicing previously issued job parts must not deduct stock again.
7. **BR-07 Stock return timing**: cancelling a draft or unused reservation does not create received stock; returned physical goods require an explicit return or reversal path.
8. **BR-08 Separate credits and refunds**: a credit changes the amount owed; a refund records money leaving the business. Their linkage must be visible.
9. **BR-09 Historical values**: price changes, employee rate changes, and vehicle-owner changes do not rewrite posted historical values.
10. **BR-10 Employee advances**: an advance is either an allocated pay payment or a separately tracked recoverable amount under the selected policy. It cannot be subtracted through both paths.
11. **BR-11 Manual commissions**: owner or accountant enters the commission amount directly. A job status change, payment, credit, or cancellation shall not automatically calculate, add, or alter it. Authorized corrections require a traceable manual entry.
12. **BR-12 Honest reporting**: invoiced revenue, collected cash, gross margin, and an operating result are distinct measures. The user interface shall label them accordingly.
13. **BR-13 No attendance dependency**: compensation inputs shall work without attendance records. Manual payable days require explicit approval if daily rates are used.
14. **BR-14 Deactivation**: master records with history are archived or deactivated rather than deleted in a way that breaks old documents.
15. **BR-15 Single currency**: customer balances, supplier balances, stock costs, quotations, invoices, expenses, and employee entries shall use EGP; automatic exchange conversion is outside the current baseline.

## 9 Non-functional system requirements

These are proposed acceptance targets, not measured results or existing service guarantees. The hosting tier and final data volume must be chosen before they become delivery commitments.

| ID | Category | Proposed requirement and how to verify it |
|---|---|---|
| NFR-01 | Responsive design | Core lookup, job update, payment, and document-view tasks shall work at 360 px phone width and typical desktop widths. Wide tables may scroll within their container; primary actions must remain reachable. |
| NFR-02 | Browser support | Test the core flows on current Chrome and Edge on Windows, Chrome on Android, and Safari on iPhone, with the actual workshop devices included in acceptance testing. |
| NFR-03 | Usability | Consistent navigation, visible save/post states, meaningful labels, keyboard-friendly forms, sensible search, and confirmation for irreversible business actions. At least one owner/accountant and one technician representative shall complete relevant acceptance scenarios. |
| NFR-04 | Themes and imagery | Both themes shall preserve readable text, clear statuses, and visible focus. Use the business visual identity and Volkswagen Group car imagery, with optimized image sizes and operational content kept readable. Do not encode paid/unpaid or job status using color alone. |
| NFR-05 | Accessibility | Target WCAG 2.2 AA for core workflows, including contrast, labels, keyboard navigation, and focus order. This is an implementation target requiring verification, not a certification claim. |
| NFR-06 | Response times | With five concurrent active test users, 10,000 customer/vehicle records in total, 5,000 parts, 50,000 business documents, and 100,000 stock/financial movement records, routine reads and searches should complete within 2 seconds at the 95th percentile and posting within 3 seconds, measured at the server on the selected production-equivalent tier. Uploads and large exports are excluded. |
| NFR-07 | Reporting performance | Ordinary date-filtered operational reports should complete within 5 seconds at the 95th percentile on the same dataset. Large exports should show progress or run as background work without blocking ordinary use. |
| NFR-08 | Data integrity | Use database transactions, constraints, referential integrity, and concurrency checks for financial and stock mutations. Run simultaneous-request and failure-injection tests for critical posting paths. |
| NFR-09 | Security | Use HTTPS, maintained authentication components, protected sessions, server-side input validation, rate limits, and server-enforced permissions. Session secrets and database credentials must not be exposed to browsers or committed to source control. |
| NFR-10 | Attachments | Validate file type and size, use non-executable storage and authorization checks, and reject unsafe uploads. Proposed initial limit is 10 MB per attachment; allowed formats and total storage budget remain open. |
| NFR-11 | Privacy | Require authentication for business data, avoid sensitive values in application logs, and enforce the agreed visibility rule without inventing owner-only fields. Full database exports and backups must be access controlled. |
| NFR-12 | Availability | Initial planning target is 99.5 percent monthly service availability excluding planned maintenance and failures of the workshop internet. This is a design target, not an SLA; monitoring and recovery costs must be reflected in hosting choice. |
| NFR-13 | Backup frequency | Provisional interpretation of the latest request: automated weekly database and attachment backups, with an independent off-site copy and at least four weekly restore points proposed. Weekly backups can leave almost seven days of changes absent from the latest copy. Daily backups plus a weekly independent copy remain a recommendation, not a confirmed requirement. Frequency, retention, and day/time must be finalized. |
| NFR-14 | Recovery | Restore only when recovery is needed; never automatically overwrite live data on a weekly schedule. A weekly-only backup baseline can imply almost seven days of lost changes. Proposed recovery time remains 4 hours after an operator begins work. Verify a full restore before launch and at least quarterly. Operator coverage and acceptable data loss remain open. |
| NFR-15 | Network failure | In the initial internet-required baseline, connection failure shall be clearly shown and unsent changes preserved or clearly identified where feasible. The interface must never falsely show an unconfirmed posting as complete. Offline posting and synchronization are not included. |
| NFR-16 | Concurrent edits | Detect material stale-record conflicts or prevent conflicting updates, rather than silently overwriting a second user's work. |
| NFR-17 | Maintainability | Keep business rules in modular server-side services, separate from screen components; document schema, posting rules, deployment, backup, and restore procedures. Use version control and repeatable migrations. |
| NFR-18 | Testability | Automate critical cases for permissions, stock concurrency, invoice totals, payment allocation, returns, salary advances, and reversals. Use representative end-to-end flows for acceptance. |
| NFR-19 | Deployment | Maintain separate development/test and production configurations. Back up before production migrations and provide a documented rollback or recovery path. A rollback must not discard valid later business data without an explicit recovery decision. |
| NFR-20 | Monitoring | Record application errors and backup/deployment status, provide a basic health check, and alert a designated operator to failures. Logs must include useful correlation references without leaking credentials. |
| NFR-21 | Portability | Provide complete PostgreSQL export, attachment export, documented data structure, and a reproducible deployment. Data export shall not require manual copying from each screen. Source ownership and handover terms remain contractual decisions. |
| NFR-22 | Localization | Deliver both English LTR and Arabic RTL interfaces, with translated system text and saved language preference. Keep vehicle identifiers, phone numbers, OEM codes, and mixed-language content readable in both layouts. Store timestamps consistently, display business dates in Africa/Cairo, and format monetary values as EGP with language-appropriate presentation. |
| NFR-23 | Printable documents | Use A4 as the initial invoice and receipt size, with readable branding, accurate EGP totals, long-name wrapping, and multi-page handling. Proposed English and Arabic print templates shall handle their respective directions. The printer model remains unknown; verify physical output when it is available. |
| NFR-24 | Cost control | Document infrastructure, backups, file storage, monitoring, and maintenance costs. Select a hosting setup with clear quotas and alerts against a budget agreed before production. No cost ceiling is yet approved. |
| NFR-25 | Scale | Support the current branch and proposed five-user test headroom without introducing distributed services. Growth beyond the agreed test volume shall trigger measurement and capacity review rather than an untested scalability promise. |

## 10 Data requirements

### Main record types

User, role, permission, employee, compensation arrangement history, pay period, earnings entry, manual commission entry, deduction, advance, salary payment, customer, supplier, vehicle, ownership history, mileage reading, modification record, appointment, service, job card, job assignment, work note, quotation, quotation version, approval, part, category, unit, location, stock reservation, stock movement, purchase order, goods receipt, purchase invoice, purchase return, sales invoice, sales line, credit note, payment, payment allocation, refund, cash/bank account, money movement, expense, opening entry, attachment, audit event, business setting, document sequence, backup execution record.

Some record types may share an implementation table or be simplified after workflow review. They describe business concepts, not a mandated schema.

### Relationship and validation rules

- A customer can have multiple vehicles, jobs, invoices, and payments.
- A vehicle can have many visits and mileage/tuning records, and its current owner may differ from a historical invoice customer.
- A job can have many lines, technicians, quotations, part movements, and attachments.
- A part can have many purchase, stock, sales, and job-use references.
- Customer payments and supplier payments must not be allocated across unrelated parties without an explicitly recorded transfer or correction.
- Financial values use EGP and the documented precision and rounding policy. Multi-currency processing is outside the current baseline.
- Phone numbers and plates must allow local formats; VIN is optional but validated when entered. Plate uniqueness and temporary/unregistered-vehicle behavior require review.
- Required-at-creation fields shall be agreed explicitly. Unknown tuning stage or missing optional vehicle information must not force fabricated values.
- Audit timestamps and document dates have different purposes and must be preserved correctly.
- Required retention periods and deletion policy remain open; the default is to preserve posted business records and archive master records.

## 11 Working technical recommendation

The following is the current recommendation, not a client-approved technology contract:

| Layer | Proposed choice | Purpose |
|---|---|---|
| Application | Next.js with React and TypeScript | Responsive internal web app and server-side request handling in one project. |
| UI | Tailwind CSS and shadcn/ui | Custom VAG Engineering visual design, reusable forms/tables, and themes. |
| Business logic | Modular server-side services inside the application | Keep posting, inventory, payments, and payroll rules centralized and independently testable. |
| Database | PostgreSQL | Relational records, transactions, constraints, reporting, and portable backup. |
| Database access | Prisma | Schema migrations and typed database access, with explicit transaction and concurrency design. |
| Authentication | Better Auth | Account/session management plus application-defined permissions. |
| Hosting | Linux deployment using Docker; VPS or managed database option | Support remote access with a production budget chosen after scope review. |
| Files | Private attachment storage and independent backups | Store photos, invoice scans, and dyno attachments separately from public site assets. |
| Delivery | Responsive web app; optional installable PWA presentation | One browser-based system. Installation does not imply offline transaction support. |

The current scale does not justify microservices, Kubernetes, separate mobile applications, or a dedicated desktop wrapper. Hardware printing needs may change that assessment. If full accounting becomes a launch requirement, reassess an ERPNext and Frappe HR foundation before committing to a custom financial engine.

Earlier indicative infrastructure budgets were approximately USD 15 to 35 per month for a small self-managed VPS setup with separate backups, or USD 35 to 60 for app hosting plus managed PostgreSQL. These are provider-cost estimates, not quotations; final costs depend on backup retention, storage, monitoring, operator coverage, and the performance target. No client budget has been approved. These infrastructure estimates do not change the application's EGP business currency.

## 12 Acceptance scenarios

These examples use illustrative EGP amounts. They define expected behavior; they are not live financial data.

| ID | Scenario | Expected result | Related requirements |
|---|---|---|---|
| AT-01 | Create customer, vehicle, appointment, and then a job from that appointment. | Links are preserved and customer/vehicle details are not duplicated unnecessarily. | FR-CUS, FR-APT, FR-JOB |
| AT-02 | Finalize a 10,000 invoice, receive 4,000, then 2,000. | Invoice amount due is 4,000; collected cash is 6,000; statement and reports agree. | FR-SAL, FR-BAL, FR-REP |
| AT-03 | Enter stock of 5 units, reserve 2 for a job, issue 2, then invoice those issued parts. | After reservation on-hand is 5 and available is 3. After issue on-hand is 3. Invoicing does not deduct another 2. | FR-JOB-08/09, FR-INV-03/04 |
| AT-04 | Two users attempt to sell the final available unit simultaneously. | One succeeds and one receives a stock conflict; stock does not become negative. | FR-INV-05, BR-02 |
| AT-05 | Repeat a payment submission after a connection timeout. | Exactly one payment and one corresponding money movement exist. | FR-SAL-11, BR-03 |
| AT-06 | Force a failure between invoice posting and stock update. | No incomplete invoice/stock/financial posting remains. | BR-01, NFR-08 |
| AT-07 | Record a 12,000 supplier invoice and pay 5,000. | Supplier amount payable is 7,000 and cash/bank outflow is 5,000; stock receipt is recorded once. | FR-PUR, FR-CASH |
| AT-08 | Create a credit note for a returned part, then issue the refund separately. | Customer balance, stock disposition, and cash outflow reflect their distinct events exactly once. | FR-SAL-08, FR-BAL |
| AT-09 | In one pay period, record EGP 8,000 base earnings, manually enter EGP 1,000 commission, enter a 500 deduction, and allocate a 2,000 payment to that period. | Remaining payable is EGP 6,500. No commission is calculated automatically. If the 2,000 was an advance, it is not subtracted a second time. | FR-PAY, BR-10/11 |
| AT-10 | A technician calls the salary-deduction endpoint directly. | Server rejects the mutation. The same technician can view the salary records under the confirmed visibility rule. | FR-ACC-03/05 |
| AT-11 | Change a current part price, employee rate, or vehicle owner after historical posting. | Historical document values and their original party attribution remain intact. | FR-AUD-04, BR-09 |
| AT-12 | Enter opening customer debt, supplier debt, stock, and employee balances. | Opening balances appear correctly without inflating current-period sales or earnings. | FR-OPS-01/03 |
| AT-13 | Switch between English LTR and Arabic RTL, use phone layout and both themes, and print a long A4 invoice and receipt in the selected document language. | Translation and layout are correct; mixed-language identifiers remain readable; EGP totals and printed lines are not clipped; car imagery does not obscure core actions. | FR-CFG-07/08, NFR-01/04/22/23 |
| AT-14 | Restore a backup into a clean test environment. | Customer balances, stock, payroll records, audit history, and attachments match the selected backup; recovery duration is recorded. | FR-OPS-06, NFR-13/14 |
| AT-15 | Lose connectivity during posting. | The UI identifies uncertainty and checks the existing posting before retrying; it neither claims false success nor creates a duplicate. | NFR-15, BR-03 |
| AT-16 | Run the proposed performance dataset and five-user workload. | Recorded response times meet the approved targets, or hosting/query design is revised before claiming compliance. | NFR-06/07/25 |

## 13 Open decisions and when they matter

| ID | Decision | Current working default | Needed before |
|---|---|---|---|
| OD-01 | Development budget, payment milestones, support terms, and deadline | None | Commercial commitment |
| OD-02 | Hosting and recurring operations budget; account owner and recovery operator | Cloud-hosted; budget undecided | Production deployment |
| OD-03 | Printed document language selection and date/number presentation | English and Arabic UI confirmed; proposed English or Arabic A4 print selection | Final print implementation |
| OD-04 | Obtain exact logo, accent colors, fonts, business contact details, and chosen car images | Use their existing theme and Volkswagen Group car imagery; dark primary and light alternative confirmed | Final visual design |
| OD-05 | Edit/post/reverse/export rights for each role | Permission proposal in section 4 | Protected write actions |
| OD-06 | Exact workshop states, approval process, part reservation/issue timing, and walk-in sales identity | Workflows in section 6 | Final job and stock posting rules |
| OD-07 | Daily-pay details if used, advance recovery, negative balances, and correction of finalized pay | Manual commission amounts confirmed; no commission engine or formula required | Payroll posting |
| OD-08 | Precision, rounding, date presentation, and depth of financial reporting | EGP confirmed; proposed two decimal places; payment and debt tracking in scope | Financial posting |
| OD-09 | Inventory costing, units, damaged stock, opening costs, and negative-stock policy | Disallow negative stock; costing method open | Inventory costing and margin reports |
| OD-10 | Printer model, final invoice/receipt layout, numbering, and anonymous cash sale policy | A4 confirmed as initial size; hardware unknown | Physical print acceptance |
| OD-11 | Offline requirement, acceptable data loss, backup frequency/day/time, retention, and data-retention period | Internet-required; weekly backups are the provisional interpretation, with restoration only when needed | Hosting and recovery acceptance |
| OD-12 | Initial paper data, opening date, who enters it, and who verifies balances | Manual starting entries | Go-live migration |
| OD-13 | Whether existing Setmore bookings need automatic synchronization | Separate systems; no sync | Any integration work |
| OD-14 | Attachment formats, size limits, and retention | Proposed 10 MB per file and private storage | Upload implementation |

Open decisions do not prevent layout work, schema planning, a clickable prototype, or core customer/vehicle screens. Decisions that affect balances, permissions, and stock must be resolved before those mutations are finalized.

## 14 Proposed implementation order

1. Confirm screen map, exact brand assets and car imagery, bilingual terminology, and the remaining high-impact business rules.
2. Build application foundation, authentication, permissions, settings, themes, customers, vehicles, and services.
3. Build suppliers, opening stock, purchasing, stock ledger, counter sales, invoices, receipts, and payment allocation.
4. Build appointments, quotations, job cards, assignments, part reservations/issues, and vehicle history.
5. Build expenses, cash accounts, mixed employee pay, advances, deductions, salary payments, and operational reports.
6. Complete printing, audit review, exports, backups, migration rehearsal, critical-path tests, and user acceptance.

Every confirmed module remains part of the intended completed system. Delivery dates and effort estimates should follow review of the open business rules rather than being inferred from this sequence.

## 15 Proposed release readiness criteria

- Confirmed modules are present and the agreed role permissions are enforced on server actions.
- Acceptance scenarios covering money, stock, salary advances, and reversal behavior pass with representative data.
- Sample paper records and opening totals have been reconciled by the designated client reviewer.
- A4 invoices and receipts have been checked in both proposed print languages and approved on the actual printer when available.
- Mobile, desktop, both themes, English LTR, Arabic RTL, and mixed-language identifier checks pass.
- Production backup and recovery have been exercised, including attachments.
- Access credentials, administrator recovery, deployment information, and operating instructions have been handed over under agreed ownership and support terms.
- Remaining limitations and explicitly deferred integrations are recorded, with no unconfirmed accounting or offline capability represented as complete.

## 16 Documentation references for the proposed stack

- Next.js server deployment: https://nextjs.org/docs/app/getting-started/deploying
- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Prisma transactions: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions
- Better Auth: https://better-auth.com/docs/introduction
- shadcn right-to-left layouts: https://ui.shadcn.com/docs/rtl
- ERPNext introduction: https://docs.frappe.io/erpnext/introduction
- Frappe HR: https://docs.frappe.io/hr/introduction
- Supabase pricing: https://supabase.com/pricing
- DigitalOcean server pricing: https://www.digitalocean.com/pricing/droplets

Public references support discovery and technology evaluation; they do not constitute the client's acceptance of features, prices, service-level targets, or legal-compliance coverage.
