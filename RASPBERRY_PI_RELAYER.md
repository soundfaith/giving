# Raspberry Pi Relayer Setup

This guide installs the SoundFaith legacy Node.js relayer on a Raspberry Pi 4 as a continuously running, outbound-only worker.

The Pi watches Supabase for projects in `approved_pending_chain`, registers those projects on the Coreum contract, and then activates them in Supabase. It does not accept web requests and does not need a public IP address or router port forwarding.

## 1. Understand The Network Model

The Pi must make outbound connections to:

- Supabase REST/RPC APIs
- The Coreum RPC endpoint
- GitHub, if automatic code updates are enabled
- npm, only during installation or dependency updates
- Tailscale, if you want remote SSH administration without router access

The Pi does **not** need inbound connections from Supabase. Supabase cannot SSH into the Pi, and the Pi should not expose SSH or a custom relayer port to the public internet.

The current Admin page invokes the deployed `coreum-relayer` Supabase Edge Function directly. The Pi worker is a second, continuously polling safety net. If you want the Pi to be the only registration worker, the Admin retry flow must eventually be changed to signal the Pi through the database rather than invoking the Edge Function directly. Do not run two independent registration workers casually; both must use idempotent registration logic and the same contract configuration.

## 2. Recommended Operating System

Install:

- **Raspberry Pi OS Lite (64-bit), Debian Bookworm-based**
- No desktop environment
- A current Raspberry Pi 4 firmware
- At least 2 GB RAM; 4 GB is preferable if available
- A reliable power supply
- Ethernet if possible; Wi-Fi is acceptable
- A small UPS or a high-quality power bank if the Pi must stay online

Raspberry Pi OS Lite is sufficient because the relayer is a headless Node.js process. Do not install Kali Linux, Ubuntu Desktop, or a full desktop image for this workload.

## 3. Flash The Pi Without Router Access

Use Raspberry Pi Imager on your laptop.

1. Install Raspberry Pi Imager from the official Raspberry Pi website.
2. Choose **Raspberry Pi OS Lite (64-bit)**.
3. Choose the microSD card.
4. Open the advanced settings before writing the card.
5. Set:
   - A unique hostname, for example `soundfaith-relayer`
   - A normal non-root username, for example `soundfaith`
   - A strong password, entered directly into Imager
   - Your Wi-Fi SSID and password, if using Wi-Fi
   - Your Wi-Fi country
   - Enable SSH
   - Prefer SSH public-key authentication
6. Write the card and boot the Pi.

Use Ethernet during initial setup if possible. It avoids Wi-Fi troubleshooting and does not require router configuration.

Find the Pi on the local network by trying:

```bash
ssh soundfaith@soundfaith-relayer.local
```

If mDNS is unavailable, check the device list in your operating system or use a local network discovery tool. You do not need router administrator access; you only need the Pi and laptop to be on the same network during initial setup.

## 4. Basic Pi Hardening

Connect over SSH and update the operating system:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

Reconnect, then install basic tools:

```bash
sudo apt install -y git curl ca-certificates build-essential unattended-upgrades
sudo systemctl enable --now unattended-upgrades
```

Confirm the architecture:

```bash
uname -m
```

Expected output:

```text
aarch64
```

Create a dedicated application directory:

```bash
sudo mkdir -p /opt/soundfaith
sudo chown -R "$USER":"$USER" /opt/soundfaith
```

Do not run the relayer as root.

## 5. Remote Administration Without Router Access

The simplest option is Tailscale. Tailscale creates an outbound encrypted management network and does not require port forwarding on your router.

Install it on the Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

Complete the browser login from the displayed URL. Install Tailscale on your laptop using the same account. Then connect using the Pi's Tailscale hostname or address:

```bash
ssh soundfaith@<pi-tailscale-name>
```

Security guidance:

- Do not enable password SSH once key access works.
- Do not forward port 22 on the router.
- Do not expose the Pi with a public DNS record.
- Keep Tailscale ACLs restricted to your own account or admin devices.
- If you do not need remote administration, omit Tailscale entirely. The relayer still works outbound-only.

## 6. Install Node.js

Install the current Node.js LTS version supported by the repository. Node.js 22 LTS is a reasonable choice for a Raspberry Pi 4.

