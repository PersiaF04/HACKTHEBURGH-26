# Lane A runbook: keeping live data running through the demo

Lane A runs two background programs on Varshil's laptop. The hosted site's Live mode depends on the first one. Nothing here needs credentials in the repository: the live poller uses the `gh` login already on the laptop.

| Program | What it does | Command (run from `pipeline/`) |
| --- | --- | --- |
| **Live poller** | Every 5 minutes, rebuilds `data/public/replay/live.json` and uploads it to an unlisted GitHub Gist. The site's `replay/index.json` points at the Gist. | `python -m turnup.live --publish` |
| **Archiver** | Saves what Elexon and NESO said at the time (BOALF every 5 minutes, NESO files every 30) into `data/snapshots/` (gitignored). Not needed for the demo itself. | `python -m turnup.archiver` |

Run the live poller from a checkout that is up to date with `main`. A running program does not pick up code changes: **restart it after any change merges to `pipeline/turnup/`**.

## 1. Is live mode healthy? (30 seconds)

1. **Gist is fresh.** Run this from `pipeline/` and check `age_min` is under 10:

   ```text
   gh api gists/79a5156614171e58934c6ec3fc32beec -q '.files["live.json"].content' | python -c "import json,sys,datetime as d; m=json.load(sys.stdin)['meta']; print(m['generated_utc'], round((d.datetime.now(d.timezone.utc)-d.datetime.fromisoformat(m['generated_utc'].replace('Z','+00:00'))).total_seconds()/60,1),'min old')"
   ```

   The raw URL the website fetches is cached for about 5 minutes, so it can lag the API by that long.
2. **The poller log keeps moving.** The poller prints to its console only. If you started it with the redirect shown under "Restart" below, the last lines of `data/cache/live.log` should say `published live.json to gist` every 5 minutes. If you started it any other way, read its console, or use step 1 (the Gist's `generated_utc` age) instead.
3. **Both programs are running.** In PowerShell: `Get-CimInstance Win32_Process -Filter "Name like 'python%'" | Select ProcessId,CommandLine`. You should see exactly one `turnup.live --publish` and one `turnup.archiver`. Two copies of the poller waste calls and fight over the Gist.
4. **The site shows Live.** Open the hosted site, choose Live and check the time. Live shows the day so far, so on a calm day there may be nothing curtailed. That is correct, not a fault.
5. **Archiver is healthy.** `data/snapshots/archiver.log` should show `boalf: ok` every 5 minutes, and `data/snapshots/state.json` should show a recent `last_run` for `boalf`. An old entry under `errors` can stay after the job has recovered, so judge health by the current timestamps, not by that key being absent.

## 2. Restart a program

Stop the old copy first, then start one new copy. Never run two.

```text
# find it
Get-CimInstance Win32_Process -Filter "Name like 'python%'" | Select ProcessId,CommandLine
# stop only that one
Stop-Process -Id <ProcessId>
# start it again from pipeline/ (the redirect makes the log file the checks above read)
cmd /c "python -m turnup.live --publish > ..\data\cache\live.log 2>&1"
python -m turnup.archiver
```

If you only want the current day's data once, `python -m turnup.live --once --publish` rebuilds and publishes a single time.

## 3. If something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Gist is more than 10 minutes old, log says `gist publish failed` | `gh` login expired, or no internet | Run `gh auth status`. If it is logged out, run `gh auth login`, then restart the poller. The poller keeps running and retries, and the Gist keeps the last good copy meanwhile. |
| Log says `gh CLI not found` | `gh` is not on the PATH of that terminal | Open a new terminal where `gh --version` works and restart the poller there. |
| Poller stopped (laptop slept, restarted, terminal closed) | Nothing runs while the laptop sleeps | Wake the laptop, check that it is on power, and start the poller again. Prevent it by setting **Sleep: Never** while plugged in during the demo. |
| `SCOTEX refresh failed, keeping previous` | NESO file briefly unavailable | Nothing to do. SCOTEX is optional and the previous copy is kept. |
| Live mode shows old data | The site is reading a cached copy, or the poller stopped | Wait 5 minutes (raw cache). If still old, follow the first row of this table. |
| Site shows no Live option | The live file is missing or invalid, so the site hides Live on purpose | Run `python -m turnup.live --once --publish`, then reload. |

## 4. Fallback: replay only

Replay does not depend on the laptop. The demo always works without Live:

1. Use a replay day (27 Oct is the main story day; 14 Oct and 13 Oct also work). They are committed files under `data/public/replay/`, deployed with the site.
2. Do not mention Live. If Live is already selected, switch back to a replay day.
3. If the site itself is down, the local fallback is `npm run build` then `npm run preview` in `web/`, which serves the committed data.

## 5. Honest labels, in case a judge asks

- Live shows what NESO has told farms to do so far today, estimated from accepted bids. **Payments are not known until the next morning**, so live `paid_gbp` is empty.
- The cable limit and flow (`scotex_*`) are NESO's **day-ahead forecast**, not measured flow. A flow above the limit signals constraint pressure and does not prove how much was turned down.
- The Gist is public by link but unlisted: anyone with the URL can read the file, and it contains only public market data.

## 6. After the demo

Stop both programs with `Stop-Process`, and optionally delete the Gist with `gh gist delete 79a5156614171e58934c6ec3fc32beec`. The `LIVE_URL` in `pipeline/turnup/backfill_config.py` then points at nothing, and the site hides Live.
