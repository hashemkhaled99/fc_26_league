"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { StartBiddingButton } from "@/components/StartBiddingButton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CARD_TYPES } from "@/lib/cards/types";
import { formatMoney } from "@/lib/utils";
import { getPublicSocketUrl } from "@/lib/public-env";
import { bidTimerSecondsToHours, hoursToBidTimerSeconds } from "@/lib/format-duration";

interface AdminUser {
  id: string;
  displayName: string;
  teamName: string;
  budget: number;
  isAdmin: boolean;
  hasPin: boolean;
  squadCount: number;
  squadLimit: number;
  squadPct: number;
}

interface Settings {
  startingBudget: number;
  bidTimerSeconds: number;
  deadlineBidTimerSeconds: number;
  deadlineDayEnabled: boolean;
  deadlineStartsAt: string | null;
  deadlineEndsAt: string | null;
  transferWindowEndsAt: string | null;
  rebidRoundEnabled: boolean;
  enabledCardTypes: string[];
  streakBonusEnabled: boolean;
  streakBonusAt3: number;
  streakBonusAt5: number;
  leaguePrizeFirst: number;
  leaguePrizeSecond: number;
  telegramWebhookUrl: string | null;
  tradingEnabledDuringLeague: boolean;
  allowSquadOverflowForIcons: boolean;
}

