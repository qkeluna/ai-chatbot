"use client";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import { Message, MessageContent } from "./ai-elements/message";
import ReactMarkdown from "react-markdown";
import { Button } from "./ui/button";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, MessageSquareIcon, RotateCw, X } from "lucide-react";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";
import { chatbotConfig } from "@/lib/config";
import { Profanity } from "@2toad/profanity";

type ErrorMessage = {
  error: Error;
  message: string;
  status: number;
  statusCode: number;
  response: Response;
};

const ChatBotWrapper = () => {
  const [isOpen, setIsOpen] = useState(false);

  // Locks background page scroll when chat is open on mobile
  const isMobile = () => {
    return window.innerWidth < 768;
  };
  useEffect(() => {
    if (!isOpen || !isMobile()) return;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
    };
  }, [isOpen]);
  return (
    <div>
      <Button
        size="sm"
        className="fixed bottom-5 right-5 rounded-full p-4 h-fit"
        onClick={() => setIsOpen(!isOpen)}
      >
        <MessageSquareIcon className="size-5" />
      </Button>
      <AnimatePresence mode="wait">
        {isOpen && <ChatBot key="chatbot" onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
};
export default ChatBotWrapper;

export const ChatBot = ({ onClose }: { onClose: () => void }) => {
  const [input, setInput] = useState("");
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const lastMessageTime = useRef(Date.now());

  const { messages, sendMessage, setMessages, status } = useChat({
    messages: [
      {
        id: "welcome",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: chatbotConfig.welcomeMessage,
          },
        ],
      },
    ],
    onError: (error) => {
      setValidationError(null);

      // Check for validation error (400 status)
      const isValidationError =
        (error as unknown as ErrorMessage).status === 400 ||
        (error as unknown as ErrorMessage).statusCode === 400 ||
        error.message?.includes("400") ||
        error.message?.toLowerCase().includes("invalid or suspicious");

      if (isValidationError) {
        setValidationError(
          "Message blocked (inappropriate content, spam, or exceeding length)"
        );
        setTimeout(() => setValidationError(null), 5000);
        return;
      }

      // Check for rate limiting
      const isRateLimit =
        (error as unknown as ErrorMessage).status === 429 ||
        (error as unknown as ErrorMessage).statusCode === 429 ||
        error.message?.includes("429") ||
        error.message?.toLowerCase().includes("rate limit") ||
        error.message?.toLowerCase().includes("too many requests");

      if (isRateLimit) {
        setIsRateLimited(true);
        setRateLimitCountdown(chatbotConfig.rateLimit.interval);

        setTimeout(() => {
          setIsRateLimited(false);
          setRateLimitCountdown(null);
        }, chatbotConfig.rateLimit.interval * 1000);
      } else {
        // Other errors
        setRateLimitCountdown(5);
        setTimeout(() => setRateLimitCountdown(null), 5000);
      }
    },
  });

  // Load chat history on component mount
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem("AIChatMessages");
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        // Load if there are messages (excludes welcome msg)
        if (parsedMessages.length > 1) {
          setMessages(parsedMessages);
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      localStorage.removeItem("AIChatMessages");
    }
  }, [setMessages]);

  // Save chat history whenever messages change
  useEffect(() => {
    try {
      // Save if there are messages (excludes welcome msg)
      if (messages.length > 1) {
        localStorage.setItem("AIChatMessages", JSON.stringify(messages));
      }
    } catch (error) {
      console.error("Failed to save chat history:", error);
    }
  }, [messages]);

  const validateMessage = (text: string): boolean => {
    const profanity = new Profanity();
    profanity.addWords(["casino", "gambling", "poker", "bet"]);
    profanity.removeWords([""]); // remove words from filter if needed, current list at https://github.com/2Toad/Profanity/blob/main/src/data/profane-words.ts

    return (
      text.length <= 1000 && !/(.)\1{6,}/i.test(text) && !profanity.exists(text)
    );
  };

  const sendMessageWithThrottle = async (text: string) => {
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime.current;
    if (timeSinceLastMessage < chatbotConfig.rateLimit.minTimeBetweenMessages) {
      return;
    }
    if (isRateLimited) {
      return;
    }
    if (!validateMessage(text)) {
      setValidationError("Message blocked - inappropriate/spam");
      setTimeout(() => setValidationError(null), 5000);
      return;
    }
    lastMessageTime.current = now;
    await sendMessage({ text });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      input.trim() &&
      !isRateLimited &&
      input.length <= chatbotConfig.rateLimit.maxMessageLength
    ) {
      sendMessageWithThrottle(input);
      setInput("");
    }
  };

  const isInputValid =
    input.length <= chatbotConfig.rateLimit.maxMessageLength &&
    input.trim().length > 0;

  const handleConversationChoice = (choice: string) => {
    if (!isRateLimited) {
      sendMessageWithThrottle(choice);
    }
  };

  const handleLinkClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const clearMessages = () => {
    setIsRateLimited(false);
    setRateLimitCountdown(null);

    localStorage.removeItem("AIChatMessages");

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: chatbotConfig.welcomeMessage,
          },
        ],
      },
    ]);
  };

  const getRateLimitMessage = () => {
    if (rateLimitCountdown !== null && rateLimitCountdown > 0) {
      return `Rate limit exceeded. Please wait ${rateLimitCountdown} second${
        rateLimitCountdown !== 1 ? "s" : ""
      }...`;
    }
    return "Rate limit exceeded. Please wait...";
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`
            justify-between flex flex-col
            fixed z-20 bg-white overscroll-contain touch-pan-y
            inset-0 w-screen h-[100dvh] rounded-none border-0
            md:max-w-110 md:w-full md:h-140 md:bottom-20 md:right-4 md:rounded-sm md:border md:inset-auto
          `}
    >
      {/* Validation Error Display */}
      {validationError && (
        <div className="text-red-700 rounded text-xs absolute bottom-16 w-full text-center z-10 bg-red-50 px-2 py-1">
          {validationError}
        </div>
      )}

      {/* Rate Limit Display */}
      {isRateLimited && (
        <div className="text-orange-700 rounded text-xs absolute bottom-16 w-full text-center z-10 bg-orange-50 px-2 py-1">
          {getRateLimitMessage()}
        </div>
      )}
      {/* Chat Top Bar */}
      <div className="p-2 flex flex-row justify-between items-center">
        <div className="flex-col pl-2">
          <p className="font-bold text-xl">{chatbotConfig.ui.windowTitle}</p>
        </div>
        <div>
          {/* Reset Button */}
          <Button onClick={clearMessages} size="icon" variant="ghost">
            <RotateCw />
          </Button>
          {/* Close Chat Button */}
          <Button onClick={onClose} size="icon" variant="ghost">
            <X />
          </Button>
        </div>
      </div>
      <Conversation className="overflow-hidden flex-1">
        <ConversationContent className="px-2 pb-[calc(env(safe-area-inset-bottom)+72px)]">
          {messages.map((message) => (
            <div key={message.id}>
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <MarkdownWithButtons
                            key={`${message.id}-${i}`}
                            onConversationChoice={handleConversationChoice}
                            onLinkClick={handleLinkClick}
                            isRateLimited={isRateLimited}
                            status={status}
                          >
                            {part.text}
                          </MarkdownWithButtons>
                        );
                      default:
                        return null;
                    }
                  })}
                </MessageContent>
              </Message>
            </div>
          ))}
          {status === "submitted" && (
            <Message role="assistant" from="assistant">
              {/* Loading Message */}
              <MessageContent>
                <div className="flex gap-1 justify-center items-center py-2 px-1">
                  <span className="sr-only">Loading...</span>
                  <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce"></div>
                  <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce delay-150"></div>
                  <div className="h-2 w-2 bg-neutral-300 rounded-full animate-bounce delay-300"></div>
                </div>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput
        onSubmit={handleSubmit}
        className="sticky flex items-center bottom-0 left-0 right-0 bg-white py-3 px-4 gap-2 border-t"
      >
        <PromptInputTextarea
          onChange={(e) => setInput(e.target.value)}
          value={input}
          className=""
          placeholder={
            isRateLimited
              ? "Rate limited, please wait..."
              : chatbotConfig.ui.inputPlaceholder
          }
          disabled={isRateLimited}
        />
        <PromptInputSubmit
          disabled={!isInputValid || isRateLimited || status === "submitted"}
          status={status}
          className="rounded-sm self-start"
        />
      </PromptInput>
    </motion.div>
  );
};

