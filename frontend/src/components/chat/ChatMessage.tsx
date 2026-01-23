import { Bot, Volume2, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  userName?: string;
  startedBy?: string;
}

export const ChatMessage = ({ role, content, isTyping, userName, startedBy }: ChatMessageProps) => {
  const isUser = role === "user";
  const userInitial = userName ? userName.charAt(0).toUpperCase() : "U";
  const userRole = localStorage.getItem('userRole') || 'user';
  const showStartedBy = (userRole === 'admin' || userRole === 'manager') && startedBy;
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ttsMode, setTtsMode] = useState<string>("browser");
  const [ttsLanguage, setTtsLanguage] = useState<string>("en-US");
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

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
      return;
    }

    setIsLoading(true);

    if (ttsMode === 'browser') {
      // Browser Web Speech API
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = ttsLanguage;
      utterance.onstart = () => {
        setIsLoading(false);
        setIsPlaying(true);
      };
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
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
          body: JSON.stringify({ text: content, language: ttsLanguage, mode: ttsMode })
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
        };
        newAudio.onerror = () => {
          setIsPlaying(false);
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
        };

        setAudio(newAudio);
        await newAudio.play();
      } catch (error) {
        console.error('TTS error:', error);
        setIsPlaying(false);
        setIsLoading(false);
        alert('Failed to play audio. Please check API key in Settings.');
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}
        </div>
        
        {!isUser && !isTyping && (
          <button
            onClick={handleSpeak}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start px-2 py-1 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
