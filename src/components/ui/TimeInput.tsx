import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface TimeInputProps {
  value: string; // mm:ss format, e.g. "7:30"
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

function parse(v: string): { m: string; s: string } {
  if (!v) return { m: "", s: "" };
  const [mPart = "", sPart = ""] = v.split(":");
  return { m: mPart, s: sPart };
}

export function TimeInput({ value, onChange, className = "", disabled }: TimeInputProps) {
  const { m: initM, s: initS } = parse(value);
  const [minutes, setMinutes] = useState(initM);
  const [seconds, setSeconds] = useState(initS);
  const secRef = useRef<HTMLInputElement>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const minFocused = useRef(false);
  const secFocused = useRef(false);

  // Only sync external value changes when neither field is focused
  useEffect(() => {
    if (!minFocused.current && !secFocused.current) {
      const { m, s } = parse(value);
      setMinutes(m);
      setSeconds(s);
    }
  }, [value]);

  function emit(m: string, s: string) {
    if (!m && !s) { onChange(""); return; }
    const mm = m || "0";
    const ss = s.padStart(2, "0");
    onChange(`${mm}:${ss}`);
  }

  function handleMinutesFocus() {
    minFocused.current = true;
    if (minutes === "0" || minutes === "00") {
      setMinutes("");
    }
  }

  function handleMinutes(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    setMinutes(raw);
    if (raw.length === 2) secRef.current?.focus();
  }

  function handleMinutesBlur() {
    minFocused.current = false;
    let m = minutes;
    if (m.length > 2) m = m.slice(-2);
    setMinutes(m);
    emit(m, seconds);
  }

  function handleSecondsFocus() {
    secFocused.current = true;
    if (seconds === "0" || seconds === "00") {
      setSeconds("");
    }
  }

  function handleSeconds(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    setSeconds(raw);
  }

  function handleSecondsBlur() {
    secFocused.current = false;
    let s = seconds;
    if (s === "") {
      s = "00";
    } else if (s.length === 1) {
      s = "0" + s;
    } else if (s.length === 2) {
      if (parseInt(s) > 59) s = "59";
    } else {
      // 3+ digits: take last two and clamp
      s = s.slice(-2);
      if (parseInt(s) > 59) s = "59";
    }
    setSeconds(s);
    emit(minutes, s);
  }

  function handleSecondsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && seconds === "") {
      minRef.current?.focus();
    }
  }

  function clear() {
    setMinutes("");
    setSeconds("");
    onChange("");
    minRef.current?.focus();
  }

  const hasValue = minutes !== "" || seconds !== "";

  return (
    <div
      className={`flex items-center gap-0 rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${className}`}
    >
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="mm"
        value={minutes}
        onFocus={handleMinutesFocus}
        onChange={handleMinutes}
        onBlur={handleMinutesBlur}
        disabled={disabled}
        style={{ fontSize: "16px" }}
        className="w-10 bg-transparent border-0 outline-none text-center font-mono py-2 pl-2 pr-0 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="minutes"
      />
      <span className="font-mono text-muted-foreground select-none px-0.5">:</span>
      <input
        ref={secRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="ss"
        value={seconds}
        onFocus={handleSecondsFocus}
        onChange={handleSeconds}
        onBlur={handleSecondsBlur}
        onKeyDown={handleSecondsKeyDown}
        disabled={disabled}
        style={{ fontSize: "16px" }}
        className="w-10 bg-transparent border-0 outline-none text-center font-mono py-2 pr-0 pl-0 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="seconds"
      />
      {hasValue && !disabled && (
        <button
          type="button"
          onClick={clear}
          tabIndex={-1}
          className="px-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {!hasValue && <span className="px-2 text-transparent"><X className="h-3.5 w-3.5" /></span>}
    </div>
  );
}