const MarkdownWithButtons = ({
  children,
  onConversationChoice,
  onLinkClick,
  isRateLimited,
  status,
}: {
  children: string;
  onConversationChoice: (choice: string) => void;
  onLinkClick: (url: string) => void;
  isRateLimited: boolean;
  status: string;
}) => {
  // Extract and remove conversation choices from markdown
  const conversationChoiceRegex = /\{\{choice:([^}]+)\}\}/g;
  const linkButtonRegex = /\{\{link:([^|]+)\|([^}]+)\}\}/g;
  const conversationChoices: string[] = [];
  const linkButtons: { url: string; label: string }[] = [];
  let match;
  while ((match = conversationChoiceRegex.exec(children)) !== null) {
    conversationChoices.push(match[1].trim());
  }
  while ((match = linkButtonRegex.exec(children)) !== null) {
    linkButtons.push({
      url: match[1].trim(),
      label: match[2].trim(),
    });
  }
  const cleanMarkdown = children
    .replace(conversationChoiceRegex, "")
    .replace(linkButtonRegex, "")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();

  return (
    <div>
      <div className="prose">
        <ReactMarkdown>{cleanMarkdown}</ReactMarkdown>
      </div>
      {(conversationChoices.length > 0 || linkButtons.length > 0) && (
        <div className="flex flex-row flex-wrap mt-2 gap-2">
          {/* Render conversation choices */}
          {conversationChoices.map((choice, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => onConversationChoice(choice)}
              disabled={isRateLimited || status === "submitted"}
              className={`text-sm rounded-full shadow-none ${
                isRateLimited ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {choice}
            </Button>
          ))}

          {/* Render link buttons */}
          {linkButtons.map((button, index) => (
            <Button
              key={index}
              variant="default"
              size="sm"
              onClick={() => onLinkClick(button.url)}
              className="text-sm rounded-full shadow-none"
            >
              {button.label}
              <ExternalLink className="w-3 h-3 mr-1" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
