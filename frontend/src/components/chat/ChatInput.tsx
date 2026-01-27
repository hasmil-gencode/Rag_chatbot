import { useState, KeyboardEvent, useEffect, useRef } from "react";
import { Mic, MicOff, Send, Radio, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileSelector } from "./FileSelector";

interface ChatInputProps {
  onSend: (message: string, fileId?: string | null) => void;
  isLoading?: boolean;
  selectedFileId?: string | null;
  onFileSelect?: (fileId: string | null) => void;
  onAutoSend?: (message: string, fileId?: string | null) => void;
}

export const ChatInput = ({ onSend, isLoading, selectedFileId: externalFileId, onFileSelect, onAutoSend }: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [internalFileId, setInternalFileId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<string>("browser");
  const [voiceLanguage, setVoiceLanguage] = useState<string>("auto");
  const [recognition, setRecognition] = useState<any>(null);
  const [silenceTimer, setSilenceTimer] = useState<NodeJS.Timeout | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const isTTSPlayingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const currentTranscriptRef = useRef<string>('');
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const restartRecordingRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
    
    // Sync continuous mode from localStorage
    const isContinuous = localStorage.getItem('continuousMode') === 'true';
    setIsContinuousMode(isContinuous);
    if (isContinuous) {
      const savedMessage = localStorage.getItem('continuousModeMessage') || 'Listening...';
      setMessage(savedMessage);
    }
    
    // Listen for TTS events to STOP/START recognition
    const handleTTSStart = () => {
      isTTSPlayingRef.current = true;
      
      // CRITICAL: Clear any pending transcript and silence timer
      currentTranscriptRef.current = '';
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      // Set blocking flag
      localStorage.setItem('ttsBlocking', 'true');
      
      // Stop Browser recognition if exists
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.error('Error stopping recognition:', e);
        }
      }
      
      // DON'T stop Gemini MediaRecorder - just set blocking flag
      // The checkAudioLevel loop will ignore audio during TTS
    };
    
    const handleTTSEnd = () => {
      isTTSPlayingRef.current = false;
      
      // Re-enable continuous mode
      localStorage.removeItem('ttsBlocking');
      localStorage.removeItem('waitingForTTS');
      
      // Update UI to show listening again
      setMessage('Listening...');
      localStorage.setItem('continuousModeMessage', 'Listening...');
      
      // Restart Browser recognition if exists
      if (localStorage.getItem('continuousMode') === 'true' && recognitionRef.current) {
        try {
          setTimeout(() => {
            if (recognitionRef.current && localStorage.getItem('continuousMode') === 'true') {
              recognitionRef.current.start();
            }
          }, 200);
        } catch (e) {
          console.error('Error restarting recognition:', e);
        }
      }
      
      // For Gemini: Just resume detection - recorder never stopped!
    };
    
    window.addEventListener('ttsStarted', handleTTSStart);
    window.addEventListener('ttsEnded', handleTTSEnd);
    
    // Poll for message updates during continuous mode
    const interval = setInterval(() => {
      if (localStorage.getItem('continuousMode') === 'true') {
        const savedMessage = localStorage.getItem('continuousModeMessage');
        if (savedMessage) {
          setMessage(savedMessage);
        }
      }
    }, 100);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('ttsStarted', handleTTSStart);
      window.removeEventListener('ttsEnded', handleTTSEnd);
    };
  }, [recognition]);

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

  // Continuous conversation mode
  const handleContinuousMode = () => {
    if (!onAutoSend) return;

    if (isContinuousMode) {
      // Stop continuous mode
      
      // Stop TTS if playing
      if (localStorage.getItem('ttsPlaying') === 'true') {
        const stopButtons = document.querySelectorAll('[data-tts-play]');
        const lastStopButton = stopButtons[stopButtons.length - 1] as HTMLButtonElement;
        if (lastStopButton && lastStopButton.textContent?.includes('Stop')) {
          lastStopButton.click();
        }
      }
      
      if (recognition) {
        recognition.stop();
        setRecognition(null);
        recognitionRef.current = null; // Clear ref
      }
      
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        setMediaRecorder(null);
        mediaRecorderRef.current = null; // Clear ref
      }
      
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
        audioStreamRef.current = null; // Clear ref
      }
      
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
      }
      
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        setSilenceTimer(null);
      }
      
      // Clear restart function ref
      restartRecordingRef.current = null;
      
      // Cancel animation frame loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (abortController) {
        abortController.abort();
        setAbortController(null);
      }
      
      setIsContinuousMode(false);
      setMessage('');
      localStorage.removeItem('continuousMode');
      localStorage.removeItem('continuousModeMessage');
      return;
    }

    // Start continuous mode
    setIsContinuousMode(true);
    setMessage('Listening...');
    localStorage.setItem('continuousMode', 'true');
    localStorage.setItem('continuousModeMessage', 'Listening...');

    if (voiceMode === 'browser') {
      startBrowserContinuous();
    } else {
      startGeminiContinuous();
    }
  };

  const startBrowserContinuous = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      // CRITICAL: Set ref IMMEDIATELY
      recognitionRef.current = recognitionInstance;
      setRecognition(recognitionInstance);
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = voiceLanguage === 'auto' ? 'en-US' : voiceLanguage;

      let lastSpeechTime = 0;

      recognitionInstance.onresult = (event: any) => {
        // Triple check: ref, localStorage, and blocking flag
        if (isTTSPlayingRef.current || 
            localStorage.getItem('ttsPlaying') === 'true' || 
            localStorage.getItem('ttsBlocking') === 'true') {
          return;
        }
        
        lastSpeechTime = Date.now();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        let finalText = '';
        let interimText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interimText += transcript;
          }
        }

        if (finalText) currentTranscriptRef.current += finalText;
        const displayMessage = currentTranscriptRef.current + interimText;
        setMessage(displayMessage);
        localStorage.setItem('continuousModeMessage', displayMessage);

        const timer = setTimeout(() => {
          if (Date.now() - lastSpeechTime >= 5000 && currentTranscriptRef.current.trim()) {
            onAutoSend!(currentTranscriptRef.current.trim(), selectedFileId);
            currentTranscriptRef.current = '';
            setMessage('Listening...');
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
        }, 5000);
        
        silenceTimerRef.current = timer;
      };

      recognitionInstance.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Recognition error:', event.error);
        }
      };

      recognitionInstance.onend = () => {
        if (localStorage.getItem('continuousMode') === 'true') {
          setTimeout(() => {
            if (localStorage.getItem('continuousMode') === 'true') {
              try {
                currentTranscriptRef.current = '';
                setMessage('Listening...');
                localStorage.setItem('continuousModeMessage', 'Listening...');
                recognitionInstance.start();
              } catch (e) {
                console.error('Restart failed:', e);
              }
            }
          }, 100);
        }
      };

      recognitionInstance.start();
      // Ref already set at the beginning
    } catch (error) {
      console.error('Browser continuous error:', error);
      alert('Failed to start continuous mode');
      setIsContinuousMode(false);
      localStorage.removeItem('continuousMode');
    }
  };

  const startGeminiContinuous = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      audioStreamRef.current = stream; // Save to ref
      
      const context = new AudioContext();
      setAudioContext(context);
      
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      mediaRecorderRef.current = recorder; // CRITICAL: Save to ref IMMEDIATELY
      
      const audioChunks: Blob[] = [];
      let lastSoundTime = Date.now();
      let isSpeaking = false;

      // Create restart function that has access to recorder via closure
      const restartRecording = () => {
        if (recorder.state !== 'recording' && localStorage.getItem('continuousMode') === 'true') {
          recorder.start();
          setMessage('Listening...');
          localStorage.setItem('continuousModeMessage', 'Listening...');
          lastSoundTime = Date.now();
          isSpeaking = false;
        }
      };
      restartRecordingRef.current = restartRecording;

      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkAudioLevel = () => {
        if (!localStorage.getItem('continuousMode')) {
          return;
        }

        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += Math.abs(dataArray[i] - 128);
        }
        const average = sum / dataArray.length;

        // Check if TTS is playing
        const isTTSPlaying = localStorage.getItem('ttsPlaying') === 'true';

        if (average > 5) {
          // Sound detected
          if (isTTSPlaying) {
            // User is speaking during TTS - INTERRUPT IT!
            const stopButtons = document.querySelectorAll('[data-tts-play]');
            const lastStopButton = stopButtons[stopButtons.length - 1] as HTMLButtonElement;
            if (lastStopButton && lastStopButton.textContent?.includes('Stop')) {
              lastStopButton.click();
            }
            // Reset to listening mode
            lastSoundTime = Date.now();
            isSpeaking = true;
            setMessage('Speaking...');
            localStorage.setItem('continuousModeMessage', 'Speaking...');
          } else {
            // Normal speech detection
            lastSoundTime = Date.now();
            if (!isSpeaking) {
              isSpeaking = true;
              setMessage('Speaking...');
              localStorage.setItem('continuousModeMessage', 'Speaking...');
            }
          }
        } else {
          // Silence
          if (isTTSPlaying) {
            // During TTS, reset silence timer so it doesn't trigger
            lastSoundTime = Date.now();
          } else {
            const silenceDuration = Date.now() - lastSoundTime;
            if (isSpeaking && silenceDuration > 5000) {
              // 5 seconds of silence after speaking
              isSpeaking = false;
              recorder.stop();
            }
          }
        }

        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        // Check if continuous mode was manually stopped
        if (localStorage.getItem('continuousMode') !== 'true') {
          audioChunks.length = 0; // Clear buffer
          return;
        }
        
        if (audioChunks.length === 0) {
          // No audio, restart
          if (localStorage.getItem('continuousMode') === 'true') {
            audioChunks.length = 0;
            recorder.start();
            setMessage('Listening...');
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks.length = 0;

        // Transcribe with Gemini
        setMessage('Transcribing...');
        localStorage.setItem('continuousModeMessage', 'Transcribing...');
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const controller = new AbortController();
          setAbortController(controller);
          
          const token = localStorage.getItem('token');
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
            signal: controller.signal
          });

          const data = await response.json();
          setAbortController(null);
          
          if (data.text && data.text.trim()) {
            // Auto-send - this will trigger TTS
            onAutoSend!(data.text.trim(), selectedFileId);
            
            // Restart recorder but with TTS blocking active
            // Recorder will keep running but checkAudioLevel will ignore audio
            if (localStorage.getItem('continuousMode') === 'true') {
              setTimeout(() => {
                if (localStorage.getItem('continuousMode') === 'true') {
                  recorder.start();
                  setMessage('Bot speaking...');
                  localStorage.setItem('continuousModeMessage', 'Bot speaking...');
                  lastSoundTime = Date.now();
                  isSpeaking = false;
                }
              }, 300);
            }
          } else {
            // No text, restart immediately
            if (localStorage.getItem('continuousMode') === 'true') {
              setTimeout(() => {
                if (localStorage.getItem('continuousMode') === 'true') {
                  recorder.start();
                  setMessage('Listening...');
                  localStorage.setItem('continuousModeMessage', 'Listening...');
                  lastSoundTime = Date.now();
                  isSpeaking = false;
                }
              }, 300);
            }
          }
        } catch (error: any) {
          console.error('Transcription error:', error);
          setAbortController(null);
          
          // If aborted, don't restart
          if (error.name === 'AbortError') {
            return;
          }
          
          // Restart anyway
          if (localStorage.getItem('continuousMode') === 'true') {
            recorder.start();
            setMessage('Listening...');
            localStorage.setItem('continuousModeMessage', 'Listening...');
          }
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      checkAudioLevel();
      
    } catch (error) {
      console.error('Gemini continuous error:', error);
      alert('Failed to start continuous mode');
      setIsContinuousMode(false);
      localStorage.removeItem('continuousMode');
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
        {!isContinuousMode && (
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
        )}

        {isRecording || isContinuousMode ? (
          <div className="flex-1 flex items-center gap-2 py-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse delay-75" />
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse delay-150" />
            </div>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              {message.includes('Listening') && <Mic className="w-3.5 h-3.5" />}
              {message.includes('Speaking') && <Mic className="w-3.5 h-3.5 text-primary" />}
              {message.includes('Transcribing') && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {message.includes('Bot speaking') && <Bot className="w-3.5 h-3.5 text-primary" />}
              {message}
            </span>
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

        {onAutoSend && (
          <Button
            onClick={handleContinuousMode}
            disabled={isLoading || isRecording}
            size="icon"
            className={cn(
              "rounded-full flex-shrink-0 h-8 w-8",
              isContinuousMode
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            )}
            title="Continuous conversation mode"
          >
            <Radio className="w-4 h-4" />
          </Button>
        )}

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isLoading || isRecording || isContinuousMode}
          size="icon"
          className={cn(
            "rounded-full flex-shrink-0 h-8 w-8",
            message.trim() && !isRecording && !isContinuousMode
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