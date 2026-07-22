import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';

interface WebViewPanelProps {
  url: string;
  onClose: () => void;
}

export const WebViewPanel = ({ url, onClose }: WebViewPanelProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  // null = still checking, true = embed directly, false = use proxy
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  const [finalUrl, setFinalUrl] = useState(url);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const token = localStorage.getItem('token') || '';
  const proxyUrl = `/api/webview-proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
  // What the iframe actually loads: direct URL if embeddable, else our proxy.
  const iframeSrc = embeddable === false ? proxyUrl : url;
  // What "open in new tab" should point to: always the real site.
  const openUrl = finalUrl || url;

  // Preflight: ask the backend whether this URL can be embedded directly.
  useEffect(() => {
    let cancelled = false;
    setEmbeddable(null);
    setIsLoading(true);
    setHasError(false);
    setFinalUrl(url);
    fetch(`/api/webview-check?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setFinalUrl(data.finalUrl || url);
        setEmbeddable(data.embeddable !== false ? !!data.embeddable : false);
      })
      .catch(() => { if (!cancelled) setEmbeddable(false); });
    return () => { cancelled = true; };
  }, [url, token]);

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setIframeKey(prev => prev + 1);
  };

  const handleOpenNewTab = () => {
    window.open(openUrl, '_blank');
  };

  // Fallback: if the iframe never loads (e.g. proxy failed), surface an error.
  useEffect(() => {
    if (embeddable === null) return;
    const timer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) { setHasError(true); return false; }
        return prev;
      });
    }, 12000);
    return () => clearTimeout(timer);
  }, [isLoading, iframeKey, embeddable]);

  return (
    <div className="h-full flex flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm truncate text-muted-foreground">{openUrl}</span>
          {embeddable === false && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">preview</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleOpenNewTab} title="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* iframe container */}
      <div className="flex-1 relative">
        {(embeddable === null || (isLoading && !hasError)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
            <div className="text-center max-w-md">
              <p className="text-lg font-semibold mb-2">Cannot Display Website</p>
              <p className="text-sm text-muted-foreground mb-4">
                This website could not be shown in the panel. You can open it in a new tab instead.
              </p>
              <Button onClick={handleOpenNewTab} className="mr-2">Open in New Tab</Button>
              <Button onClick={onClose} variant="outline">Close</Button>
            </div>
          </div>
        )}

        {embeddable !== null && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={iframeSrc}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setHasError(true); }}
            title="Web View"
          />
        )}
      </div>
    </div>
  );
};
