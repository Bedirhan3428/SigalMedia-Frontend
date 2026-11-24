"use client";
import { useRef, useState } from "react";
import type { DurationKey, Post } from "@/lib/feed/types";
import { Icon } from "./glyphs";
import { Sheet } from "./Sheet";
import { ParentPreview } from "./ComposerSheet";

const DURS: [DurationKey, string, string][] = [["1s", "1 saat", "1 saat"], ["1g", "1 gün", "1 gün"], ["3g", "3 gün", "3 gün"], ["7g", "7 gün", "7 gün"]];
let uid = 0;

export function PollComposerSheet({ parent, onClose, onSubmit, opener }: {
  parent: Post | null;
  onClose: () => void;
  onSubmit: (d: { question: string; options: string[]; durationKey: DurationKey }) => Promise<void>;
  opener?: HTMLElement | null;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(() => [{ k: ++uid, v: "" }, { k: ++uid, v: "" }]);
  const [dur, setDur] = useState<DurationKey>("1g");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const filled = opts.filter((o) => o.v.trim());
  const valid = !!q.trim() && filled.length >= 2;

  const add = () => {
    if (opts.length >= 4) return;
    const k = ++uid;
    setOpts((o) => [...o, { k, v: "" }]);
    setTimeout(() => refs.current[k]?.focus(), 0);
  };
  const remove = (i: number) => {
    if (opts.length <= 2) return;
    const focusKey = opts[Math.max(0, i - 1)].k === opts[i].k ? opts[1].k : opts[Math.max(0, i - 1)].k;
    setOpts((o) => o.filter((_, j) => j !== i));
    setTimeout(() => refs.current[focusKey]?.focus(), 0);
  };
  const share = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit({ question: q.trim(), options: filled.map((o) => o.v.trim()), durationKey: dur });
    } catch {
      setErr("Paylaşılamadı. Tekrar dene.");
      setBusy(false);
    }
  };

  return (
    <Sheet titleId="fd-poT" title={parent ? "Anketle yanıtla" : "Anket oluştur"} onClose={onClose} opener={opener}>
      <div className="fd-sb">
        {parent ? <ParentPreview parent={parent} /> : null}
        <label className="fd-lab" htmlFor="fd-pq">SORU</label>
        <input className="fd-field" id="fd-pq" maxLength={120} placeholder="Ne sormak istersin?" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="fd-lab" id="fd-optLab">SEÇENEKLER (2–4)</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="group" aria-labelledby="fd-optLab">
          {opts.map((o, i) => (
            <div className="fd-orow" key={o.k}>
              <input
                ref={(el) => { refs.current[o.k] = el; }}
                className="fd-field"
                maxLength={40}
                placeholder={`Seçenek ${i + 1}`}
                aria-label={`Seçenek ${i + 1}`}
                value={o.v}
                onChange={(e) => setOpts((all) => all.map((x) => (x.k === o.k ? { ...x, v: e.target.value } : x)))}
              />
              <button type="button" className="fd-ib" aria-label={`Seçenek ${i + 1} sil`} disabled={opts.length <= 2} onClick={() => remove(i)}><Icon id="i-x" /></button>
            </div>
          ))}
        </div>
        <button type="button" className="fd-ghost" disabled={opts.length >= 4} onClick={add}>+ Seçenek ekle</button>
        <span className="fd-lab" id="fd-durLab">SÜRE</span>
        <div className="fd-durs" role="radiogroup" aria-labelledby="fd-durLab">
          {DURS.map(([k, label, aria]) => (
            <button key={k} type="button" className="fd-dur" role="radio" aria-checked={dur === k} aria-label={aria} onClick={() => setDur(k)}>{label}</button>
          ))}
        </div>
        {!valid ? <p className="fd-cnt" style={{ textAlign: "left" }} data-testid="fd-poll-hint">Bir soru ve en az 2 dolu seçenek gerekli.</p> : null}
        {err ? <p className="fd-err" role="alert">{err}</p> : null}
        <button type="button" className="fd-cta" disabled={!valid || busy} onClick={share}>{busy ? "Paylaşılıyor…" : "Anketi paylaş"}</button>
      </div>
    </Sheet>
  );
}
