import { useRef, useEffect, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  startedBy?: string;
}

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (message: string, fileId?: string | null) => void;
  isLoading?: boolean;
  userEmail?: string;
}

export const ChatArea = ({ messages, onSendMessage, isLoading, userEmail }: ChatAreaProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const lastMessageCountRef = useRef(0);
  const lastMessageIdRef = useRef<string>('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-trigger Play button when new assistant message arrives
  useEffect(() => {
    if (waitingForResponse && messages.length > lastMessageCountRef.current) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.id !== lastMessageIdRef.current) {
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
    lastMessageCountRef.current = messages.length;
  }, [messages, waitingForResponse]);

  const getUserName = () => {
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
    <div className="flex-1 flex flex-col h-screen bg-background">
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
          <div className="flex-1 overflow-y-auto chat-scrollbar p-6">
            <div className="max-w-4xl mx-auto">
              {messages.map((msg) => (
                <ChatMessage 
                  key={msg.id} 
                  role={msg.role} 
                  content={msg.content} 
                  userName={getUserName()} 
                  startedBy={msg.startedBy}
                />
              ))}
              {isLoading && <ChatMessage role="assistant" content="" isTyping />}
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
