# VAG Engineering Workshop Log · v2.1

A workshop register for customers, their cars, and the work they need. Use **Jobs → New job** to record a quick job or check in a car that will stay at the shop. **Open jobs** shows work in progress, **Job history** shows delivered and cancelled jobs, and **Jobs to bill** shows finished work awaiting billing.

From a visit, select **Create invoice** and enter the price for each service. The form shows the quantities and saved unit prices of any parts added to the visit and adds everything up in EGP. The printable invoice shows the same itemized prices and the recorded service details.

Open **More → Receipts** to find or print a customer receipt. A receipt includes the services, details, and parts from each invoice it pays, plus the amount received and the balance. From a visit, **Record a receipt** records a full or partial payment. If the visit needs an invoice, enter the service prices in the receipt form as well.

Open **Debts** to see customers with an outstanding balance. Select **Record payment** next to the customer, enter the amount received, and save. The app applies the payment to the oldest balances first, updates the list, and links to the receipt. Payment date and account options are available in the payment form.

Open **More** for invoices, inventory, suppliers, cash, payroll, reports, and administration. From a workshop job, choose **Post job invoice** to enter the charges. Parts already issued to the job appear on the invoice form.

The interface supports English and Egyptian Arabic. Select **مصري** in the header to switch to Egyptian Arabic and RTL.

## Run the app

Use Node 22.12 or later and a UTF-8 PostgreSQL database. Copy `.env.example` to `.env` and configure the database URL, login origin and secret. For the first owner, set `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD`.

```sh
npm ci --ignore-scripts
npm run db:generate
npm run db:migrate
npm run bootstrap
npm run dev
```

Open [the local workshop log](http://localhost:3000) and sign in as the first owner. Create additional staff accounts in **Settings → Users**.

For existing installations, run the username migration when upgrading. The migration assigns usernames from the part of each old sign-in email before the @ and adjusts invalid or duplicate names. You can review or edit the assigned usernames in **Settings → Users**. Each account keeps its current password.

Docker is available via `docker compose up --build -d` and `docker compose run --rm migrate npm run bootstrap`. See [deployment and recovery](docs/operations.md) for operation of the database and backups.

## Version history

The full ERP source and a verified database and attachments snapshot are in the sibling **VAG Engineering - v1 Archive** folder. This version uses the existing customer and car tables. Past workshop jobs appear as history, and new visits use an additive database migration. Existing business records are retained. The original ERP requirements and verification notes in `docs/` describe v1.

## Verification

Run `npm run check`, `npm test` and `npm run build`. Set `TEST_DATABASE_ADMIN_URL` to a loopback PostgreSQL connection with `CREATEDB`, then run `npm run test:workflows`. The runner creates and removes a fresh UTF-8 database and attachment directory for each suite. Pass a suite name after `--` to run it separately.

The browser suites use Microsoft Edge on Windows when it is available. Set `VAG_EDGE_PATH` for another Edge installation, or install Chromium with `npx playwright install --with-deps chromium` on Linux. The CI workflow runs all suites with Chromium.

To run individual suites against an isolated test instance, set `TEST_URL` and point `DATABASE_URL` to its database ending in `_test`. The suites write test records. Check cashbook, payroll and inventory with `npm run test:accountant`, workshop flows with `npm run test:acceptance`, roles with `npm run test:roles`, or photos with `npm run test:photos`. See [verification](docs/verification.md) for the release checks.

