import type { ReactNode } from "react";
import { fmtNum, type Copilot, type DashboardCopilotCall, type DashboardSummary, type DfsRequest, type DfsRequests, type Forecast, type Iceberg } from "../data";
import { fmtDay } from "../screens/WasteMap";

const hhmm = (iso: string) => iso.slice(11, 16);
const plus30 = (iso: string) => new Date(Date.parse(iso) + 18e5).toISOString();
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function RailCard({ id, eyebrow, title, href, link, children, className = "" }:
  { id?: string; eyebrow: string; title: string; href: string; link: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`rc ${className}`} aria-labelledby={`${href.slice(1)}-rc`}>
      <header className="rc-head">
        <p className="rc-eyebrow">{eyebrow}</p>
        <a className="rc-link" href={href} aria-label={`Open the ${link} deep dive`}>{link}<span aria-hidden="true"> ›</span></a>
        <h2 id={`${href.slice(1)}-rc`} className="rc-title">{title}</h2>
      </header>
      {children}
    </section>
  );
}

// £188m and £1.81bn: the compact formatter would round billions to one decimal.
const money = (v: number) => (v >= 1e9 ? `£${(v / 1e9).toFixed(2)}bn` : `£${Math.round(v / 1e6)}m`);

export function BillCard({ data }: { data: Iceberg | null }) {
  if (!data) return null;
  const rows = [
    { k: "wind", label: "Paid to wind to stop", v: data.wind_bids_gbp },
    { k: "gas", label: "Gas turn-up offers", v: data.ccgt_offers_gbp },
    { k: "neso", label: "NESO constraint cost", v: data.neso_thermal_gbp },
  ];
  const max = Math.max(...rows.map((r) => r.v));
  return (
    <RailCard eyebrow="The hidden bill" title={`${money(data.wind_bids_gbp)} to wind is the small part`} href="#iceberg" link="Hidden bill">
      <ul className="rc-bars">
        {rows.map((r) => (
          <li key={r.k} className={`rc-bar rc-bar-${r.k}`}>
            <span className="rc-bar-label">{r.label}</span>
            <span className="rc-bar-value">{money(r.v)}</span>
            <span className="rc-bar-track"><span style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} /></span>
          </li>
        ))}
      </ul>
      <p className="rc-note">{data.days} days to {fmtDay(data.window[1]).replace(/ \d{4}$/, "")} · parallel measures, not a sum · retrospective</p>
    </RailCard>
  );
}

export function AskingCard({ data, date }: { data: DfsRequests | null; date: string }) {
  if (!data) return null;
  const reqs = data.requests.filter((r) => r.direction === "Upwards" && r.tag === "System");
  if (!reqs.length) return null;
  const required = reqs.reduce((s, r) => s + r.required_mw, 0);
  const procured = reqs.reduce((s, r) => s + (r.procured_mw ?? 0), 0);
  const fill = required ? procured / required : 0;
  const today = reqs.filter((r) => r.start_utc.slice(0, 10) === date).sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  const sorted = [...reqs].sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  const last = sorted[sorted.length - 1];
  const lastEvent = sorted.filter((r) => r.event_id === last.event_id);
  const show: DfsRequest[] = today.length ? today : lastEvent;
  const peakProc = Math.max(...show.map((r) => r.procured_mw ?? 0));
  return (
    <RailCard eyebrow="NESO is asking · retrospective" title={`NESO asked for ~${fmtNum(roughly(required / 2))} MWh. It got ~${fmtNum(roughly(procured / 2))}.`} href="#help" link="Help wanted">
      <div className="rc-gauge" role="img" aria-label={`Procured ${fmtNum(procured / 2)} MWh of ${fmtNum(required / 2)} MWh requested`}>
        <div className="rc-gauge-track"><span style={{ width: `${Math.max(fill * 100, 0.8)}%` }} /></div>
        <div className="rc-gauge-legend"><span>{fmtFill(fill)} of requested turn-up procured</span><span>{fmtDay(sorted[0].start_utc.slice(0, 10)).replace(/ \d{4}$/, "")}–{fmtDay(last.start_utc.slice(0, 10))}</span></div>
      </div>
      <p className="rc-line">
        <strong>{today.length ? "This day:" : `Last, ${shortDay(show[0].start_utc)}:`}</strong>{" "}
        {hhmm(show[0].start_utc)}–{hhmm(plus30(show[show.length - 1].start_utc))} UTC, {fmtNum(show[0].required_mw)} MW asked in
        zones {[...new Set(show.flatMap((r) => Object.keys(r.zone_caps_mw)))].sort().join(", ")} (NESO IDs, region unconfirmed); {peakProc ? `≤${peakProc} MW` : "none"} procured.
      </p>
    </RailCard>
  );
}

