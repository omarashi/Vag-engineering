# Customer refunds and debt collection

Open the customer profile or **Debts → Pay Debt**. Select one unpaid invoice, check its balance, and record the amount received. Use **Split debt payment** on the customer profile to enter allocations for one receipt across selected debts. Opening balances can be collected through the split form. The restored invoice balance and the original receipt both remain visible after a payment reversal.

Open **Refund / Return** from an invoice, the customer profile, or More. Review the remaining refundable value per invoice. Select the items and charges and review the settlement breakdown before confirming. Use quantities for physical product returns. Choose sellable inventory only after verifying the pieces can be sold again. A full-value credit makes a financial adjustment. Select the specific quantities and disposition when stock must be returned too.

Each source invoice receives its own credit note. The combined receipt shows debt reduced, refunded money, credit applied, and retained credit separately. For an actual payout, record the amount returned and the cash or bank account. The ERP records the movement in the account ledger. A refund that only reduces an unpaid amount creates no cash movement.

Only the excess above the adjusted invoice value is available for settlement. The customer profile shows available credit separately from outstanding debt. Apply specific credit to a selected invoice, refund it through the original credit source, or retain it. For a refund batch, **Apply customer credit** requires one eligible destination that can accept the full available amount. To split the credit across several destinations, retain it first and apply the credit in separate allocations from the customer profile.

Reverse a mistaken cash payout through its payment record. Reverse an internal credit allocation from the customer credit history. Reversing a credit note with funds already refunded or allocated requires reversing those settlements first. Physical stock reversals must pass the existing inventory checks. Owners and accountants use the current finance permissions. An additional refund approval threshold requires an owner-set amount and approval rule.

## Reconcile and deploy

1. Pause financial posting. Make a verified backup of the SQL database and associated files using the existing recovery procedure.
2. Run `node --env-file=.env scripts/reconcile-customer-finance.mjs` against the database. Save the output in a private location. Values are integer EGP minor units. Review unallocated historical receipts and invoice-wide credit notes against the original records. The migration does not assign their money to any invoice or category.
3. Apply `npm run db:migrate` and rerun the reconciliation before allowing writes. The migration adds refund batch links, return dispositions, and credit applications. Existing invoice, credit note, payment and allocation IDs and values are retained. Totals should match across the migration before new transactions. Resolve any reconciliation issue before reopening posting.
4. Deploy the application and verify unpaid invoice selection, customer credit balances, refund receipts, and the Cash register. On a separate copy, rehearse a note, a payout, and a credit application and run the reconciliation again.

For rollback before any new refund or credit transactions, keep the additive schema and restore the prior application build after validating it against the database copy. After any new credit applications or overpayment payouts, suspend financial posting before switching builds. Recover with a version that understands those records. If a restore is required, preserve a current backup and reconcile every business transaction since the selected recovery point before resuming.
