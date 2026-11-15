# Self-hosting Laneway

Laneway runs on your own computer with Docker: the app, its Postgres database
and a nightly backup, all in one `docker compose` setup. Nothing here needs
Netlify, and nothing costs money.

Your other devices (a Mac, an iPhone) reach it through
[Tailscale](https://tailscale.com), a free private network between your own
devices. Laneway is never exposed to the public internet.

## What you need

- A computer that stays on most of the time. These steps use Windows 11.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), free for personal use.
- [Git for Windows](https://git-scm.com/download/win), to download and update Laneway.
- Tailscale on the computer and on each device you want to use Laneway from.

## 1. Install and start Laneway

In PowerShell:

```powershell
cd D:\AI
git clone https://github.com/xerches/laneway.git
cd laneway
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

`setup.ps1` writes a `.env` file with fresh secrets, then builds and starts
Laneway. The first build takes a few minutes.

Open <http://localhost:3000> and create your account. The first account owns
this Laneway, and sign-ups close after it.

On macOS or Linux, do the same by hand:

```sh
cp .env.selfhost.example .env
# put `openssl rand -base64 32` in BETTER_AUTH_SECRET and pick a POSTGRES_PASSWORD
docker compose up -d --build
```

## 2. Start with the computer

In Docker Desktop, open **Settings > General** and turn on **Start Docker
Desktop when you sign in**. Every service is set to `restart: unless-stopped`,
so Laneway comes back by itself after a reboot.

## 3. Use it from your Mac and iPhone

1. Install Tailscale on the Windows PC and sign in.
2. Install Tailscale on the Mac and iPhone and sign in with the same account.
3. In the [Tailscale admin console](https://login.tailscale.com/admin/dns),
   turn on **MagicDNS** and **HTTPS Certificates**.
4. On the PC, in PowerShell:

   ```powershell
   tailscale serve --bg 3000
   ```

   It prints an address like `https://ad-desktop.your-tailnet.ts.net`.
5. Add that address to `LANEWAY_URLS` in `.env`, after the localhost one:

   ```
   LANEWAY_URLS=http://localhost:3000,https://ad-desktop.your-tailnet.ts.net
   ```

6. Restart the app so it picks up the change:

   ```powershell
   docker compose up -d
   ```

Open the Tailscale address on any of your devices. On the iPhone, use
**Share > Add to Home Screen** to get an app icon.

Only devices signed in to your Tailscale account can open it. Login cookies
only work on addresses listed in `LANEWAY_URLS`, so add every address you use.

## Backups

The `backup` service writes a compressed database dump to `backups\` when it
starts and every 24 hours after that, and deletes dumps older than 14 days.
Change the folder with `BACKUP_DIR` and the number of days with
`BACKUP_KEEP_DAYS` in `.env`.

Point `BACKUP_DIR` at a folder that syncs to the cloud (OneDrive, Google
Drive, iCloud) to keep a copy off the computer, for example:

```
BACKUP_DIR=C:/Users/you/OneDrive/Laneway backups
```

To take a backup right now:

```powershell
docker compose restart backup
```

### Restore a backup

This replaces everything in the database with the backup. Use the name of
the file you want from `backups\`:

```powershell
docker compose stop app
docker compose cp backups\laneway-2026-11-15-0300.sql.gz db:/tmp/restore.sql.gz
docker compose exec db sh -c "gunzip -c /tmp/restore.sql.gz | psql -q -U laneway -d laneway"
docker compose start app
```

The same commands work on macOS and Linux, with `/` in the path.

## Update Laneway

```powershell
git pull
docker compose up -d --build
```

Database changes are applied automatically when the app starts.

## Useful commands

| What | Command |
|---|---|
| See what's running | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Stop everything | `docker compose down` |
| Start again | `docker compose up -d` |

`docker compose down` keeps your data. The database lives in a Docker volume
named `laneway_db-data`, and only `docker compose down -v` deletes it.

## Moving to a hosted address later

The same code still deploys to Netlify or Vercel. To move your data, restore
a backup into the hosted database with `psql`, using the hosted database's
connection string.
