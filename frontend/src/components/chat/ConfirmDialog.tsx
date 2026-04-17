import { useState, useCallback, useRef } from "react";

let showConfirmGlobal: (message: string) => Promise<boolean> = () => Promise.resolve(false);

export function useConfirm() { return showConfirmGlobal; }

export function ConfirmDialogProvider() {
  const [state, setState] = useState<{ message: string; open: boolean }>({ message: "", open: false });
  const resolveRef = useRef<(v: boolean) => void>();

  showConfirmGlobal = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ message, open: true });
    });
  }, []);

  const close = (result: boolean) => {
    setState(s => ({ ...s, open: false }));
    resolveRef.current?.(result);
  };

  if (!state.open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => close(false)}>
      <div className="bg-background border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <p className="text-sm">{state.message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => close(false)} className="px-4 py-2 text-xs rounded-lg border hover:bg-muted transition-colors">Cancel</button>
          <button onClick={() => close(true)} className="px-4 py-2 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Confirm</button>
        </div>
      </div>
    </div>
  );
}
