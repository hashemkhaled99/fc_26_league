/** Lightweight CSS-only ambient layer — no JS animation loops. */
export function AmbientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="ambient-orb ambient-orb-gold" />
      <div className="ambient-orb ambient-orb-accent" />
      <div className="ambient-orb ambient-orb-green" />
      <div className="ambient-grid" />
    </div>
  );
}
