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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setIframeKey(prev => prev + 1);
  };

  const handleOpenNewTab = () => {
    window.open(url, '_blank');
  };

  // Check if iframe loaded successfully
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isLoading) {
        // If still loading after 10 seconds, assume blocked
        setIsLoading(false);
        setHasError(true);
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [isLoading, iframeKey]);

  return (
    <div className="h-full flex flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm truncate text-muted-foreground">{url}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenNewTab}
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* iframe container */}
      <div className="flex-1 relative">
        {isLoading && !hasError && (
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
                This website (like Google, Facebook, etc.) blocks embedding in iframes for security reasons.
              </p>
              <Button onClick={handleOpenNewTab} className="mr-2">
                Open in New Tab
              </Button>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        )}

        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={url}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          onLoad={() => {
            setIsLoading(false);
          }}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          title="Web View"
        />
      </div>
    </div>
  );
};
