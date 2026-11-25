# Deployment and recovery

## Production setup

Generate a separate random secret for `POSTGRES_PASSWORD` with `openssl rand -hex 24` and for `BETTER_AUTH_SECRET` with `openssl rand -hex 32`. Store the values in deployment secrets. Set a unique initial Owner password and disable demo mode in production. Compose uses the named `pgdata` and `attachments` volumes, so Linux and Windows hosts use the same default configuration.

Provision a Linux host with Docker Compose or adapt the Docker build for a managed PostgreSQL server. Maintain separate production and test environments. The example cluster listens only on the Compose network. The app binds the host loopback address by default. Put an HTTPS reverse proxy on the same host, use the public HTTPS origin in `BETTER_AUTH_URL`, and send the original Host and forwarded protocol. Use a private access network or access proxy where appropriate for the internal ERP. Set a proxy request-size cap slightly above 10 MiB and rate-limit authentication requests. Session creation checks active users, and TLS is required for off-site use.

Use a clean production database, verify the business configuration in Settings, assign individual accounts, and reconcile paper-derived opening totals. Run the initial bootstrap once. Configure a health monitor for `/api/health` and monitor application and backup logs. Persist the PostgreSQL and attachment volumes. Track hosting, retained backups, attachment storage, alerting and maintenance against the budget after ownership and hosting decisions are made. The requirements document includes planning estimates and performance targets.

Back up before updates. Build and migrate in an isolated staging environment first. Apply the same migration to production during a planned maintenance window. Preserve the previous application image and database snapshot. Roll back the app independently only if its schema is compatible. If data recovery is needed, restore into a new target and reconcile later business transactions before switching traffic.

## Backups

```sh
docker compose --profile operations run --rm backup
```

Each successful run creates a timestamped directory with `database.dump`, `attachments.tar.gz`, and `SHA256SUMS`. The directory becomes visible after both copies complete. The command emits a success or failure line and returns a failing exit code on an error. Keep at least four local restore points with `BACKUP_KEEP=4`, then copy verified bundles using an encrypted transfer to independently controlled off-site storage with its own retention and access policy. Treat backup contents as business data.

Schedule the command with the host's cron or scheduler. The provisional example runs at 03:00 each Sunday in the host timezone. Redirect stdout and stderr to an operator-owned log, and configure the scheduler’s mail or monitoring integration to alert on nonzero exit and on a missing successful run. Adapt the job's expression or run it manually when the schedule changes. Test email or monitoring notification before production.

```cron
0 3 * * 0 VAG_PROJECT_DIR=/srv/vag-erp sh /srv/vag-erp/scripts/scheduled-backup.sh
```

## Intentional restore

1. Choose a dated bundle and copy it into `backups/`. Keep the source and its checksum manifest together.
2. Create a new isolated Compose project with empty volume names and an unused HTTP port. Use a different project name with `docker compose -p vag-recovery`. Keep the running production service and its volumes available.
3. Start only the recovery database. Run the following restore command with the selected directory name.
4. Compare printed totals to the source period. Inspect allocations and statements, inventory, payroll, audit entries and attachment downloads. Record date, operator, bundle, duration, reconciled totals and any deviations in the recovery log.
5. Boot the app against the recovery project after checks. Switch production traffic only after an explicit recovery decision and review of any transactions made after the backup.

```sh
docker compose -p vag-recovery up -d db
docker compose -p vag-recovery --profile operations run --rm restore RESTORE_TO_EMPTY_TARGET YYYYMMDDTHHMMSSZ
```

The restore script requires explicit confirmation and empty database and attachment targets. It validates checksums, restores the database in one transaction, copies the referenced attachments and reports totals and elapsed time. If the attachment step fails, keep the target offline and repeat in a fresh recovery project after correcting the failure. Record a timed dry run before production and repeat periodically. Weekly recovery points can leave up to a week of changes to reconcile.

## Portability

PostgreSQL schema and constraints are in the [Prisma schema](../prisma/schema.prisma) and [migration](../prisma/migrations/20261117000000_initial/migration.sql). The backup includes authentication, business data, audit events and attachment metadata. Attachment file names use the keys stored in the database. CSV exports from Reports and Balances contain the selected report page and preserve safe spreadsheet text encoding. The full database and file backup provide the complete portable export.

