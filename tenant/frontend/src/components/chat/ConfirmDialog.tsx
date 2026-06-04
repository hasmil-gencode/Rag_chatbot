import { useState, useCallback, useRef } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  extraAction?: { text: string; value: string };
}

type ConfirmResult = boolean | string;

let showConfirmGlobal: ((opts: string | ConfirmOptions) => Promise<ConfirmResult>) = () => Promise.resolve(false);

export function useConfirm() { return showConfirmGlobal; }

export function ConfirmDialogProvider() {
  const [state, setState] = useState<{ opts: ConfirmOptions; open: boolean }>({ opts: { message: "" }, open: false });
  const resolveRef = useRef<(v: ConfirmResult) => void>();

  showConfirmGlobal = useCallback((opts: string | ConfirmOptions) => {
    const parsed = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<ConfirmResult>((resolve) => {
      resolveRef.current = resolve;
      setState({ opts: parsed, open: true });
    });
  }, []);

  const close = (result: ConfirmResult) => {
    setState(s => ({ ...s, open: false }));
    resolveRef.current?.(result);
  };

  if (!state.open) return null;
  const { title, message, confirmText, cancelText, extraAction } = state.opts;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => close(false)}>
      <div className="bg-background border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <p className="text-sm">{message}</p>
        <div className="flex gap-2 justify-end flex-wrap">
          <button onClick={() => close(false)} className="px-4 py-2 text-xs rounded-lg border hover:bg-muted transition-colors">{cancelText || 'Cancel'}</button>
          {extraAction && (
            <button onClick={() => close(extraAction.value)} className="px-4 py-2 text-xs rounded-lg border border-primary text-primary hover:bg-primary/10 transition-colors">{extraAction.text}</button>
          )}
          <button onClick={() => close(true)} className="px-4 py-2 text-xs rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">{confirmText || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
