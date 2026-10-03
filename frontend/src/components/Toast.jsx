import { useEffect } from "react";

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast, onDone]);

  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`}>{toast.message}</div>;
}
