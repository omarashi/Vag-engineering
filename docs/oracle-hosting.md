# Put the workshop online with Oracle Cloud

Setup guide for the Windows workshop project, checked 22 November 2026. The examples use an Oracle Ubuntu server, the app’s existing PostgreSQL database software, and a Cloudflare domain and tunnel. `shop.example.com` is a placeholder. Use your own address wherever it appears.

## What you get and what you pay

| Item | Starting cost | What it does |
|---|---:|---|
| Oracle Always Free Ampere A1 | $0 within the allowance | Runs the website and PostgreSQL. The free account allowance is equivalent to 2 OCPUs and 12 GB RAM. Up to 200 GB of eligible boot and block storage combined is available in your home region. [Oracle allowances](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Your own standard `.com` through Cloudflare | US$11.17 for one year, currently also $11.17 to renew | Gives the shop a name it controls. Check the specific name and final price at checkout. A subdomain such as `shop` under a domain you already own has no separate registration fee. [Cloudflare domain prices](https://pricing.registrar.cloudflare.com/?q=com) |
| Cloudflare Tunnel and HTTPS | $0 on this setup | Lets staff reach the login page through an encrypted connection. Cloudflare issues and renews the website certificate. [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) · [Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/) |
| Independent backup storage | $0 extra if you have suitable storage with space available | Keeps a recoverable copy outside the Oracle server. The example below uses an encrypted folder in a shop-controlled cloud drive. Its storage plan determines any additional charge. |

**Expected starting bill with a new standard `.com` is about $11.17 per year**, before applicable taxes or card conversion charges, while hosting and backups fit their allowances. An existing domain can bring the additional registration cost to zero. Oracle asks for a payment card for identity verification. The shop can stay on a free account and decide later when to enable paid usage. [Oracle Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)

## 1. Choose who controls the accounts

Use an email the workshop owner controls and can recover even if the new domain expires. Keep the Oracle and Cloudflare account details, recovery codes, domain renewal date, server key, and backup recovery credentials in the shop’s password manager. Enable two-factor authentication on the hosting, domain and backup accounts. Mechanics and accountants get separate **workshop app** logins in step 8. They only need the website address and their own credentials.

## 2. Apply for the Oracle free account

1. Open the [Oracle Cloud Free Tier signup](https://www.oracle.com/cloud/free/) and select **Start for free**. Use the actual country, account holder and billing details. Verify the email address, set the cloud account name and password, and complete any phone verification shown.
2. Choose your **home region** carefully. Pick a region offered during signup that is reasonably close to the shop in Egypt. This choice is permanent, and the free compute and disk for this setup must be in the home region. The signup list and available server capacity can differ. [Oracle region guidance](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingregions.htm)
3. Complete the card check. Oracle accepts credit cards and eligible debit cards that function like credit cards. It excludes prepaid, virtual and single-use cards. Your bank may display a temporary authorization. If an Egyptian card is declined, check whether the issuer allows international online verification, then use Oracle’s signup support if needed. [Oracle signup and card FAQ](https://www.oracle.com/cloud/free/faq/)
4. Sign in to Oracle Cloud Console and enroll the account in MFA. The introductory trial credits expire. Choose resources marked **Always Free eligible** for the long-running server. Once the trial ends, eligible resources can continue at $0. [Oracle signup steps](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm) · [Oracle free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

## 3. Create the server before buying a domain

1. In your home region open **Compute → Instances → Create instance**. Name it `workshop-app`.
2. For the image select **Canonical Ubuntu Server 24.04 LTS**, Arm-compatible. For the shape select **Ampere → VM.Standard.A1.Flex** and set **2 OCPUs, 12 GB RAM**, assuming this is your only A1 instance. Start with **100 GB** of eligible boot disk at the default performance level. This leaves part of the 200 GB allowance available. Use an eligible platform image and check the cost summary. If the console shows an unexpected charge, check the selections before creating anything. [Oracle free resource limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
3. For networking, use a virtual cloud network with internet connectivity, a public subnet and a public IPv4 address for administering the server. Oracle’s first-instance wizard can create the network. Keep the default outbound connectivity. In the subnet’s security list or network security group, restrict incoming SSH **TCP port 22** to your administrator PC’s current public IPv4 address with `/32` appended. Replace any broad SSH rule after confirming you have the correct address. If the shop’s internet address changes, update this rule in Oracle Console. The tunnel handles staff traffic. Ports **3000** and **5432** should remain private. [Oracle first-instance guide](https://docs.oracle.com/en-us/iaas/Content/Compute/tutorials/first-linux-instance/overview.htm) · [Security lists](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm)
4. Under SSH keys choose **Generate a key pair** and save the **private key** on the owner’s PC and in secure recovery storage before leaving the screen. Create the instance. When it shows **Running**, copy its public IPv4 address. If Oracle reports **Out of host capacity**, try another availability domain in the same home region if offered, or retry later. Wait for the server to work before spending money on a domain. [Oracle capacity guidance](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
5. On Windows, open PowerShell. Replace both values below. Save the key in a directory accessible only to your Windows account. Connect using the Ubuntu account and verify the first SSH host-key fingerprint against Oracle’s instance console history if prompted. You should reach an `ubuntu@...` shell. [Oracle SSH guide](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/connect-to-linux-instance.htm)

```powershell
$server = 'YOUR_ORACLE_PUBLIC_IP'
$key = 'C:\path\to\your-oracle-private.key'
ssh -i $key "ubuntu@$server"
```

## 4. Choose the address staff will use

**For a new domain:** Open a shop-owned Cloudflare account, verify its email, then go to **Register domains**. Search for the name you want, check its spelling, registration price and renewal price, choose one year, enter the owner’s contact details, pay, and verify the registrant email. Keep auto-renew enabled and record the renewal date. If the name you buy is `yourworkshop.com`, the staff address can be `shop.yourworkshop.com`. You purchase the base domain once. The `shop` part is created in step 7. A mailbox for the domain is a separate service and is optional. [Register a domain](https://developers.cloudflare.com/registrar/get-started/register-domain/)

**If the shop already owns a domain:** Use a spare subdomain such as `shop`. If Cloudflare already manages its DNS, skip registration. If DNS is elsewhere and you choose this tunnel setup, add the domain to Cloudflare’s free plan, copy and verify the existing DNS records including website, email and verification records, and follow the nameserver and DNSSEC instructions at the current registrar. Keep the existing registration. Wait for the zone to show **Active**. An error during a nameserver change can interrupt existing business email. [Cloudflare domain onboarding](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

**To test without buying anything:** On the Oracle server, with `cloudflared` installed, run `cloudflared tunnel --url http://127.0.0.1:3000`. Keep it running and copy the temporary HTTPS address. Use that exact address for `BETTER_AUTH_URL` in step 6, or change the setting and recreate the app if already built. Use sample data for a temporary preview. When the tunnel stops, the address expires. For a permanent named tunnel, follow step 7 with an active domain. [Quick Tunnel instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) · [Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

## 5. Copy the app from the Windows shop PC

In the SSH session on **Ubuntu**, install the Ubuntu-packaged Docker engine, Compose and build tools. Prepare a private project directory. [Ubuntu Docker packages](https://packages.ubuntu.com/search?keywords=docker-compose-v2&suite=noble)

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 docker-buildx openssl curl cron
sudo systemctl enable --now docker cron
sudo docker compose version
sudo install -d -m 750 -o ubuntu -g ubuntu /srv/vag-erp
```

Open a second **Windows PowerShell** window. Set `$server` and `$key` again as in step 3. Run these commands from the current project. They package the source, migrations and public branding. The private `.env`, local database, uploads, backups and dependencies stay on the PC.

```powershell
Set-Location -LiteralPath 'C:\Users\LENOVO\Desktop\VAG Engineerin'
$bundle = Join-Path $env:TEMP ('workshop-app-' + [guid]::NewGuid() + '.tar.gz')
$items = @('app','components','lib','prisma','public','scripts','tests',
  'Dockerfile','compose.yaml','.dockerignore','package.json','package-lock.json',
  'next.config.mjs','next-env.d.ts','postcss.config.mjs','prisma.config.ts','tsconfig.json')
tar.exe -czf $bundle @items
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
scp -i $key $bundle "ubuntu@${server}:workshop-app.tar.gz"
```

Back in **Ubuntu**, on the new installation:

```bash
cd /srv/vag-erp
tar -xzf ~/workshop-app.tar.gz
```

## 6. Set up the database and start the app

The server runs **PostgreSQL 17**. The Docker volume `pgdata` holds the complete live database, including customers, vehicles, jobs, stock, debts, payments, payroll, user accounts, password hashes and audit history. Receipts are printable from their stored records. Uploaded files, if you ever use them, live in a second volume named `attachments`. Restarting or updating the app normally preserves both. Deleting the volumes or a server disk can erase the records. Copying the source in step 5 starts with an empty database. [Project configuration](../compose.yaml) · [Recovery guide](operations.md)

On **Ubuntu**, stay in `/srv/vag-erp`. Substitute the real HTTPS address and an owner email you control before running this block. It creates fresh credentials and refuses to overwrite an existing `.env`. Store a private recovery copy of this file. Keep it out of source control.

```bash
(
  umask 077
  set -C
  cat > .env <<EOF
BETTER_AUTH_URL=https://shop.example.com
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
BOOTSTRAP_EMAIL=owner@example.com
BOOTSTRAP_NAME="Workshop Owner"
VAG_DEMO=false
BACKUP_KEEP=4
EOF
)
```

Compose already supplies the correct internal `DATABASE_URL`. Add a small **server-side** Compose override so PostgreSQL restarts after a machine reboot, alongside the website. Run `nano compose.override.yaml` in `/srv/vag-erp`, paste the following, press **Ctrl+O**, **Enter**, then **Ctrl+X**. Compose reads it automatically.

```yaml
services:
  db:
    restart: unless-stopped
```

**Choose one starting point now.** If real records on the shop PC must carry over, skip directly to **If bringing real records from the existing PC** below. If the PC holds sample data, use the clean start.

**If starting clean with the real shop:** Run the following in the same Ubuntu shell. The app starts, applies the database migrations, and the health check should return `{"status":"ok"}`. `migrate` exiting with status zero is expected. If the first health request runs before the app is ready, retry it once `app` reports healthy.

```bash
sudo docker compose up -d --build
sudo docker compose ps -a
curl -fsS http://127.0.0.1:3000/api/health
```

Create the owner once. Use a unique password of at least 12 characters. These commands prompt privately and pass the password to a temporary container. Then sign in with the email from `.env`.

```bash
read -r -s -p 'Choose the workshop owner password: ' BOOTSTRAP_PASSWORD
echo
export BOOTSTRAP_PASSWORD
sudo --preserve-env=BOOTSTRAP_PASSWORD docker compose run --rm migrate npm run bootstrap
unset BOOTSTRAP_PASSWORD
```

**If bringing real records from the existing PC:** Take this branch **before** running `compose up -d --build` or creating an owner. Pause new entries at cutover. On Windows, with the existing local database running and the project’s PostgreSQL tools and Git Bash installed, `./scripts/rehearse-windows.ps1` makes a full dated backup, restores it into a separate local test database and compares totals. Use the bundle only after it reports success. It is under `data/rehearsal/backups/`, and contains `database.dump`, `attachments.tar.gz` and `SHA256SUMS`. A full restore also brings the source users and password hashes. Review any demo accounts before allowing internet access. Keep the source PC and its backup intact. [Windows recovery procedure](../scripts/rehearse-windows.ps1)

On Ubuntu create the empty destination with `mkdir -p /srv/vag-erp/backups` and `sudo docker compose up -d db`. From the second Windows PowerShell window, in the project directory, run the following with the actual dated folder name:

```powershell
$stamp = 'YYYYMMDDTHHMMSSZ'
scp -r -i $key ".\data\rehearsal\backups\$stamp" "ubuntu@${server}:/srv/vag-erp/backups/"
```

On Ubuntu run `sudo docker compose --profile operations run --rm restore RESTORE_TO_EMPTY_TARGET YYYYMMDDTHHMMSSZ` with that same timestamp. After a successful restore, run `sudo docker compose up -d --build` and check `/api/health`. Sign in with the restored owner account. Compare customer counts, a known debt, a receipt total, and payroll with the PC before switching staff over. If the target already contains tables, the restore refuses to proceed. Use a new empty target and preserve the existing one. [Restore procedure](operations.md)

## 7. Connect the domain and enable HTTPS

1. In the Cloudflare dashboard, go to **Networking → Tunnels → Create a tunnel**. Name it `workshop`. Choose the `cloudflared` connector if prompted.
2. Select the Linux Debian/Ubuntu **ARM64** instructions. Run the dashboard’s installation and service commands **on the Ubuntu host**. The generated connector token is secret. Wait for the connector to show **Healthy**. Host installation matters here because the app listens on the host’s loopback address. [Create a tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
3. In that tunnel, open **Routes → Add route → Published application**. Set **Subdomain** to `shop`, choose your domain, leave the path empty, set **Service type** to `HTTP` and the service address to `127.0.0.1:3000`. Save. The dashboard creates the DNS record for the tunnel. Use a new hostname if the one you chose already serves another site. [Published application routing](https://developers.cloudflare.com/tunnel/concepts/routing/)
4. On a phone using mobile data, open `https://shop.YOUR-DOMAIN/api/health`. Expect `{"status":"ok"}`. Then open `https://shop.YOUR-DOMAIN/login` and sign in. Cloudflare provides public HTTPS, the connector encrypts the tunnel, and the final HTTP hop stays inside the VM. Public incoming web ports and a public database port are unnecessary for this design. Leave authenticated screens on their default cache behavior and avoid adding a “cache everything” rule to this hostname. [Tunnel connections](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) · [Free HTTPS](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/)

## 8. Give staff access and verify the workshop workflow

1. As owner, open **More → Settings → Add user**, add individual users and assign the appropriate owner, accountant or technician role. Configure the business details in Settings and add the actual cash or bank accounts under **More → Cash & expenses**. Share the HTTPS login address. The cloud-hosted app remains available when the shop PC is off, provided the server is running and staff have internet access.
2. Before entering real transactions, use a **separate test database** to check a quick job, a car staying overnight, a counter sale without a car, a partial debt payment and a printed receipt. Use the clean production database or verified imported database for opening day.
3. After a planned restart, confirm the server, database, tunnel and phone login all recover. `sudo docker compose ps` and `sudo systemctl status cloudflared` show their state. Confirm a known record still appears after restart.

## 9. Back up the whole database and prove you can restore it

**A live database is one copy.** The following makes independent copies that include the authentication and financial records. Oracle may reclaim an idle free VM and provides no free-tier uptime guarantee. A daily snapshot can still leave up to a day of entries to reconcile. If losing a day’s receipts would be too costly, schedule more frequent backups and monitor storage. [Oracle free tier FAQ](https://www.oracle.com/cloud/free/faq/) · [Project backup and restore](operations.md)

1. On Ubuntu, from `/srv/vag-erp`, run `sudo docker compose --profile operations run --rm backup`. Check for `backup complete`. The dated directory in `backups/` contains the PostgreSQL dump, attachment archive and checksums. The default `BACKUP_KEEP=4` retains four successful local runs.
2. Pick independent, private backup storage. One practical option is a shop-controlled Google Drive with an **rclone encrypted remote**. On Ubuntu install `sudo apt install -y rclone`. Run `sudo rclone config`, create a `drive` remote named `shopdrive`, and authorize the shop’s backup account. On a server without a browser, follow rclone’s headless authorization instructions from a trusted PC. Create a second remote of type `crypt` named `shop-encrypted`, pointing to `shopdrive:WorkshopBackups`. Select filename encryption and save the encryption password, salt if used, and a protected copy of the rclone config outside Oracle. You will need them during recovery. [Google Drive setup](https://rclone.org/drive/) · [Remote authorization](https://rclone.org/remote_setup/) · [Encrypted backups](https://rclone.org/crypt/)
3. Make and verify the first off-server copy. These commands run from `/srv/vag-erp`. `copy` retains older remote backups when the local rotation removes them. Set a separate remote retention policy or review usage regularly.

```bash
sudo rclone copy ./backups shop-encrypted:daily --exclude '.pending-*/**'
sudo rclone check ./backups shop-encrypted:daily --one-way --download --exclude '.pending-*/**'
```

4. For nightly backups at 03:00 Cairo time, set `sudo timedatectl set-timezone Africa/Cairo` and open `sudo crontab -e`. Add the following single line. Review `/var/log/vag-backup.log`, set up a failure or missing-backup notification with your monitoring service, and verify the following morning that a new **off-server** copy exists.

```cron
0 3 * * * (cd /srv/vag-erp && /bin/sh scripts/scheduled-backup.sh && /usr/bin/rclone copy ./backups shop-encrypted:daily --exclude '.pending-*/**') >>/var/log/vag-backup.log 2>&1
```

5. Before relying on the system, restore a backup retrieved from the independent storage. On a separate recovery server, copy the project code and deployment settings, install Docker and rclone, recover the encrypted remote config, and prepare `/srv/vag-erp` as above. Set `stamp` to one real backup directory returned by `sudo rclone lsf shop-encrypted:daily --dirs-only`. From the recovery project directory:

```bash
stamp=YYYYMMDDTHHMMSSZ
sudo rclone copy "shop-encrypted:daily/$stamp" "./backups/$stamp"
sudo docker compose -p vag-recovery up -d db
sudo docker compose -p vag-recovery --profile operations run --rm restore RESTORE_TO_EMPTY_TARGET "$stamp"
```

The restore verifies checksums and checks the empty target before loading data. Inspect the reported totals. Start the isolated recovery app, confirm a known customer, balance, salary and receipt, and compare them to the source as of the backup time. Keep the recovery app separate from the production tunnel. Store the deployment `.env`, source version, server access, and backup recovery credentials separately from the database bundles.

## 10. Watch costs, update and troubleshoot

| Situation | What to do |
|---|---|
| Free disk is filling | Check `df -h /` on Ubuntu and the allocated volumes in Oracle. Review backup use and set a disk-space alert around 75–80%. A full disk can interrupt writes. Add storage before that point. |
| You want paid capacity | In Oracle Console go to **Billing & Cost Management → Upgrade and Manage Payment** and choose **Pay As You Go** when ready. Existing resources remain accessible and eligible allowances continue. Paid capacity uses Oracle’s current rates. Budget alerts email you about spending and do not cap the bill. [Upgrade instructions](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) · [Budget alerts](https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/managingalertrules.htm) |
| The public link fails | First run `curl -fsS http://127.0.0.1:3000/api/health` on Ubuntu. If local health passes, check tunnel health, the `shop` hostname, certificate status, and the HTTP service address. The connector needs outbound TCP or UDP 7844. [Tunnel connectivity](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/) |
| Login loads but sign-in fails | Check the full `BETTER_AUTH_URL` in the server `.env` against the HTTPS address in the browser, including the subdomain. After correcting the URL, run `sudo docker compose up -d --force-recreate app` and try again. Confirm the owner exists and the account is active. |
| Local health fails | Run `sudo docker compose ps -a` and `sudo docker compose logs --tail=80 db migrate app` in `/srv/vag-erp`. Check migration status and free disk space. Keep secrets out of shared logs. |
| A new app version is ready | Back up first, test the new version and migrations on a separate copy, then update the production source and run `sudo docker compose up -d --build`. Keep `.env`, `compose.override.yaml`, PostgreSQL and attachment volumes. The `-v` option on `docker compose down` deletes named volumes and can erase the live shop database. |
| Domain expires or you change hosts | Domain registration and the Oracle database are separate. An expired domain can stop staff reaching the link even while records still exist. Renew the domain or reconnect a hostname. When moving hosts, restore the verified backup, update the tunnel and check the app’s public URL. |
