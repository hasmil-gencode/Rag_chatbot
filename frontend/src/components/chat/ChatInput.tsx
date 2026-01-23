import { useState, KeyboardEvent, useEffect } from "react";
import { Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileSelector } from "./FileSelector";

interface ChatInputProps {
  onSend: (message: string, fileId?: string | null) => void;
  isLoading?: boolean;
  selectedFileId?: string | null;
  onFileSelect?: (fileId: string | null) => void;
}

export const ChatInput = ({ onSend, isLoading, selectedFileId: externalFileId, onFileSelect }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [internalFileId, setInternalFileId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<string>("browser");
  const [voiceLanguage, setVoiceLanguage] = useState<string>("auto");
  const [recognition, setRecognition] = useState<any>(null);

  // Use external state if provided, otherwise use internal
  const selectedFileId = externalFileId !== undefined ? externalFileId : internalFileId;
  const setSelectedFileId = onFileSelect || setInternalFileId;

  useEffect(() => {
    // Load voice settings
    fetch('/api/public-settings')
      .then(res => res.json())
      .then(data => {
        setVoiceMode(data.voiceMode || 'browser');
        setVoiceLanguage(data.voiceLanguage || 'auto');
      })
      .catch(err => console.error('Failed to load voice settings:', err));
  }, []);

  const handleSend = () => {
    if (message.trim() && !isLoading) {
      onSend(message.trim(), selectedFileId);
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      // Stop recording
      if (voiceMode === 'browser' && recognition) {
        recognition.stop();
      } else if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      if (voiceMode === 'browser') {
        // Browser Web Speech API
        try {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SpeechRecognition) {
            alert('Speech recognition not supported in this browser. Please use Chrome.');
            return;
          }

          const recognitionInstance = new SpeechRecognition();
          recognitionInstance.continuous = false;
          recognitionInstance.interimResults = false;
          
          // Map language codes for browser
          const langMap: Record<string, string> = {
            'auto': 'en-US',
            'en': 'en-US',
            'ms': 'ms-MY',
            'zh': 'zh-CN',
            'ta': 'ta-IN',
            'multi': 'en-US' // For multi-language, default to English
          };
          recognitionInstance.lang = langMap[voiceLanguage] || 'en-US';

          recognitionInstance.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setMessage(transcript);
            setIsRecording(false);
          };

          recognitionInstance.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            alert('Speech recognition failed: ' + event.error);
            setIsRecording(false);
          };

          recognitionInstance.onend = () => {
            setIsRecording(false);
          };

          recognitionInstance.start();
          setRecognition(recognitionInstance);
          setIsRecording(true);
        } catch (error) {
          console.error('Speech recognition error:', error);
          alert('Failed to start speech recognition');
        }
      } else {
        // Local/API mode - record and send to backend
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          const audioChunks: Blob[] = [];

          recorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
          };

          recorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Send to backend for transcription
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            try {
              const token = localStorage.getItem('token');
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`
                },
                body: formData
              });

              const data = await response.json();
              if (data.text) {
                setMessage(data.text);
              } else {
                alert('No transcription received');
              }
            } catch (error) {
              console.error('Transcription error:', error);
              alert('Failed to transcribe audio');
            }

            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            setIsRecording(false);
          };

          recorder.start();
          setMediaRecorder(recorder);
          setIsRecording(true);
        } catch (error) {
          console.error('Microphone access error:', error);
          alert('Could not access microphone');
          setIsRecording(false);
        }
      }
    }
  };

  return (
    <div className="bg-background p-4">
      <div className="max-w-3xl mx-auto">
        <FileSelector selectedFileId={selectedFileId} onFileSelect={setSelectedFileId} />
        <div
          className={cn(
            "flex items-center gap-2 bg-background rounded-2xl px-3 py-2 transition-all duration-200 border",
            isFocused
              ? "border-primary shadow-sm"
              : "border-border"
          )}
        >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleVoiceToggle}
          className={cn(
            "flex-shrink-0 h-8 w-8 rounded-full",
            isRecording
              ? "text-destructive hover:text-destructive/80 hover:bg-destructive/10"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 py-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse delay-75" />
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse delay-150" />
            </div>
            <span className="text-sm text-muted-foreground">Listening...</span>
          </div>
        ) : (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Message Genie..."
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground text-sm py-2 max-h-32"
          />
        )}

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isLoading || isRecording}
          size="icon"
          className={cn(
            "rounded-full flex-shrink-0 h-8 w-8",
            message.trim() && !isRecording
              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
              : "bg-transparent text-muted-foreground hover:bg-muted"
          )}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
      </div>
    </div>
  );
};