'use client'

import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

// Custom components to style the Markdown elements nicely
const MarkdownComponents = {
    // Style paragraphs to avoid huge gaps inside bubbles
    p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0" {...props} />,
    // Bold text styling
    strong: ({ node, ...props }: any) => <span className="font-bold text-blue-900 dark:text-blue-300" {...props} />,
    // List styling
    ul: ({ node, ...props }: any) => <ul className="list-disc list-inside ml-2 mb-2 space-y-1" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal list-inside ml-2 mb-2 space-y-1" {...props} />,
    li: ({ node, ...props }: any) => <li className="text-gray-800 dark:text-gray-100" {...props} />,
    // Code block styling
    code: ({ node, inline, className, children, ...props }: any) => {
        return !inline ? (
            <div className="bg-gray-800 text-gray-100 p-3 rounded-lg my-3 overflow-x-auto text-sm font-mono shadow-inner">
                <code {...props}>{children}</code>
            </div>
        ) : (
            <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400" {...props}>
                {children}
            </code>
        );
    },
    // Tables (Note: Tables might render as plain text without remark-gfm, but basic styling is here just in case)
    table: ({ node, ...props }: any) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-gray-300 border border-gray-300" {...props} /></div>,
    th: ({ node, ...props }: any) => <th className="bg-gray-100 px-3 py-2 text-left text-sm font-semibold text-gray-900" {...props} />,
    td: ({ node, ...props }: any) => <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500 border-t border-gray-200" {...props} />,
};

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const sendMessage = async () => {
        if (!input.trim()) return

        const userMessage: Message = { role: 'user', content: input }
        const currentInput = input
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setLoading(true)

        try {
            // Keeping your exact backend logic
            const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || 'http://localhost:8000'

            const response = await fetch(`${agentUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: currentInput,
                    history: messages
                }),
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            const data = await response.json()
            const assistantMessage: Message = {
                role: 'assistant',
                content: data.response || 'No response received',
            }
            setMessages(prev => [...prev, assistantMessage])
        } catch (error) {
            console.error('Error sending message:', error)
            const errorMessage: Message = {
                role: 'assistant',
                content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    // Helper to quick-set input from suggestion buttons
    const handleSuggestion = (text: string) => {
        setInput(text);
        // Optional: auto-send on click
        // sendMessage(); 
    };

    return (
        // Main Container: h-[100dvh] ensures full height on mobile browsers (ignoring address bar issues)
        <div className="flex flex-col h-[100dvh] bg-gray-50 font-sans text-gray-900">

            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10 flex-none">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-2xl shadow-sm">
                        🤖
                    </div>
                    <div>
                        <h1 className="text-base font-bold text-gray-900 leading-tight">AdventureWorks Agent</h1>
                        <p className="text-xs text-gray-500 font-medium">Powered by Qwen 2.5</p>
                    </div>
                </div>
            </header>

            {/* Chat Area - flex-1 takes remaining space */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
                <div className="max-w-4xl mx-auto flex flex-col gap-6">

                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center mt-12 px-4">
                            <div className="text-6xl mb-6 animate-pulse">👋</div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-3">Welcome to AdventureWorks</h2>
                            <p className="text-gray-500 mb-8 max-w-md leading-relaxed">
                                I can help you query the database, find contacts, or draft emails.
                                <br className="hidden sm:block" /> Try asking one of the following:
                            </p>
                            <div className="flex flex-wrap justify-center gap-3 w-full max-w-2xl">
                                <button
                                    onClick={() => handleSuggestion("Check unread messages and draft a response for them")}
                                    className="p-4 bg-white border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:border-blue-300 hover:shadow-md hover:text-blue-600 transition-all text-left flex items-center gap-2 group"
                                >
                                    <span className="group-hover:scale-110 transition-transform">📧</span> Check unread emails
                                </button>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            return (
                                <div
                                    key={idx}
                                    className={`flex w-full gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                                >
                                    {!isUser && (
                                        <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg flex-shrink-0 shadow-sm mt-1">
                                            🤖
                                        </div>
                                    )}

                                    <div
                                        className={`px-4 py-3 rounded-2xl max-w-[85%] sm:max-w-[75%] shadow-sm leading-relaxed text-[15px] ${isUser
                                            ? 'bg-blue-600 text-white rounded-br-none'
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                                            }`}
                                    >
                                        {isUser ? (
                                            <div className="whitespace-pre-wrap word-break-break-word">{msg.content}</div>
                                        ) : (
                                            // THIS IS WHERE THE MAGIC HAPPENS
                                            <ReactMarkdown
                                                components={MarkdownComponents}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}

                    {loading && (
                        <div className="flex w-full gap-3 justify-start animate-fade-in">
                            <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg flex-shrink-0 shadow-sm mt-1">
                                🤖
                            </div>
                            <div className="bg-white border border-gray-200 px-4 py-4 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-1.5 h-[46px]">
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} className="h-2" />
                </div>
            </div>

            {/* Input Area - Fixed at bottom */}
            <div className="bg-white border-t border-gray-200 p-4 pb-6 sm:pb-4 flex-none z-20">
                <div className="max-w-4xl mx-auto flex flex-col gap-2">
                    <div className="relative flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent focus-within:bg-white transition-all shadow-sm">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Type your message..."
                            disabled={loading}
                            className="flex-1 bg-transparent border-none text-gray-900 placeholder-gray-400 focus:ring-0 px-3 py-2 text-base outline-none"
                        />
                        <button
                            onClick={sendMessage}
                            disabled={!input.trim() || loading}
                            className={`p-2 rounded-xl flex items-center justify-center transition-all duration-200 ${!input.trim() || loading
                                ? 'bg-gray-200 cursor-not-allowed opacity-50'
                                : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-md'
                                }`}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                    <div className="text-center">
                        <p className="text-[11px] text-gray-400">
                            Please verify important information.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}