// Two significant figures for headline words ("~81,000", "~38"), so a sentence never claims more precision than it needs.
const roughly = (v: number) => (v >= 100 ? Number(v.toPrecision(2)) : Math.round(v));
export const fmtFill =(fill: number) => `${fill > 0 && fill < 0.01 ? (fill * 100).toPrecision(2) : (fill * 100).toFixed(1)}%`;

export function TomorrowCard({ data, summary }: { data: Forecast | null; summary: DashboardSummary | null }) {
  if (!data || !data.periods.length) return null;
  // dashboard.json carries the same P(request) per half-hour plus a headline templated from its numbers; prefer it when present.
  const sumP = new Map((summary?.tomorrow?.request_probability ?? []).map((r) => [r.start_utc, r.p_turnup_request]));
  const ps = data.periods.map((p) => (sumP.has(p.start_utc) ? { ...p, p_turnup_request: sumP.get(p.start_utc) } : p));
  const headline = summary?.tomorrow?.headline;
  // Calm is good news, said plainly, but only for a real next-day forecast whose p50 and p90 are both zero all day.
  const calm = data.mode !== "same_day_replay" && ps.every((p) => !p.curtailed_mwh_p50 && !p.curtailed_mwh_p90);
  const W = 300, H = 18, n = ps.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const pMax = Math.max(0, ...ps.map((p) => p.p_turnup_request ?? 0));
  const cMax = Math.max(0, ...ps.map((p) => p.curtailed_mwh_p90 ?? 0));
  const total = ps.reduce((s, p) => s + (p.curtailed_mwh_p50 ?? 0), 0);
  const hasP = ps.some((p) => p.p_turnup_request != null);
  const pArea = `M0,${H}` + ps.map((p, i) => `L${x(i).toFixed(1)},${(H - (p.p_turnup_request ?? 0) * H).toFixed(1)}`).join("") + `L${W},${H}Z`;
  const cLine = ps.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${(H - 1 - (cMax ? ((p.curtailed_mwh_p50 ?? 0) / cMax) * (H - 4) : 0)).toFixed(1)}`).join("");
  const peakIdx = ps.map((p, i) => ((p.p_turnup_request ?? 0) === pMax && pMax > 0 ? i : -1)).filter((i) => i >= 0);
  const label = data.mode === "same_day_replay" ? `Forecast replay · ${shortDay(ps[0].start_utc)}` : `Tomorrow · ${shortDay(ps[0].start_utc)}`;
  return (
    <RailCard eyebrow={`${label} · model forecast`} href="#tomorrow" link="Predictions" className={headline && !calm ? "rc-long" : ""}
      title={calm ? "Tomorrow looks calm — no waste expected"
        : headline ?? (hasP && pMax > 0 ? `${Math.round(pMax * 100)}% chance NESO asks for turn-up` : "No turn-up request expected")}>
      <svg className="rc-spark" viewBox={`0 0 ${W} ${H + 14}`} role="img"
        aria-label={`Forecast for ${n} half-hours. Peak chance of a turn-up request ${Math.round(pMax * 100)} percent. Median curtailment ${fmtNum(total)} MWh in total.`}>
        <line className="rc-spark-base" x1={0} x2={W} y1={H} y2={H} />
        {hasP && <path className="rc-spark-p" d={pArea} />}
        <path className="rc-spark-c" d={cLine} />
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H + 12} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{hhmm(ps[i].start_utc)}</text>
        ))}
      </svg>
      <p className="rc-note">
        <i className="rc-k rc-k-p" aria-hidden="true" />Chance NESO asks{peakIdx.length > 0 && <> up to {Math.round(pMax * 100)}%, {hhmm(ps[peakIdx[0]].start_utc)}–{hhmm(plus30(ps[peakIdx[peakIdx.length - 1]].start_utc))}</>}
        <i className="rc-k rc-k-c" aria-hidden="true" />median switch-off {total ? `${fmtNum(total)} MWh` : "none"}
      </p>
    </RailCard>
  );
}

interface Call { windows: [string, string][]; bid: string | null; pct: number | null }
const bidText = (lo: number | null | undefined, hi?: number | null) =>
  lo == null ? null : hi == null || Math.round(hi) === Math.round(lo) ? `~£${Math.round(lo)}/MWh` : `£${Math.round(lo)}–${Math.round(hi)}/MWh`;
const callText = (c: Call) => `Be ready ${hhmm(c.windows[0][0])}–${hhmm(c.windows[0][1])}${c.bid ? `, bid ${c.bid}` : ""}`;

function callFromCopilot(day: Copilot["days"][number]): Call | null {
  const slots = [...day.schedule].sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  if (!slots.length) return null;
  const windows = slots.reduce<[string, string][]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && Date.parse(last[1]) === Date.parse(s.start_utc)) last[1] = plus30(s.start_utc); else acc.push([s.start_utc, plus30(s.start_utc)]);
    return acc;
  }, []);
  const bids = slots.map((s) => s.bid_gbp_per_mwh).filter((b): b is number => b != null);
  const oracle = day.policies.oracle.gbp;
  return { windows, bid: bidText(bids.length ? Math.min(...bids) : null, bids.length ? Math.max(...bids) : null), pct: oracle > 0 ? day.policies.ours.gbp / oracle : null };
}
function callFromSummary(c: DashboardCopilotCall | undefined): Call | null {
  if (!c || c.status !== "scored" || !c.ready_windows_utc?.length) return null;
  return { windows: c.ready_windows_utc, bid: c.bid_range_gbp_per_mwh ? bidText(...c.bid_range_gbp_per_mwh) : bidText(c.bid_gbp_per_mwh), pct: c.pct_of_oracle ?? null };
}

export function CopilotCard({ data, summary, date }: { data: Copilot | null; summary: DashboardSummary | null; date: string }) {
  if (!data) return null;
  const sumDays = summary?.replay_days ?? [];
  const sumDay = sumDays.find((d) => d.date === date)?.copilot;
  const cpDay = data.days.find((d) => d.date === date);
  // This day's call: dashboard.json first (lane B's own summary), else copilot.json.
  const call = sumDay ? callFromSummary(sumDay) : cpDay ? callFromCopilot(cpDay) : null;
  const reason = sumDay?.status === "not_scored" ? sumDay.reason
    : sumDay?.status === "scored" && !call ? sumDay.note ?? "Nothing was tradable to answer."
    : !sumDay && cpDay && !call ? "Nothing was tradable to answer."
    : !sumDay && !cpDay ? "This day is outside the Copilot's scored days." : null;
  const best = [...data.days].sort((a, b) => b.policies.ours.gbp - a.policies.ours.gbp)[0];
  const bestCall = best ? callFromCopilot(best) : null;
  const paying = data.days.filter((d) => (d.policies.oracle.accepted_periods ?? 0) > 0 || d.policies.oracle.gbp > 0).length;
  const load = `${fmtNum(data.load.capacity_mw)} MW ${data.load.type.replace("_", " ")}, zone ${data.load.zone}`;
  return (
    <RailCard id="dash-copilot" eyebrow="Flex Copilot says" title={call ? callText(call) : `No Copilot call for ${shortDay(`${date}T12:00:00Z`)}`}
      href="#copilot" link="Optimised Model" className="rc-copilot">
      {call ? (
        <p className="rc-line">
          {load}, this day{call.windows.length > 1 && <>, plus {call.windows.length - 1} more window{call.windows.length > 2 ? "s" : ""}</>}.
          {call.pct != null && <> Captured <strong>{Math.round(call.pct * 100)}%</strong> of the hindsight-perfect plan.</>}
        </p>
      ) : (
        <p className="rc-line">
          {reason}{" "}
          {bestCall && best.date !== date && <>Its scored call on {shortDay(`${best.date}T12:00:00Z`)}: {callText(bestCall).toLowerCase()}{bestCall.pct != null && <>, <strong>{Math.round(bestCall.pct * 100)}%</strong> of perfect hindsight</>}.</>}
        </p>
      )}
      <p className="rc-caveat">
        <strong>Fragile:</strong> {paying === 1 ? "one day" : `${paying} days`} of {data.days.length} carried the result.
        {" "}Assumes full delivery. Not a revenue promise.
      </p>
    </RailCard>
  );
}
