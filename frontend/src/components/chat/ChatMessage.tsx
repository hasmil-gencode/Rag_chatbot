import { Volume2, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseFileNamesFromMessage, checkDownloadableFiles } from "@/lib/fileHelper";
import { DownloadButton } from "./DownloadButton";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  isStreaming?: boolean;
  userName?: string;
  startedBy?: string;
  timestamp?: Date | string;
  sources?: { file_name: string; page_number: number }[];
  responseTimeMs?: number;
  onWebViewOpen?: (url: string) => void;
}

export const ChatMessage = ({ role, content, isTyping, isStreaming, startedBy, sources, responseTimeMs, onWebViewOpen }: ChatMessageProps) => {
  const isUser = role === "user";
  const userRole = localStorage.getItem('userRole') || 'user';
  const showStartedBy = (userRole.toLowerCase() === 'developer' || userRole === 'admin' || userRole === 'manager') && startedBy;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsMode, setTtsMode] = useState<string>("browser");
  const [ttsLanguage, setTtsLanguage] = useState<string>("en-US");
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [downloadableMatches, setDownloadableMatches] = useState<any[]>([]);

  // Auto-open form if message contains form link
  // Custom link renderer for ReactMarkdown
  const LinkRenderer = ({ href, children }: any) => {
    // External links - open in split screen
    if (href?.startsWith('http://') || href?.startsWith('https://')) {
      return (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onWebViewOpen?.(href);
          }}
          className="text-blue-500 underline hover:text-blue-600 cursor-pointer"
        >
          {children}
        </a>
      );
    }
    
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{children}</a>;
  };

  useEffect(() => {
    // Load TTS settings
    fetch('/api/public-settings')
      .then(res => res.json())
      .then(data => {
        setTtsMode(data.ttsMode || 'browser');
        setTtsLanguage(data.ttsLanguage || 'en-US');
      })
      .catch(err => console.error('Failed to load TTS settings:', err));
  }, []);

  // Check for downloadable files in bot messages
  useEffect(() => {
    // Reset state first
    setDownloadableMatches([]);
    
    if (!isUser && content && !isTyping && !isStreaming) {
      const fileNames = parseFileNamesFromMessage(content);
      // Only check if file names found AND message mentions download/form keywords
      const hasDownloadContext = /download|form|file|document|attachment/i.test(content);
      if (fileNames.length > 0 && hasDownloadContext) {
        checkDownloadableFiles(fileNames)
          .then(matches => {
            if (matches && matches.length > 0) {
              setDownloadableMatches(matches);
            }
          })
          .catch(err => console.error('Failed to check downloadable files:', err));
      }
    }
  }, [content, isUser, isTyping, isStreaming]);

  const handleSpeak = async () => {
    if (isPlaying) {
      if (ttsMode === 'browser') {
        window.speechSynthesis.cancel();
      } else if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setIsLoading(false);
      localStorage.removeItem('ttsPlaying');
      if (localStorage.getItem('continuousMode') === 'true') {
        localStorage.setItem('continuousModeMessage', 'Listening...');
      }
      window.dispatchEvent(new CustomEvent('ttsEnded'));
      return;
    }

    setIsLoading(true);

    // Strip markdown formatting for TTS
    const cleanText = content
      .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*(.+?)\*/g, '$1')      // *italic* -> italic
      .replace(/`(.+?)`/g, '$1')        // `code` -> code
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // [link](url) -> link
      .replace(/#+\s/g, '')             // # heading -> heading
      .replace(/>\s/g, '')              // > quote -> quote
      .replace(/[-*]\s/g, '')           // - list -> list
      .replace(/\n+/g, '. ');           // newlines -> periods

    if (ttsMode === 'browser') {
      // Browser Web Speech API
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = ttsLanguage;
      utterance.onstart = () => {
        setIsLoading(false);
        setIsPlaying(true);
      };
      utterance.onend = () => {
        setIsPlaying(false);
        localStorage.removeItem('ttsPlaying');
        if (localStorage.getItem('continuousMode') === 'true') {
          localStorage.setItem('continuousModeMessage', 'Listening...');
        }
        window.dispatchEvent(new CustomEvent('ttsEnded'));
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        localStorage.removeItem('ttsPlaying');
        if (localStorage.getItem('continuousMode') === 'true') {
          localStorage.setItem('continuousModeMessage', 'Listening...');
        }
        window.dispatchEvent(new CustomEvent('ttsEnded'));
      };
      window.speechSynthesis.speak(utterance);
    } else {
      // Google TTS or Gemini TTS
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ text: cleanText, language: ttsLanguage, mode: ttsMode })
        });

        if (!response.ok) throw new Error('TTS failed');

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const newAudio = new Audio(audioUrl);
        
        newAudio.onloadeddata = () => {
          setIsLoading(false);
          setIsPlaying(true);
        };
        newAudio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(audioUrl);
          localStorage.removeItem('ttsPlaying');
          if (localStorage.getItem('continuousMode') === 'true') {
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
          window.dispatchEvent(new CustomEvent('ttsEnded'));
        };
        newAudio.onerror = () => {
          setIsPlaying(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
          localStorage.removeItem('ttsPlaying');
          if (localStorage.getItem('continuousMode') === 'true') {
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
          window.dispatchEvent(new CustomEvent('ttsEnded'));
        };

        setAudio(newAudio);
        await newAudio.play();
      } catch (error) {
        console.error('TTS error:', error);
        setIsPlaying(false);
        setIsLoading(false);
        toast.error('Failed to play audio. Please check API key in Settings.');
      }
    }
  };

  return (
    <div className={cn("mb-6 message-enter w-full", isUser && "flex justify-end")}>
      <div className={cn("flex flex-col gap-1.5", isUser ? "items-end max-w-[70%]" : "items-start max-w-[85%]")}>
        {showStartedBy && (
          <span className="text-[10px] text-muted-foreground/70 px-1">
            {startedBy}
          </span>
        )}
        
        {/* Verbose: response time */}
        {!isUser && !isTyping && responseTimeMs !== undefined && (
          <span className="text-[10px] text-muted-foreground/50 mb-0.5">
            ⚡ {responseTimeMs >= 1000 ? `${(responseTimeMs / 1000).toFixed(1)}s` : `${responseTimeMs}ms`}
          </span>
        )}

        {isUser ? (
          <div className="bg-zinc-700 text-white rounded-2xl px-4 py-2.5 inline-block">
            <p className="text-[14px] whitespace-pre-wrap">{content}</p>
          </div>
        ) : (
          <div>
            {isTyping ? (
              <div className="flex items-center gap-1.5 py-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground opacity-40 typing-dot" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground opacity-40 typing-dot" />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground opacity-40 typing-dot" />
              </div>
            ) : (
              <div className="text-[14px] leading-relaxed text-foreground prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{ a: LinkRenderer }}
                >
                  {content}
                </ReactMarkdown>
                {isStreaming && <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse">▊</span>}
              </div>
            )}
          </div>
        )}
        
        {/* Actions row - only for bot */}
        {!isUser && !isTyping && (
          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={handleSpeak}
              disabled={isLoading}
              data-tts-play
              className="text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
              title={isLoading ? "Loading..." : isPlaying ? "Stop" : "Play audio"}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Square className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            
            {downloadableMatches.length > 0 && (
              <DownloadButton matches={downloadableMatches} />
            )}
          </div>
        )}

        {/* Source citations */}
        {!isUser && !isTyping && sources && sources.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {sources.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                📎 {s.file_name}{s.page_number > 0 ? ` — p.${s.page_number}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
