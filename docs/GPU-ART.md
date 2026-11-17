# GPU art box (how to reach it)

Image generation (hero-art bake-offs) can run on the owner's Windows PC with an RTX 4060, reached over SSH from the Mac.
This repo is public, so **no host, IP, user name or key lives here**. Scripts read them from the environment:

| Variable | Meaning |
| --- | --- |
| `TTE_GPU_HOST` | `user@address` of the PC |
| `TTE_GPU_KEY` | path to the dedicated private key (never commit, print or paste it) |

```sh
ssh -i "$TTE_GPU_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$TTE_GPU_HOST" 'hostname'
```

## Where the real values are

- **Claude sessions:** the owner's Claude memory entry `reference-gpu-pc-4060` (under `~/.claude/projects/<this project>/memory/`) has the host, user, IP and quirks. Read it, then export the two variables above.
- **Anyone else:** ask the owner. The key is `~/.ssh/tte_gpu_ed25519` on the owner's Mac.
- **IP changed?** The PC uses DHCP. Get the details on the PC (below), then update the memory entry. A DHCP reservation on the router stops this.

## Getting the details from the Windows PC

Open PowerShell on the PC and paste this single line (single line on purpose, see below):

```powershell
"host=$(hostname) user=$(whoami) ip=$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp','Manual' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback|PIA|TAP|Tailscale' }).IPAddress -join ',')"
```

It prints `host=<PC name> user=<pc\user> ip=<LAN IPv4>`. Use `user@ip` as `TTE_GPU_HOST`; the part of `user` after the backslash is the SSH user name. If two IPs print, pick the one that matches your router's subnet (for example `192.168.x.x`); `ipconfig` shows which adapter is the active Wi-Fi or Ethernet one.

Other checks, also on the PC:

- Is the SSH server up: `Get-Service sshd` (should say Running).
- Is the firewall rule there: `Get-NetFirewallRule -Name TTE-SSH-LAN | Select Name,Enabled,Profile`.
- Is the network Private (the rule is Private-only): `Get-NetConnectionProfile`.
- Is the GPU visible: `nvidia-smi`.

From the Mac, `ping <ip>` then the `ssh ... hostname` line above tells you whether the address is right. If the ping works but SSH times out, it is the firewall rule or the network profile; if SSH is refused, `sshd` is not running.

## Things worth knowing

- Access is key-only and limited to the home LAN (firewall rule `TTE-SSH-LAN`). It does not work from outside the subnet; Tailscale would be the way to widen it.
- The GPU is used through WSL2 Ubuntu: `wsl -d Ubuntu -- bash -lc "..."`. WSL output is UTF-16, so pipe it through `tr -d '\0'`.
- If SSH stops working with the VPN on, check the VPN's "allow LAN traffic" setting.
- Pasting multi-line text into the PC's terminal can reverse the lines: use single-line commands or `scp` a script.
- Generated candidates stay in the agent worktree's `.scratch/`; only results the owner approves are copied into the repo.
- To switch it all off: on the PC, `Stop-Service sshd; Set-Service sshd -StartupType Disabled; Remove-NetFirewallRule -Name TTE-SSH-LAN`.
