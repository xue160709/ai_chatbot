"use client"

import { useState } from "react"
import { Bot, Plus, Search, Send, User } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { RssFeedButton, type Feed } from "@/components/ui/rss-feed-button"

// 定义消息类型
interface Message {
  id: number
  role: "user" | "assistant"
  content: string
}

// 初始消息
const initialMessages: Message[] = []

// SiliconFlow API配置
const SILICON_API_KEY = "sk-muldrtvvuufghlgmrukdkwmibmeaemlnbdpyyuqbyknfsjcf"
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions'

// 添加新的System Prompt for RSS
const RSS_SYSTEM_PROMPT = `你是一位专业的新闻编辑和分析师，你的任务是对RSS新闻源进行简明扼要的总结。请遵循以下原则：

1. 总结要求：
   - 提取最重要和最有价值的信息
   - 按主题分类整理
   - 突出时效性强的新闻
   - 去除重复信息

2. 输出格式：
   - 用简短的要点列表形式
   - 每个要点不超过2行
   - 相似主题合并处理
   - 保持客观中立的语气

3. 重点关注：
   - 重大事件和突发新闻
   - 行业趋势和变化
   - 具有实质性影响的发展

请用精炼的语言输出总结，确保信息既完整又简洁。`

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showRssFeed, setShowRssFeed] = useState(false)

  // 修改API调用函数以支持流式输出
  const callSiliconFlowAPI = async (userMessage: string, onChunk: (chunk: string) => void) => {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SILICON_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-R1",
          messages: [
            {
              role: 'system',
              content: RSS_SYSTEM_PROMPT
            },
            ...messages.map(msg => ({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            })),
            {
              role: 'user',
              content: userMessage
            }
          ],
          stream: true, // 启用流式输出
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        throw new Error('API请求失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法获取响应流')
      }

      // 读取流数据
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // 解码并处理数据
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim() !== '')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonString = line.slice(6)
            if (jsonString === '[DONE]') continue
            
            try {
              const jsonData = JSON.parse(jsonString)
              const content = jsonData.choices[0]?.delta?.content
              if (content) {
                onChunk(content)
              }
            } catch (e) {
              console.error('JSON解析错误:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('API调用错误:', error)
      onChunk('抱歉，我遇到了一些问题，请稍后再试。')
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    // 添加用户消息
    const userMessage = {
      id: messages.length + 1,
      role: "user" as const,
      content: input
    }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // 创建AI消息占位
    const aiMessageId = messages.length + 2
    setMessages(prev => [...prev, {
      id: aiMessageId,
      role: "assistant",
      content: ""
    }])

    try {
      // 处理流式响应
      await callSiliconFlowAPI(input, (chunk) => {
        setMessages(prev => prev.map(msg => {
          if (msg.id === aiMessageId) {
            return {
              ...msg,
              content: msg.content + chunk
            }
          }
          return msg
        }))
      })
    } catch (error) {
      console.error('发送消息错误:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 创建新对话
  const handleNewChat = () => {
    setMessages([])
  }

  // 处理RSS内容的函数
  const handleRssFeedsFetched = (feeds: Feed[]) => {
    console.log('RSS feeds fetched:', feeds)
  }

  const handleRssToLLM = async (formattedContent: string) => {
    setIsLoading(true)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SILICON_API_KEY}`
        },
        body: JSON.stringify({
          model: "deepseek-ai/DeepSeek-R1",
          messages: [
            {
              role: 'system',
              content: RSS_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: formattedContent
            }
          ],
          stream: true,
          max_tokens: 1000
        })
      })

      if (!response.ok) {
        throw new Error('API请求失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法获取响应流')
      }

      // 创建新的assistant消息
      const newMessageId = Date.now()
      setMessages(prev => [...prev, {
        id: newMessageId,
        role: "assistant",
        content: ""
      }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim() !== '')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonString = line.slice(6)
            if (jsonString === '[DONE]') continue
            
            try {
              const jsonData = JSON.parse(jsonString)
              const content = jsonData.choices[0]?.delta?.content
              if (content) {
                setMessages(prev => {
                  const lastMessage = prev[prev.length - 1]
                  if (lastMessage && lastMessage.id === newMessageId) {
                    return [
                      ...prev.slice(0, -1),
                      { ...lastMessage, content: lastMessage.content + content }
                    ]
                  }
                  return prev
                })
              }
            } catch (e) {
              console.error('JSON解析错误:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('API调用错误:', error)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content: "抱歉，处理RSS内容时遇到了问题，请稍后再试。"
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col space-y-4">
      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* 顶部导航栏 */}
        <div className="flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">AI 助手</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleNewChat} size="icon" variant="ghost">
              <Plus className="h-4 w-4" />
            </Button>
            <RssFeedButton 
              onFeedsFetched={handleRssFeedsFetched} 
              onSendToLLM={handleRssToLLM}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <Search className="h-4 w-4" />
              RSS订阅
            </RssFeedButton>
          </div>
        </div>

        {/* 聊天区域 */}
        <ScrollArea className="flex-1 px-4 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-3",
                  message.role === "assistant" ? "justify-start" : "justify-end"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Bot className="h-5 w-5" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === "assistant"
                      ? "bg-white shadow-sm"
                      : "bg-primary text-primary-foreground"
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                </div>
                {message.role === "user" && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                    <User className="h-5 w-5 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* 输入区域 */}
        <div className="border-t bg-white p-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 rounded-xl border bg-white p-2 shadow-sm">
              <Input
                className="flex-1 border-0 bg-transparent focus-visible:ring-0"
                placeholder="输入消息..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={isLoading}
              />
              <Button 
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={handleSend}
                disabled={isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 