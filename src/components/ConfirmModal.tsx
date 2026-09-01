"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { modalBackdrop, modalPanel } from "@/lib/motion";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
  loading,
}: ConfirmModalProps) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      <motion.div
        key="confirm-modal"
        initial={reduced ? false : modalBackdrop.hidden}
        animate={modalBackdrop.show}
        exit={reduced ? undefined : modalBackdrop.hidden}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onClick={onCancel}
      >
        <motion.div
          initial={reduced ? false : modalPanel.hidden}
          animate={modalPanel.show}
          exit={reduced ? undefined : modalPanel.hidden}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className="fc-card w-full max-w-md p-6 shadow-glow"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-display text-xl font-bold text-fc-gold">{title}</h3>
          <p className="mt-2 text-sm text-fc-muted leading-relaxed">{message}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onCancel} className="fc-btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className={`flex-1 rounded-lg px-6 py-3 font-bold transition active:scale-[0.98] disabled:opacity-50 ${
                danger
                  ? "bg-red-500 text-white hover:bg-red-400 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                  : "fc-btn-primary"
              }`}
            >
              {loading ? "Working..." : confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