interface AdminData {
  room: { code: string; name: string; phase: string; currentSeason: number };
  settings: Settings | null;
  activeAuctions: number;
  users: AdminUser[];
  admin: { id: string; teamName: string; budget: number };
  iconProgress?: {
    generated: boolean;
    allReady: boolean;
    checklist: Array<{
      userId: string;
      teamName: string;
      completed: number;
      total: number;
      awaitingReplacement: number;
      ready: boolean;
    }>;
  };
  heroProgress?: {
    generated: boolean;
    allReady: boolean;
    checklist: Array<{
      userId: string;
      teamName: string;
      completed: number;
      total: number;
      awaitingReplacement: number;
      ready: boolean;
    }>;
  };
  disputedMatches?: Array<{
    id: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
  }>;
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function AdminDashboard({ code }: { code: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    action: string;
    danger?: boolean;
    payload?: Record<string, unknown>;
  } | null>(null);
  const [resolveMatch, setResolveMatch] = useState<{
    id: string;
    homeTeam: string;
    awayTeam: string;
  } | null>(null);
  const [resolveHome, setResolveHome] = useState("0");
  const [resolveAway, setResolveAway] = useState("0");
  const [assignPlayerName, setAssignPlayerName] = useState("");
  const [assignUserId, setAssignUserId] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/admin`), apiFetchInit);
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(json.error ?? "Failed to load admin");
    return json as AdminData;
  }, [code]);

  useEffect(() => {
    load()
      .then((d) => {
        setData(d);
        setSettings(
          d.settings ?? {
            startingBudget: 400000000,
            bidTimerSeconds: 60,
            deadlineBidTimerSeconds: 20,
            deadlineDayEnabled: true,
            deadlineStartsAt: null,
            deadlineEndsAt: null,
            transferWindowEndsAt: null,
            rebidRoundEnabled: false,
            enabledCardTypes: [],
            streakBonusEnabled: true,
            streakBonusAt3: 15000000,
            streakBonusAt5: 30000000,
            leaguePrizeFirst: 50000000,
            leaguePrizeSecond: 25000000,
            telegramWebhookUrl: null,
            tradingEnabledDuringLeague: false,
            allowSquadOverflowForIcons: false,
          }
        );
      })
      .catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    let active = true;
    import("socket.io-client").then(({ io }) => {
      if (!active) return;
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => socket.emit("room:join", { roomCode: code }));
      socket.on("budget:updated", () => {
        load().then((d) => {
          setData(d);
          if (d.settings) setSettings(d.settings);
        });
      });
      return () => socket.disconnect();
    });
    return () => {
      active = false;
    };
  }, [code, load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/admin/settings`), {
        ...apiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          deadlineStartsAt: settings.deadlineStartsAt,
          deadlineEndsAt: settings.deadlineEndsAt,
          transferWindowEndsAt: settings.transferWindowEndsAt,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSettings(json.settings);
      flash("Settings saved");
      await load().then(setData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/admin/actions`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      flash(json.message ?? "Done");
      setConfirm(null);
      await load().then((d) => {
        setData(d);
        if (d.settings) setSettings(d.settings);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">{error}</div>
    );
  }

  if (!data || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fc-gold font-display text-xl">
        Loading admin...
      </div>
    );
  }

  const { room, users, activeAuctions, admin, iconProgress, heroProgress, disputedMatches } = data;
  const iconsReady =
    (!iconProgress?.generated || iconProgress.allReady) &&
    (!heroProgress?.generated || heroProgress.allReady);
  const marketLocked =
    Boolean(settings.transferWindowEndsAt) &&
    new Date(settings.transferWindowEndsAt!).getTime() <= Date.now() &&
    !settings.rebidRoundEnabled;

  return (
    <RoomLayoutShell
      code={room.code}
      roomName={room.name}
      phase={room.phase}
      teamName={admin.teamName}
      budget={admin.budget}
      isAdmin
    >
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fc-gold px-6 py-3 text-sm font-semibold text-fc-navy shadow-glow">
          {toast}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          danger={confirm.danger}
          loading={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => runAction(confirm.action, confirm.payload)}
        />
      )}

      {resolveMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="fc-card w-full max-w-md p-6">
            <h3 className="font-display text-xl font-bold text-fc-gold">Resolve dispute</h3>
            <p className="mt-2 text-sm text-fc-muted">
              {resolveMatch.homeTeam} vs {resolveMatch.awayTeam}
            </p>
            <div className="mt-4 flex gap-3">
              <input
                type="number"
                min={0}
                className="fc-input text-center"
                value={resolveHome}
                onChange={(e) => setResolveHome(e.target.value)}
              />
              <span className="self-center text-fc-muted">–</span>
              <input
                type="number"
                min={0}
                className="fc-input text-center"
                value={resolveAway}
                onChange={(e) => setResolveAway(e.target.value)}
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" className="fc-btn-secondary flex-1" onClick={() => setResolveMatch(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="fc-btn-primary flex-1"
                onClick={async () => {
                  await runAction("resolve_match", {
                    matchId: resolveMatch.id,
                    homeScore: Number(resolveHome),
                    awayScore: Number(resolveAway),
                  });
                  setResolveMatch(null);
                }}
              >
                Confirm score
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        {/* Phase controls */}
        <GlowCard glow="gold">
          <h2 className="font-display text-xl font-bold text-fc-gold">Phase Controls</h2>
          <p className="text-sm text-fc-muted mt-1">
            Season {room.currentSeason} · Phase: <span className="text-white">{room.phase}</span>
            {" · "}
            {activeAuctions} live auction{activeAuctions === 1 ? "" : "s"}
            {room.phase === "bidding" && (
              <>
                {" · "}
                <span className="text-fc-gold">Market deadline: 9:45 PM</span>
                {settings.rebidRoundEnabled && (
                  <span className="text-amber-400"> · Rebid round active (2 min timers)</span>
                )}
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {room.phase === "lobby" && <StartBiddingButton roomCode={room.code} />}

            {room.phase === "bidding" && (
              <>
                {marketLocked ? (
                  <button
                    type="button"
                    className="fc-btn-primary"
                    disabled={busy}
                    onClick={() => runAction("open_market")}
                  >
                    Open Market
                  </button>
                ) : (
                  <Link href={`/room/${room.code}/market`} className="fc-btn-secondary">
                    Go to Market
                  </Link>
                )}
                <button
                  type="button"
                  className="rounded-lg bg-red-500/90 px-5 py-3 font-bold text-white hover:bg-red-400"
                  onClick={() =>
                    setConfirm({
                      title: "Force Close Market",
                      message:
                        "This closes all live auctions now (highest bid wins) and locks the transfer window. This cannot be undone easily.",
                      action: "force_close_market",
                      danger: true,
                    })
                  }
                >
                  Force Close Market
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-orange-500/90 px-5 py-3 font-bold text-white hover:bg-orange-400"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "Return All Players to Market",
                      message:
                        "Cancels all live auctions, removes every regular player from all squads, refunds each manager their purchase price, and lists everyone on the market until 9:45 PM. Icons/Heroes stay. This cannot be undone.",
                      action: "return_all_to_market",
                      danger: true,
                    })
                  }
                >
                  Return All to Market (9:45)
                </button>
                <button
                  type="button"
                  className="fc-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "Restore Squads from Auctions",
                      message:
                        "Rebuilds squads from closed auctions (highest bidder wins). Use this if players disappeared after the deadline. Does not change budgets.",
                      action: "restore_squads_from_auctions",
                    })
                  }
                >
                  Restore Squads from Closed Auctions
                </button>
                <button
                  type="button"
                  className="fc-btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "Force Deadline 9:45 PM",
                      message:
                        "Sets every available listing and live auction timer to end at 9:45 PM without clearing squads.",
                      action: "force_deadline_930",
                    })
                  }
                >
                  Sync Timers → 9:45 PM
                </button>
                {!settings.rebidRoundEnabled && (
                  <button
                    type="button"
                    className="fc-btn-primary"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "Enable Rebid Round",
                        message:
                          "Opens a second-chance round for players that were never bid on. Anyone can request a bid — each auction gets a fixed 2-minute timer (+30s if bid in the last minute). Best used after the 9:45 PM deadline or Force Close Market.",
                        action: "enable_rebid_round",
                      })
                    }
                  >
                    Enable Rebid Round (2 min)
                  </button>
                )}
                {settings.rebidRoundEnabled && (
                  <button
                    type="button"
                    className="rounded-lg bg-amber-500/90 px-5 py-3 font-bold text-white hover:bg-amber-400"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "Close Rebid Round",
                        message:
                          "Closes the rebid round and locks the market. Any live rebid auctions will stay open until their 2-minute timer ends.",
                        action: "disable_rebid_round",
                        danger: true,
                      })
                    }
                  >
                    Close Rebid Round
                  </button>
                )}
                <button
                  type="button"
                  className="fc-btn-primary"
                  onClick={() =>
                    setConfirm({
                      title: "Complete Squads Phase",
                      message:
                        "Locks the market, closes all auctions, and applies a random bot boost (+2 to +5 OVR) to 1–2 players in each squad. Each boost raises 2–3 role face stats by the full OVR amount (PAC/SHO/PAS/DRI/DEF/PHY, or GK DIV/HAN/KIC/REF/SPD/POS).",
                      action: "complete_squads",
                      danger: true,
                    })
                  }
                >
                  Complete Squads
                </button>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="fc-btn-secondary text-sm"
              disabled={busy}
              onClick={() => runAction("extend_deadline", { minutes: 15 })}
            >
              Extend Deadline +15m
            </button>
            <button
              type="button"
              className="fc-btn-secondary text-sm"
              disabled={busy}
              onClick={() => runAction("extend_deadline", { minutes: 30 })}
            >
              Extend +30m
            </button>
            <button
              type="button"
              className="fc-btn-secondary text-sm"
              disabled={busy || room.phase === "lobby"}
              onClick={() =>
                setConfirm({
                  title: "Generate Icon Boxes",
                  message: "Creates 4 sealed icon boxes per user for this season. Can only run once per season.",
                  action: "generate_icon_boxes",
                })
              }
            >
              Generate Icon Boxes
            </button>
            <button
              type="button"
              className="fc-btn-secondary text-sm"
              disabled={busy || room.phase === "lobby"}
              onClick={() =>
                setConfirm({
                  title: "Generate Hero Boxes",
                  message: "Same reveal flow as Icons, but Hero-tier players. Once per season.",
                  action: "generate_hero_boxes",
                })
              }
            >
              Generate Hero Boxes
            </button>
            <button
              type="button"
              className={`fc-btn-secondary text-sm ${!iconsReady ? "opacity-60" : ""}`}
              disabled={busy || room.phase === "league" || !iconsReady}
              title={
                !iconsReady
                  ? "Waiting for all users to finish icon boxes"
                  : "Start the league"
              }
              onClick={() =>
                setConfirm({
                  title: "Start League",
                  message:
                    "Generates round-robin fixtures and moves the room into league phase. Icon boxes must all be completed first (if generated).",
                  action: "start_league",
                })
              }
            >
              Start League
            </button>
            {room.phase === "bidding" && (
              <button
                type="button"
                className="fc-btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Distribute transfer cards",
                    message: "Gives every manager 2 fresh random cards (replaces unused ones).",
                    action: "distribute_cards",
                  })
                }
              >
                Distribute Transfer Cards (2)
              </button>
            )}
            {room.phase === "league" && (
              <button
                type="button"
                className="fc-btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "Redistribute fixture cards",
                    message: "Replaces unused fixture cards with 3 fresh ones each (whole league pool).",
                    action: "distribute_fixture_cards",
                  })
                }
              >
                Redistribute Fixture Cards (3)
              </button>
            )}
            <button
              type="button"
              className="fc-btn-secondary text-sm"
              disabled={busy || room.phase !== "league"}
              onClick={() =>
                setConfirm({
                  title: "End Season",
                  message:
                    "Calculates awards, pays league prizes into budgets, and opens the Awards ceremony. You can still end with unconfirmed fixtures.",
                  action: "end_season",
                  danger: true,
                })
              }
            >
              End Season
            </button>
            <button
              type="button"
              className="fc-btn-primary text-sm"
              disabled={busy || room.phase !== "season_end"}
              onClick={() =>
                setConfirm({
                  title: "Start New Season",
                  message:
                    "Keeps all squads and budgets. Resets streaks, clears cards, reopens the transfer market, and deals 2 new cards. Season number +1.",
                  action: "start_new_season",
                })
              }
            >
              Start New Season
            </button>
          </div>

          {iconProgress?.generated && (
            <div className="mt-4 rounded-lg border border-white/10 bg-fc-charcoal/50 p-3">
              <p className="text-xs font-semibold uppercase text-fc-muted mb-2">
                Icon box progress {iconProgress.allReady ? "· Ready" : "· Waiting"}
              </p>
              <div className="space-y-1">
                {iconProgress.checklist.map((c) => (
                  <div key={c.userId} className="flex justify-between text-sm">
                    <span>{c.teamName}</span>
                    <span className={c.ready ? "text-fc-green" : "text-fc-gold"}>
                      {c.completed}/{c.total}
                      {c.awaitingReplacement > 0 ? ` · ${c.awaitingReplacement} replace` : ""}
                      {c.ready ? " ✓" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {heroProgress?.generated && (
            <div className="mt-4 rounded-lg border border-white/10 bg-fc-charcoal/50 p-3">
              <p className="text-xs font-semibold uppercase text-fc-muted mb-2">
                Hero box progress {heroProgress.allReady ? "· Ready" : "· Waiting"}
              </p>
              <div className="space-y-1">
                {heroProgress.checklist.map((c) => (
                  <div key={c.userId} className="flex justify-between text-sm">
                    <span>{c.teamName}</span>
                    <span className={c.ready ? "text-fc-green" : "text-fc-gold"}>
                      {c.completed}/{c.total}
                      {c.awaitingReplacement > 0 ? ` · ${c.awaitingReplacement} replace` : ""}
                      {c.ready ? " ✓" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {disputedMatches && disputedMatches.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3">
              <p className="text-xs font-semibold uppercase text-red-300 mb-2">Disputed matches</p>
              {disputedMatches.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1">
                  <span>
                    {m.homeTeam} {m.homeScore ?? "?"}–{m.awayScore ?? "?"} {m.awayTeam}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-fc-gold hover:underline"
                    onClick={() => {
                      setResolveHome(String(m.homeScore ?? 0));
                      setResolveAway(String(m.awayScore ?? 0));
                      setResolveMatch({
                        id: m.id,
                        homeTeam: m.homeTeam,
                        awayTeam: m.awayTeam,
                      });
                    }}
                  >
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlowCard>

        {/* Force assign — top of admin so it is not buried under settings */}
        <GlowCard glow="green">
          <h2 className="font-display text-lg font-semibold mb-2 text-fc-green">
            Force Assign Player
          </h2>
          <p className="text-sm text-fc-muted mb-4">
            Move a player onto a manager&apos;s squad (no budget change). Cancels any live auction for
            that player. Example: <span className="text-fc-gold">Vini</span> →{" "}
            <span className="text-fc-gold">AboJoToussef</span>.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-fc-muted uppercase">Player name</span>
              <input
                className="fc-input w-48 py-2 text-sm"
                placeholder="Vini"
                value={assignPlayerName}
                onChange={(e) => setAssignPlayerName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-fc-muted uppercase">To manager</span>
              <select
                className="fc-input w-56 py-2 text-sm"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              >
                <option value="">Select manager…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.teamName} ({u.displayName})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="fc-btn-primary"
              disabled={busy || !assignPlayerName.trim() || !assignUserId}
              onClick={() => {
                const target = users.find((u) => u.id === assignUserId);
                setConfirm({
                  title: "Force assign player?",
                  message: `Assign "${assignPlayerName.trim()}" to ${target?.teamName ?? "manager"} (${target?.displayName ?? ""}). No money changes hands.`,
                  action: "force_assign_player",
                  payload: {
                    playerName: assignPlayerName.trim(),
                    userId: assignUserId,
                  },
                });
              }}
            >
              Assign
            </button>
          </div>
        </GlowCard>

        {/* Settings */}
        <GlowCard>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-lg font-semibold">Room Settings</h2>
            <button
              type="button"
              disabled={busy}
              onClick={saveSettings}
              className="fc-btn-primary text-sm py-2"
            >
              {busy ? "Saving..." : "Save settings"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-fc-muted text-xs uppercase">Manager budget (M)</span>
              <input
                type="number"
                className="fc-input mt-1"
                value={Math.round(settings.startingBudget / 1_000_000)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    startingBudget: Number(e.target.value) * 1_000_000,
                  })
                }
              />
              <span className="mt-1 block text-xs text-fc-muted">
                Saves to room settings and sets every manager&apos;s budget when you click Save settings.
              </span>
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">Bid timer (hours)</span>
              <input
                type="number"
                min={0.01}
                max={12}
                step={0.25}
                className="fc-input mt-1"
                value={bidTimerSecondsToHours(settings.bidTimerSeconds)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bidTimerSeconds: hoursToBidTimerSeconds(Number(e.target.value)),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">Deadline bid timer (hours)</span>
              <input
                type="number"
                min={0.01}
                max={12}
                step={0.25}
                className="fc-input mt-1"
                value={bidTimerSecondsToHours(settings.deadlineBidTimerSeconds)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deadlineBidTimerSeconds: hoursToBidTimerSeconds(Number(e.target.value)),
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input
                type="checkbox"
                checked={settings.deadlineDayEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, deadlineDayEnabled: e.target.checked })
                }
              />
              Deadline Day enabled
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">Deadline starts</span>
              <input
                type="datetime-local"
                className="fc-input mt-1"
                value={toLocalInput(settings.deadlineStartsAt)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deadlineStartsAt: fromLocalInput(e.target.value),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">Deadline ends (short timers)</span>
              <input
                type="datetime-local"
                className="fc-input mt-1"
                value={toLocalInput(settings.deadlineEndsAt)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deadlineEndsAt: fromLocalInput(e.target.value),
                  })
                }
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-fc-muted text-xs uppercase">
                Transfer window ends (hard market close)
              </span>
              <input
                type="datetime-local"
                className="fc-input mt-1"
                value={toLocalInput(settings.transferWindowEndsAt)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    transferWindowEndsAt: fromLocalInput(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.streakBonusEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, streakBonusEnabled: e.target.checked })
                }
              />
              Streak bonuses enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.tradingEnabledDuringLeague}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tradingEnabledDuringLeague: e.target.checked,
                  })
                }
              />
              Trading during league
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.allowSquadOverflowForIcons}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    allowSquadOverflowForIcons: e.target.checked,
                  })
                }
              />
              Allow squad overflow for icons
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">3-win streak bonus (M)</span>
              <input
                type="number"
                className="fc-input mt-1"
                value={Math.round(settings.streakBonusAt3 / 1_000_000)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    streakBonusAt3: Number(e.target.value) * 1_000_000,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">5-win streak bonus (M)</span>
              <input
                type="number"
                className="fc-input mt-1"
                value={Math.round(settings.streakBonusAt5 / 1_000_000)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    streakBonusAt5: Number(e.target.value) * 1_000_000,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">1st place prize (M)</span>
              <input
                type="number"
                className="fc-input mt-1"
                value={Math.round(settings.leaguePrizeFirst / 1_000_000)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    leaguePrizeFirst: Number(e.target.value) * 1_000_000,
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-fc-muted text-xs uppercase">2nd place prize (M)</span>
              <input
                type="number"
                className="fc-input mt-1"
                value={Math.round(settings.leaguePrizeSecond / 1_000_000)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    leaguePrizeSecond: Number(e.target.value) * 1_000_000,
                  })
                }
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-fc-muted text-xs uppercase">Telegram webhook / bot URL</span>
              <input
                className="fc-input mt-1"
                placeholder="Optional — Phase 9"
                value={settings.telegramWebhookUrl ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, telegramWebhookUrl: e.target.value || null })
                }
              />
            </label>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase text-fc-muted mb-2">Enabled card types</p>
            <div className="flex flex-wrap gap-2">
              {CARD_TYPES.map((c) => {
                const on = settings.enabledCardTypes.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      const next = on
                        ? settings.enabledCardTypes.filter((k) => k !== c.key)
                        : [...settings.enabledCardTypes, c.key];
                      setSettings({ ...settings, enabledCardTypes: next });
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      on ? "bg-fc-gold text-fc-navy" : "bg-fc-charcoal text-fc-muted"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        </GlowCard>

        {/* Room overview */}
        <GlowCard>
          <h2 className="font-display text-lg font-semibold mb-4">
            Room Overview ({users.length} users)
          </h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-fc-charcoal/50 px-4 py-3"
              >
                <div>
                  <p className="font-semibold">
                    {u.teamName}{" "}
                    <span className="text-fc-muted text-sm">({u.displayName})</span>
                    {u.isAdmin && (
                      <span className="ml-2 text-[10px] bg-fc-gold/20 text-fc-gold px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-fc-muted">
                    Squad {u.squadCount}/{u.squadLimit} ({u.squadPct}%)
                    {u.hasPin ? " · PIN set" : " · No PIN"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <span className="text-fc-muted">Budget (M)</span>
                    <input
                      type="number"
                      className="fc-input w-20 py-1 text-xs"
                      defaultValue={Math.round(u.budget / 1_000_000)}
                      key={`${u.id}-${u.budget}`}
                      id={`admin-budget-${u.id}`}
                      min={0}
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-fc-gold/20 px-2 py-1 text-xs font-bold text-fc-gold hover:bg-fc-gold hover:text-fc-navy"
                      disabled={busy}
                      onClick={() => {
                        const input = document.getElementById(
                          `admin-budget-${u.id}`
                        ) as HTMLInputElement | null;
                        const millions = Number(input?.value);
                        if (Number.isNaN(millions) || millions < 0) return;
                        runAction("set_user_budget", {
                          userId: u.id,
                          budget: millions * 1_000_000,
                        });
                      }}
                    >
                      Set
                    </button>
                  </label>
                  <span className="text-fc-green text-xs font-mono">
                    {formatMoney(u.budget)}
                  </span>
                  {!u.isAdmin && (
                    <>
                      <button
                        type="button"
                        className="text-xs font-semibold text-fc-accent hover:underline"
                        onClick={() => runAction("promote_admin", { userId: u.id })}
                      >
                        Promote
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-fc-muted hover:underline"
                        onClick={() => runAction("reset_pin", { userId: u.id })}
                      >
                        Reset PIN
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-red-300 hover:underline"
                        onClick={() =>
                          setConfirm({
                            title: `Kick ${u.teamName}?`,
                            message: "Removes this user and their squad from the room.",
                            action: "kick_user",
                            payload: { userId: u.id },
                            danger: true,
                          })
                        }
                      >
                        Kick
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>
    </RoomLayoutShell>
  );
}
