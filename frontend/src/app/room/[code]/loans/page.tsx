"use client";

import { apiPath, apiFetchInit } from "@/lib/api-base";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { RoomLayoutShell } from "@/components/RoomLayoutShell";
import { GlowCard } from "@/components/GlowCard";
import { formatMoney } from "@/lib/utils";
import { onBudgetUpdated } from "@/lib/room-socket";
import { getPublicSocketUrl } from "@/lib/public-env";

interface PlayerChip {
  id: string;
  name: string;
  position: string;
  baseRating: number;
  realTeam: string;
  squadPlayerId?: string;
}

interface Partner {
  id: string;
  displayName: string;
  teamName: string;
}

interface LoanItem {
  id: string;
  lenderId: string;
  borrowerId: string;
  playerId: string;
  lender: Partner | null;
  borrower: Partner | null;
  player: PlayerChip | null;
  loanFee: number;
  fixturesTotal: number;
  fixturesPlayed: number;
  fixturesRemaining: number;
  status: string;
  createdAt: string;
}

interface LoansData {
  room: { code: string; name: string; phase: string; season: number };
  user: { id: string; displayName: string; teamName: string; budget: number; isAdmin: boolean };
  loansAllowed: boolean;
  minFixtures: number;
  maxFixtures: number;
  partners: Partner[];
  mySquad: PlayerChip[];
  incoming: LoanItem[];
  outgoing: LoanItem[];
  active: LoanItem[];
  history: LoanItem[];
}

type Tab = "inbox" | "create" | "active" | "history";

