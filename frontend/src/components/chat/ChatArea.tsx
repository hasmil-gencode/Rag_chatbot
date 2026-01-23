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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getUserName = () => {
    if (!userEmail) return "User";
    const name = userEmail.split("@")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  const handleSend = (message: string, fileId?: string | null) => {
    onSendMessage(message, fileId);
    // Keep file selection after sending
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
            isLoading={isLoading}
            selectedFileId={selectedFileId}
            onFileSelect={setSelectedFileId}
          />
        </>
      )}
    </div>
  );
};
