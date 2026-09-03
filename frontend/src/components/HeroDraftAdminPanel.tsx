"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { GlowCard } from "@/components/GlowCard";
import { StartHeroDraftButton } from "@/components/StartHeroDraftButton";

type HeroSettings = {
  startingBudget: number;
  bidTurnTimeoutSeconds: number;
  tierWeightGold: number;
  tierWeightHero: number;
  tierWeightIcon: number;
  minPlayerRating: number;
  goldenRoundMinRating: number;
  turnHolderMustOpenBid: boolean;
  passiveDeductionRatio: number;
  tradeWindowMinutes: number;
  tradeWindowEnabled: boolean;
};

export function HeroDraftAdminPanel({
  code,
  phase,
}: {
  code: string;
  phase: string;
}) {
  const [settings, setSettings] = useState<HeroSettings | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), apiFetchInit);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load");
    setSettings(json.settings);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [code]);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), {
        ...apiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSettings(json.settings);
      setToast("Hero Draft settings saved");
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/hero-draft`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setToast(`Done: ${actionName}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-fc-muted text-sm">Loading Hero Draft settings…</p>;
  }

  const weightSum =
    settings.tierWeightGold + settings.tierWeightHero + settings.tierWeightIcon;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-lg bg-fc-gold px-4 py-2 text-sm font-semibold text-fc-navy">
          {toast}
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {phase === "lobby" && <StartHeroDraftButton roomCode={code} />}

      <GlowCard>
        <h3 className="font-display text-lg font-bold text-fc-gold mb-4">Hero Draft Settings</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Starting budget (M)</span>
            <input
              className="fc-input"
              type="number"
              value={settings.startingBudget / 1_000_000}
              onChange={(e) =>
                setSettings({ ...settings, startingBudget: Number(e.target.value) * 1_000_000 })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Bid turn timeout (s)</span>
            <input
              className="fc-input"
              type="number"
              value={settings.bidTurnTimeoutSeconds}
              onChange={(e) =>
                setSettings({ ...settings, bidTurnTimeoutSeconds: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Gold weight %</span>
            <input
              className="fc-input"
              type="number"
              value={settings.tierWeightGold}
              onChange={(e) =>
                setSettings({ ...settings, tierWeightGold: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Hero weight %</span>
            <input
              className="fc-input"
              type="number"
              value={settings.tierWeightHero}
              onChange={(e) =>
                setSettings({ ...settings, tierWeightHero: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Icon weight %</span>
            <input
              className="fc-input"
              type="number"
              value={settings.tierWeightIcon}
              onChange={(e) =>
                setSettings({ ...settings, tierWeightIcon: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Min player rating (draft pool)</span>
            <input
              className="fc-input"
              type="number"
              min={1}
              max={99}
              value={settings.minPlayerRating ?? 75}
              onChange={(e) =>
                setSettings({ ...settings, minPlayerRating: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Golden round min rating</span>
            <input
              className="fc-input"
              type="number"
              value={settings.goldenRoundMinRating}
              onChange={(e) =>
                setSettings({ ...settings, goldenRoundMinRating: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Passive deduction ratio</span>
            <input
              className="fc-input"
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={settings.passiveDeductionRatio}
              onChange={(e) =>
                setSettings({ ...settings, passiveDeductionRatio: Number(e.target.value) })
              }
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-fc-muted">Trade window (minutes)</span>
            <input
              className="fc-input"
              type="number"
              value={settings.tradeWindowMinutes}
              onChange={(e) =>
                setSettings({ ...settings, tradeWindowMinutes: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p className={`mt-2 text-xs ${weightSum === 100 ? "text-fc-green" : "text-red-400"}`}>
          Tier weights sum: {weightSum} {weightSum === 100 ? "✓" : "(must be 100)"}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.turnHolderMustOpenBid}
              onChange={(e) =>
                setSettings({ ...settings, turnHolderMustOpenBid: e.target.checked })
              }
            />
            Turn holder must open (can still pick any amount)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.tradeWindowEnabled}
              onChange={(e) =>
                setSettings({ ...settings, tradeWindowEnabled: e.target.checked })
              }
            />
            Trade window after draft
          </label>
        </div>
        <button className="fc-btn-primary mt-4" disabled={busy || weightSum !== 100} onClick={save}>
          Save settings
        </button>
      </GlowCard>

      <GlowCard>
        <h3 className="font-display text-lg font-bold mb-3">Phase controls</h3>
        <div className="flex flex-wrap gap-2">
          {phase === "hero_draft" && (
            <button className="fc-btn-secondary text-sm" disabled={busy} onClick={() => action("force_advance")}>
              Force advance turn
            </button>
          )}
          {(phase === "hero_draft" || phase === "draft_recap") && (
            <button className="fc-btn-secondary text-sm" disabled={busy} onClick={() => action("open_trade_window")}>
              Open trade window
            </button>
          )}
          {phase === "trade_window" && (
            <button className="fc-btn-secondary text-sm" disabled={busy} onClick={() => action("close_trade_window")}>
              Close trade window
            </button>
          )}
          {phase === "hero_draft" && (
            <button className="fc-btn-secondary text-sm" disabled={busy} onClick={() => action("skip_to_recap")}>
              Skip to recap
            </button>
          )}
        </div>
      </GlowCard>
    </div>
  );
}