function LoanCard({
  loan,
  meId,
  onAccept,
  onReject,
  onCancel,
  onRecall,
  busy,
}: {
  loan: LoanItem;
  meId: string;
  onAccept?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  onRecall?: () => void;
  busy?: boolean;
}) {
  const iAmLender = loan.lenderId === meId;
  const statusColor =
    loan.status === "active"
      ? "text-fc-green"
      : loan.status === "rejected" || loan.status === "cancelled"
        ? "text-red-400"
        : loan.status === "returned"
          ? "text-fc-muted"
          : "text-fc-gold";

  return (
    <div className="fc-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{loan.lender?.teamName ?? "?"}</span>
          <span className="text-fc-muted"> loans to </span>
          <span className="font-semibold">{loan.borrower?.teamName ?? "?"}</span>
        </p>
        <span className={`text-xs font-bold uppercase ${statusColor}`}>{loan.status}</span>
      </div>

      {loan.player && (
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="font-semibold">
            <span className="text-fc-gold font-mono text-xs mr-1">{loan.player.baseRating}</span>
            {loan.player.name}
          </p>
          <p className="text-[10px] text-fc-muted">
            {loan.player.position} · {loan.player.realTeam}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm text-fc-muted">
        <span>{loan.fixturesTotal} fixture{loan.fixturesTotal !== 1 ? "s" : ""}</span>
        {loan.status === "active" && (
          <span className="text-fc-accent">{loan.fixturesRemaining} remaining</span>
        )}
        {loan.loanFee > 0 && (
          <span className="text-fc-green font-mono">Fee: {formatMoney(loan.loanFee)}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {onAccept && (
          <button type="button" disabled={busy} onClick={onAccept} className="fc-btn-primary px-4 py-2 text-sm">
            Accept
          </button>
        )}
        {onReject && (
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-red-300 border border-red-400/30 hover:bg-red-400/10"
          >
            Reject
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="fc-btn-secondary px-4 py-2 text-sm"
          >
            Cancel offer
          </button>
        )}
        {onRecall && (
          <button
            type="button"
            disabled={busy}
            onClick={onRecall}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-red-300 border border-red-400/30 hover:bg-red-400/10"
          >
            Recall early
          </button>
        )}
      </div>
    </div>
  );
}

export default function LoansPage() {
  const params = useParams();
  const code = (params.code as string).toUpperCase();
  const [data, setData] = useState<LoansData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("inbox");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [borrowerId, setBorrowerId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [loanFeeM, setLoanFeeM] = useState(0);
  const [fixtures, setFixtures] = useState(3);

  const load = useCallback(async () => {
    const res = await fetch(apiPath(`/api/rooms/${code}/loans`), apiFetchInit);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to load loans");
    return payload as LoansData;
  }, [code]);

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    const socketUrl = getPublicSocketUrl();
    import("socket.io-client").then(({ io }) => {
      const socket = io(socketUrl, { transports: ["websocket", "polling"] });
      socket.on("connect", () => socket.emit("room:join", { roomCode: code }));
      socket.on("loan:requested", () => {
        load().then(setData).catch(() => undefined);
        setToast("New loan offer received");
        setTimeout(() => setToast(null), 3000);
      });
      socket.on("loan:resolved", () => {
        load().then(setData).catch(() => undefined);
      });
      onBudgetUpdated(socket, () => load().then(setData).catch(() => undefined));
      return () => socket.disconnect();
    });
  }, [code, load]);

  async function loanAction(loanId: string, action: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/loans/${loanId}`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      setToast(`Loan ${result.status}`);
      setTimeout(() => setToast(null), 3000);
      const fresh = await load();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function submitLoan() {
    if (!borrowerId || !playerId) {
      setError("Pick a borrower and player");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(apiPath(`/api/rooms/${code}/loans`), {
        ...apiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerId,
          playerId,
          loanFee: loanFeeM * 1_000_000,
          fixturesTotal: fixtures,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to offer loan");
      setToast("Loan offer sent");
      setTimeout(() => setToast(null), 3000);
      setBorrowerId("");
      setPlayerId("");
      setLoanFeeM(0);
      setTab("inbox");
      const fresh = await load();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-display text-xl text-fc-gold">Loading loans...</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", count: data.incoming.length },
    { id: "create", label: "Offer loan" },
    { id: "active", label: "Active", count: data.active.length },
    { id: "history", label: "History" },
  ];

  return (
    <RoomLayoutShell
      code={data.room.code}
      roomName={data.room.name}
      phase={data.room.phase}
      teamName={data.user.teamName}
      budget={data.user.budget}
      isAdmin={data.user.isAdmin}
    >
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fc-gold px-6 py-3 text-sm font-semibold text-fc-navy shadow-glow">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-fc-gold">Player Loans</h1>
          <p className="mt-1 text-sm text-fc-muted">
            Lend a player for {data.minFixtures}–{data.maxFixtures} fixtures. You keep ownership; the borrower uses them in their squad.
          </p>
          {!data.loansAllowed && (
            <p className="mt-2 text-sm text-red-400">Loans are closed right now (market locked or wrong phase).</p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-fc-gold/15 text-fc-gold border border-fc-gold/30"
                  : "text-fc-muted hover:bg-white/5"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1.5 rounded-full bg-fc-gold/20 px-1.5 text-xs">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === "inbox" && (
          <div className="space-y-4">
            {data.incoming.length === 0 && data.outgoing.length === 0 ? (
              <GlowCard>
                <p className="text-center text-fc-muted py-4">No pending loan offers.</p>
              </GlowCard>
            ) : (
              <>
                {data.incoming.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    meId={data.user.id}
                    busy={busy}
                    onAccept={() => loanAction(loan.id, "accept")}
                    onReject={() => loanAction(loan.id, "reject")}
                  />
                ))}
                {data.outgoing.map((loan) => (
                  <LoanCard
                    key={loan.id}
                    loan={loan}
                    meId={data.user.id}
                    busy={busy}
                    onCancel={() => loanAction(loan.id, "cancel")}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {tab === "create" && (
          <GlowCard>
            {!data.loansAllowed ? (
              <p className="text-fc-muted text-center py-6">Loans are not available in this phase.</p>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-fc-muted text-xs uppercase">Borrower</span>
                  <select
                    className="fc-input mt-1 w-full"
                    value={borrowerId}
                    onChange={(e) => setBorrowerId(e.target.value)}
                  >
                    <option value="">Select team...</option>
                    {data.partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.teamName} ({p.displayName})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="text-fc-muted text-xs uppercase">Your player to loan</span>
                  <select
                    className="fc-input mt-1 w-full"
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                  >
                    <option value="">Select player...</option>
                    {data.mySquad.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.baseRating} {p.name} ({p.position})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-fc-muted text-xs uppercase">Loan fee (millions)</span>
                    <input
                      type="number"
                      min={0}
                      className="fc-input mt-1 w-full"
                      value={loanFeeM}
                      onChange={(e) => setLoanFeeM(Number(e.target.value))}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-fc-muted text-xs uppercase">
                      Fixtures ({data.minFixtures}–{data.maxFixtures})
                    </span>
                    <input
                      type="number"
                      min={data.minFixtures}
                      max={data.maxFixtures}
                      className="fc-input mt-1 w-full"
                      value={fixtures}
                      onChange={(e) => setFixtures(Number(e.target.value))}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  disabled={busy || !borrowerId || !playerId}
                  onClick={submitLoan}
                  className="fc-btn-primary w-full py-3"
                >
                  Send loan offer
                </button>
              </div>
            )}
          </GlowCard>
        )}

        {tab === "active" && (
          <div className="space-y-4">
            {data.active.length === 0 ? (
              <GlowCard>
                <p className="text-center text-fc-muted py-4">No active loans.</p>
              </GlowCard>
            ) : (
              data.active.map((loan) => (
                <LoanCard
                  key={loan.id}
                  loan={loan}
                  meId={data.user.id}
                  busy={busy}
                  onRecall={
                    loan.lenderId === data.user.id
                      ? () => loanAction(loan.id, "recall")
                      : undefined
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-4">
            {data.history.length === 0 ? (
              <GlowCard>
                <p className="text-center text-fc-muted py-4">No loan history yet.</p>
              </GlowCard>
            ) : (
              data.history.map((loan) => (
                <LoanCard key={loan.id} loan={loan} meId={data.user.id} />
              ))
            )}
          </div>
        )}
      </div>
    </RoomLayoutShell>
  );
}