Using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node --version
npm --version
```

Use the version required by the repository if that changes. Do not use an unmaintained Node.js version.

## 7. Clone The Repository

### Recommended: private GitHub repository with a deploy key

The Pi should not use a personal access token embedded in a URL. For a private repository, create a read-only deploy key on the Pi:

```bash
ssh-keygen -t ed25519 -C "soundfaith-relayer-pi" -f ~/.ssh/soundfaith_github
cat ~/.ssh/soundfaith_github.pub
```

Add the public key in GitHub:

`Repository Settings -> Deploy keys -> Add deploy key`

Give it read-only access. Configure SSH:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-soundfaith
  HostName github.com
  User git
  IdentityFile ~/.ssh/soundfaith_github
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config ~/.ssh/soundfaith_github
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

Clone the repository using the real GitHub owner/repository path:

```bash
git clone git@github-soundfaith:<OWNER>/<REPOSITORY>.git /opt/soundfaith
cd /opt/soundfaith
```

If the repository is public, HTTPS cloning is simpler:

```bash
git clone https://github.com/<OWNER>/<REPOSITORY>.git /opt/soundfaith
cd /opt/soundfaith
```

The Pi only needs the relayer source and its Node dependencies. It does not need to run the Vite frontend.

Install dependencies:

```bash
npm ci
npm run typecheck:scripts
```

## 8. Prepare Runtime Secrets

Never commit these values to GitHub:

- Contract-owner mnemonic
- Supabase service-role key
- Private keys
- Personal access tokens

Create a root-owned environment file:

```bash
sudo install -o root -g root -m 600 /dev/null /etc/soundfaith-relayer.env
sudo nano /etc/soundfaith-relayer.env
```

Use this shape, replacing placeholders locally:

```dotenv
COREUM_MNEMONIC=<contract-owner-mnemonic>
COREUM_DONATION_CONTRACT=<contract-address>
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
COREUM_RPC_URL=https://rpc.testnet-1.tx.org:443
COREUM_CHAIN_ID=coreum-testnet-1
COREUM_BECH32_PREFIX=testcore
COREUM_DERIVATION_PATH=m/44'/990'/0'/0/0
COREUM_NATIVE_DENOM=utestcore
COREUM_RELAYER_POLL_MS=10000
```

For mainnet, use the mainnet contract, RPC, chain ID, prefix, and denom. Do not copy testnet values into a mainnet installation.

Verify that the derived wallet is the intended contract owner before starting the service. The mnemonic must correspond to the wallet authorized to call `register_project`.

## 9. Create The systemd Service

Create the service:

```bash
sudo nano /etc/systemd/system/soundfaith-relayer.service
```

Paste:

```ini
[Unit]
Description=SoundFaith Coreum project relayer
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=soundfaith
Group=soundfaith
WorkingDirectory=/opt/soundfaith
EnvironmentFile=/etc/soundfaith-relayer.env
ExecStart=/usr/bin/npm run coreum:relayer
Restart=always
RestartSec=15
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/soundfaith

[Install]
WantedBy=multi-user.target
```

If your username is not `soundfaith`, replace both `User` and `Group`.

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now soundfaith-relayer
sudo systemctl status soundfaith-relayer --no-pager
```

View logs:

```bash
sudo journalctl -u soundfaith-relayer -f
```

The service should log its derived relayer address and poll for pending projects. It should not print the mnemonic or service-role key.

## 10. Test A One-Time Run Before Continuous Operation

Stop the service temporarily:

```bash
sudo systemctl stop soundfaith-relayer
```

Run one polling cycle:

```bash
cd /opt/soundfaith
sudo -u soundfaith env $(sudo sed '/^#/d;/^$/d' /etc/soundfaith-relayer.env | xargs) COREUM_RELAYER_ONCE=1 npm run coreum:relayer
```

This command exposes secrets briefly in the process environment. Prefer testing through systemd if your shell tooling does not handle secret values safely. After testing:

```bash
sudo systemctl start soundfaith-relayer
```

Confirm the Admin page's relayer heartbeat changes and that an `approved_pending_chain` project becomes `active` after successful registration.

## 11. Git Updates

Yes, the relayer code should be pushed to GitHub if the Pi is going to pull updates. Do not push secrets. The repository contains code; `/etc/soundfaith-relayer.env` contains secrets and stays only on the Pi.

### Safer recommended update process

Use explicit updates rather than silently deploying every commit:

```bash
cd /opt/soundfaith
git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
npm run typecheck:scripts
sudo systemctl restart soundfaith-relayer
sudo systemctl status soundfaith-relayer --no-pager
```

Before restarting, inspect changes:

```bash
git log --oneline HEAD..origin/main
git diff HEAD..origin/main -- scripts/coreum-relayer.ts package.json package-lock.json
```

### Automatic update option

The Pi can poll GitHub with a systemd timer. This is convenient but less conservative: a bad commit can restart production automatically. Prefer a protected `main` branch, required CI checks, and release tags.

