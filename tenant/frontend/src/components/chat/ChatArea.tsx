import { useRef, useEffect, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatArtifact } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  startedBy?: string;
  createdAt?: Date | string;
  status?: string;
  sources?: { file_name: string; page_number: number; file_id?: string; score?: number }[];
  attachments?: { file_id: string; file_name: string }[];
  artifacts?: ChatArtifact[];
  responseTimeMs?: number;
  actions?: { label: string; value: string }[];
  debug?: any;
}

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (message: string, fileId?: string | null) => void;
  isLoading?: boolean;
  userEmail?: string;
  userFullName?: string;
  hasActiveSession?: boolean;
  onWebViewOpen?: (url: string) => void;
}

export const ChatArea = ({ messages, onSendMessage, isLoading, userEmail, userFullName, hasActiveSession, onWebViewOpen }: ChatAreaProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const lastMessageIdRef = useRef<string>('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-trigger Play button when new assistant message arrives
  useEffect(() => {
    if (waitingForResponse && !isLoading) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content.trim() && lastMessage.id !== lastMessageIdRef.current) {
        setWaitingForResponse(false);
        lastMessageIdRef.current = lastMessage.id;
        
        // IMMEDIATELY pause listening during TTS (before any delay)
        localStorage.setItem('ttsPlaying', 'true');
        localStorage.setItem('continuousModeMessage', 'Bot speaking...');
        
        // Dispatch event to force recognition to stop processing
        window.dispatchEvent(new CustomEvent('ttsStarted'));
        
        // Auto-click Play button after short delay
        setTimeout(() => {
          const playButtons = document.querySelectorAll('[data-tts-play]');
          const lastPlayButton = playButtons[playButtons.length - 1] as HTMLButtonElement;
          if (lastPlayButton) {
            lastPlayButton.click();
          }
        }, 100); // Reduced delay from 300ms to 100ms
      }
    }
  }, [messages, waitingForResponse, isLoading]);

  const getUserName = () => {
    if (userFullName) return userFullName;
    if (!userEmail) return "User";
    const name = userEmail.split("@")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleSend = (message: string, fileId?: string | null) => {
    onSendMessage(message, fileId);
  };

  const handleAutoSend = async (message: string, fileId?: string | null) => {
    setWaitingForResponse(true);
    onSendMessage(message, fileId);
  };

  return (
    <div className={`flex-1 flex flex-col h-screen bg-background ${hasActiveSession ? 'md:pt-0 pt-12' : ''}`}>
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col">
          {/* Centered greeting and input */}
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-3xl">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-normal text-foreground mb-2">
                  Hello, <span className="font-medium">{getUserName()}</span>
                </h2>
                <p className="text-muted-foreground">How can I help you today?</p>
              </div>
              <ChatInput 
                onSend={handleSend}
                onAutoSend={handleAutoSend}
                isLoading={isLoading}
                selectedFileId={selectedFileId}
                onFileSelect={setSelectedFileId}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto chat-scrollbar px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-1">
              {messages.map((msg) => (
                <div key={msg.id}>
                  <ChatMessage 
                    key={msg.id} 
                    role={msg.role} 
                    content={msg.content} 
                    isTyping={isLoading && msg.role === "assistant" && !msg.content}
                    isStreaming={isLoading && msg.role === "assistant" && !!msg.content}
                    status={msg.status}
                    userName={getUserName()} 
                    startedBy={msg.startedBy}
                    timestamp={msg.createdAt}
                    sources={msg.sources}
                    attachments={msg.attachments}
                    artifacts={msg.artifacts}
                    responseTimeMs={msg.responseTimeMs}
                    onWebViewOpen={onWebViewOpen}
                    debug={msg.debug}
                  />
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-col gap-2 max-w-xs mt-3 ml-0">
                      {msg.actions.map((action, i) => (
                        <button key={i} onClick={() => onSendMessage(action.label)}
                          className="px-4 py-2.5 text-xs font-medium border rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors text-left">
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && !(messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.content) && (
                <ChatMessage role="assistant" content="" isTyping />
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          {/* Input Area at bottom */}
          <ChatInput 
            onSend={handleSend}
            onAutoSend={handleAutoSend}
            isLoading={isLoading}
            selectedFileId={selectedFileId}
            onFileSelect={setSelectedFileId}
          />
        </>
      )}
    </div>
  );
};
