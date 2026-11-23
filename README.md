# VAG Engineering Workshop Log · v2.1

A workshop register for customers, their cars, and the work they need. Use **Jobs → New job** to record a quick job or check in a car that will stay at the shop. **Open jobs** shows work in progress, **Job history** shows delivered and cancelled jobs, and **Jobs to bill** shows finished work awaiting billing.

From a visit, select **Create invoice** and enter the price for each service. The form shows the quantities and saved unit prices of any parts added to the visit and adds everything up in EGP. The printable invoice shows the same itemized prices and the recorded service details.

Open **More → Receipts** to find or print a customer receipt. A receipt includes the services, details, and parts from each invoice it pays, plus the amount received and the balance. From a visit, **Record a receipt** records a full or partial payment. If the visit needs an invoice, enter the service prices in the receipt form as well.

Open **Debts** to see customers with an outstanding balance. Select **Record payment** next to the customer, enter the amount received, and save. The app applies the payment to the oldest balances first, updates the list, and links to the receipt. Payment date and account options are available in the payment form.

Open **More** for invoices, inventory, suppliers, cash, payroll, reports, and administration. From a workshop job, choose **Post job invoice** to enter the charges. Parts already issued to the job appear on the invoice form.

The interface supports English and Egyptian Arabic. Select **مصري** in the header to switch to Egyptian Arabic and RTL.

## Run the app

Use Node 22.12 or later and a UTF-8 PostgreSQL database. Copy `.env.example` to `.env` and configure the database URL, login origin and secret. For the first owner, set the bootstrap email and password. Set `VAG_DEMO=true` only against an isolated demonstration database.

```sh
npm ci --ignore-scripts
npm run db:generate
npm run db:migrate
npm run bootstrap
npm run dev
```

Open [the local workshop log](http://localhost:3000). **Open demo workspace** is available in demo mode.

Docker is available via `docker compose up --build -d` and `docker compose run --rm migrate npm run bootstrap`. See [deployment and recovery](docs/operations.md) for operation of the database and backups.

## Version history

The full ERP source and a verified database and attachments snapshot are in the sibling **VAG Engineering - v1 Archive** folder. This version uses the existing customer and car tables. Past workshop jobs appear as history, and new visits use an additive database migration. Existing business records are retained. The original ERP requirements and verification notes in `docs/` describe v1.

## Verification

Run `npm run check`, `npm test` and `npm run build`. For workflow checks, set `TEST_URL` to an isolated demo instance and `DATABASE_URL` to its PostgreSQL database with a name ending in `_test`. Run `npm run test:acceptance` for workshop flows, `npm run test:roles` for access and handoff, or `node --env-file=.env tests/receipts.mjs` for transactional receipt checks. These suites create test records.

Install Playwright Core with `npm install --prefix ./data/tooling --no-audit --no-fund playwright-core` for `node tests/browser.mjs` and `npm run test:photos`. Set `VAG_EDGE_PATH` to the Microsoft Edge executable if it is installed outside the default Windows location.

