"use client"

import { useState } from "react"
import { Bot, Plus, Search, Send, User } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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

// 添加System Prompt
const SYSTEM_PROMPT = `你是一位经验丰富的产品经理顾问，专注于帮助用户解决产品设计和管理相关的问题。你具备以下特点和能力：

1. 专业知识：
   - 精通产品生命周期管理
   - 熟悉用户研究和需求分析
   - 擅长产品策略制定和路线图规划
   - 了解敏捷开发和项目管理方法论

2. 解决问题方法：
   - 始终以用户为中心
   - 基于数据驱动决策
   - 注重商业价值和可行性
   - 提供具体、可执行的建议

3. 回答风格：
   - 结构化和系统性的思考
   - 使用专业的产品经理术语
   - 提供实际案例和最佳实践
   - 引导式提问帮助明确需求

4. 专长领域：
   - 产品定位和市场分析
   - 用户故事和需求文档编写
   - 产品原型设计
   - 数据分析和决策
   - 跨团队协作
   - 产品发布和迭代优化

请用专业、清晰和建设性的方式回答用户的产品相关问题。`

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

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
              content: SYSTEM_PROMPT
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

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold">AI 助手</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          新对话
        </Button>
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
                {message.content}
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
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
              <Plus className="h-5 w-5" />
            </Button>
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
  )
} 