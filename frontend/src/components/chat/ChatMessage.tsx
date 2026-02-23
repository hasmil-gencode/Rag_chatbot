import { Bot, Volume2, Square, Loader2 } from "lucide-react";
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
  onWebViewOpen?: (url: string) => void;
}

export const ChatMessage = ({ role, content, isTyping, isStreaming, userName, startedBy, timestamp, onWebViewOpen }: ChatMessageProps) => {
  const isUser = role === "user";
  const userInitial = userName ? userName.charAt(0).toUpperCase() : "U";
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
    <div className={cn("flex gap-3 mb-4 message-enter", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
      )}
      
      <div className="flex flex-col gap-1 max-w-[70%]">
        {showStartedBy && (
          <span className="text-xs text-muted-foreground px-2">
            {startedBy}
          </span>
        )}
        
        <div className={cn("rounded-2xl px-4 py-2.5", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {isTyping ? (
            <div className="flex items-center gap-1 py-1">
              <div className="w-2 h-2 rounded-full bg-current opacity-60 typing-dot" />
              <div className="w-2 h-2 rounded-full bg-current opacity-60 typing-dot" />
              <div className="w-2 h-2 rounded-full bg-current opacity-60 typing-dot" />
            </div>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-invert">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{ a: LinkRenderer }}
              >
                {content}
              </ReactMarkdown>
              {isStreaming && <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse">▊</span>}
            </div>
          )}
        </div>
        
        {/* Timestamp */}
        {timestamp && !isTyping && (
          <span className={cn("text-xs text-muted-foreground px-2", isUser ? "text-right" : "text-left")}>
            {new Date(timestamp).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            })}
          </span>
        )}
        
        {!isUser && !isTyping && (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleSpeak}
              disabled={isLoading}
              data-tts-play
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              title={isLoading ? "Loading..." : isPlaying ? "Stop" : "Play audio"}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : isPlaying ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3 h-3" />
                  <span>Play</span>
                </>
              )}
            </button>
            
            {downloadableMatches.length > 0 && (
              <DownloadButton matches={downloadableMatches} />
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="text-primary-foreground font-semibold text-sm">{userInitial}</span>
        </div>
      )}
    </div>
  );
};
