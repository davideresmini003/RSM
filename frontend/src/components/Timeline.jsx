import React from "react";
import { useI18n } from "../lib/i18n";

const STEPS = [
  { key: "interes", label: "state_interes" },
  { key: "nca_pending", label: "state_chat_open" },
  { key: "nca_signed", label: "state_nca_signed" },
  { key: "quote_pending", label: "state_quote_pending" },
  { key: "quote_received", label: "state_quote_received" },
  { key: "contract_pending", label: "state_contract_pending" },
  { key: "closed", label: "state_closed" },
];

const STATE_INDEX = {
  nca_pending: 1,
  quote_pending: 3,
  quote_received: 4,
  contract_pending: 5,
  closed: 6,
};

export function Timeline({ state }) {
  const { t } = useI18n();
  const activeIdx = state === "closed" ? STEPS.length : (STATE_INDEX[state] ?? 0);
  return (
    <div className="w-full py-4" data-testid="operation-timeline">
      <div className="flex items-start relative">
        <div className="absolute top-4 left-8 right-8 h-[2px] bg-[hsl(var(--border))] -z-0" />
        {STEPS.map((s, i) => {
          const cls = i < activeIdx ? "tl-completed" : i === activeIdx ? "tl-active" : "tl-pending";
          return (
            <div key={s.key} className="flex-1 flex flex-col items-center relative z-10">
              <div className={`tl-node ${cls}`}>{i + 1}</div>
              <div className="overline mt-2 text-center text-[10px] leading-tight px-1">
                {t(`operation.${s.label}`)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