Create an update script:

```bash
sudo nano /usr/local/sbin/soundfaith-relayer-update
sudo chmod 755 /usr/local/sbin/soundfaith-relayer-update
```

Use:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

repo=/opt/soundfaith
lock=/run/lock/soundfaith-relayer-update.lock

exec 9>"$lock"
flock -n 9 || exit 0

cd "$repo"
git fetch --quiet origin main
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)

if [ "$local_sha" = "$remote_sha" ]; then
  exit 0
fi

git diff --quiet HEAD -- || { echo "Working tree is not clean" >&2; exit 1; }
git pull --ff-only origin main
npm ci
npm run typecheck:scripts
systemctl restart soundfaith-relayer
```

Create the service:

```bash
sudo nano /etc/systemd/system/soundfaith-relayer-update.service
```

```ini
[Unit]
Description=Update SoundFaith relayer from GitHub

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/soundfaith-relayer-update
```

Create the timer:

```bash
sudo nano /etc/systemd/system/soundfaith-relayer-update.timer
```

```ini
[Unit]
Description=Poll GitHub for SoundFaith relayer updates

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now soundfaith-relayer-update.timer
systemctl list-timers soundfaith-relayer-update.timer
```

Check update logs:

```bash
sudo journalctl -u soundfaith-relayer-update.service
```

Do not auto-update from arbitrary pull requests. Pull only from a protected branch or signed release tag.

## 12. How Admin Retry Interacts With The Pi

The current Admin retry action invokes the Supabase Edge Function directly. The Pi worker independently polls Supabase every 10 seconds.

Therefore:

- Admin retry does not directly SSH into or call the Pi.
- The Pi notices pending projects through Supabase polling.
- The Pi then signs the Coreum registration transaction.
- The Pi calls the relayer activation RPC after registration.
- Supabase remains the coordination database.

If both the Edge Function and Pi worker are running, both may observe the same pending project. Use the idempotent relayer code and monitor logs. For a clean architecture, choose one primary registration worker:

- Supabase Edge Function only, or
- Raspberry Pi worker only

If the Pi becomes the primary worker, change the Admin retry action to mark/retry the queue and let the Pi process it, rather than invoking the Edge Function directly.

## 13. Security Checklist

- [ ] Raspberry Pi OS Lite 64-bit is installed.
- [ ] SSH uses keys, not passwords.
- [ ] No router port forwarding is configured.
- [ ] Tailscale is used for remote administration, if needed.
- [ ] The Pi has outbound access only.
- [ ] The mnemonic is stored only in `/etc/soundfaith-relayer.env` with mode `600`.
- [ ] The Supabase service-role key is never committed.
- [ ] The GitHub deploy key is read-only.
- [ ] The repository branch used for auto-update is protected.
- [ ] Testnet and mainnet configuration are not mixed.
- [ ] The derived relayer address is verified as the contract owner.
- [ ] Logs do not contain secrets.
- [ ] The Admin relayer heartbeat is updating.
- [ ] A pending project can become `active` after registration.

## 14. Troubleshooting

Check service state:

```bash
sudo systemctl status soundfaith-relayer --no-pager
sudo journalctl -u soundfaith-relayer -n 100 --no-pager
```

Check network DNS and HTTPS:

```bash
getent hosts <project-ref>.supabase.co
curl -I https://rpc.testnet-1.tx.org:443
```

Common failures:

- `COREUM_MNEMONIC... required`: the environment file is missing or not readable by systemd.
- `insufficient funds`: fund the contract-owner wallet with network gas tokens.
- `project already exists`: update the relayer code; retry logic should detect an existing on-chain record and activate Supabase.
- `project not found`: the project exists in Supabase but has not been registered on-chain yet; inspect the relayer logs and Admin pending-registration state.
- `RPC timeout`: verify outbound internet, DNS, and the configured Coreum RPC endpoint.
- `service-role key invalid`: obtain a new key from Supabase and replace it locally; never commit it.
- `working tree is not clean`: inspect local changes before allowing the automatic update script to pull.

## 15. Operational Recommendation

Start with manual updates for the first deployment. Once the Pi has run reliably for several days, enable the systemd update timer only if:

- GitHub CI is required before merging to the production branch.
- The Pi has a tested rollback procedure.
- You monitor the service heartbeat and logs.
- You accept that a bad production commit can restart the relayer.

The safest production arrangement is a protected release branch, explicit versioned releases, and a manual update command. Automatic polling is a convenience, not a replacement for deployment review.
