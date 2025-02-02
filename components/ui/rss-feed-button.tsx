'use client'

import { Button } from "@/components/ui/button"
import { useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

// 定义更严格的类型
interface FeedItem {
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
}

export interface Feed {
  title: string;
  description: string;
  items: FeedItem[];
}

interface RssFeedButtonProps {
  onFeedsFetched: (feeds: Feed[]) => void;
  onSendToLLM?: (message: string) => void;
  variant?: "ghost" | "default" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export function RssFeedButton({ 
  onFeedsFetched, 
  onSendToLLM,
  variant = "default",
  size = "default",
  className,
  children 
}: RssFeedButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const formatFeedsForLLM = (feeds: Feed[]) => {
    let formattedContent = "请对以下RSS新闻进行精炼的总结，重点提取重要信息，按主题分类整理，突出重大事件和行业趋势：\n\n";
    
    feeds.forEach((feed, index) => {
      formattedContent += `来源：${feed.title}\n`;
      feed.items.forEach((item, itemIndex) => {
        formattedContent += `${itemIndex + 1}. 标题：${item.title}\n`;
        if (item.contentSnippet) {
          formattedContent += `   内容：${item.contentSnippet}\n`;
        }
        if (item.pubDate) {
          formattedContent += `   发布时间：${item.pubDate}\n`;
        }
        formattedContent += '\n';
      });
      formattedContent += '---\n\n';
    });

    return formattedContent;
  }

  const fetchRssFeeds = async () => {
    console.log('开始获取RSS内容...')
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/rss')
      console.log('RSS API响应状态:', response.status)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('获取到的RSS数据:', data)
      
      if (data.error) {
        throw new Error(data.message || 'Failed to fetch RSS feeds')
      }

      const validFeeds = data.feeds.filter(Boolean) as Feed[]
      console.log('有效的RSS源数量:', validFeeds.length)
      
      onFeedsFetched(validFeeds)
      
      // 格式化并发送给LLM
      if (onSendToLLM && validFeeds.length > 0) {
        const formattedContent = formatFeedsForLLM(validFeeds)
        onSendToLLM(formattedContent)
      }
      
      toast.success(`成功获取 ${validFeeds.length} 个RSS源内容！`)
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取RSS内容失败'
      console.error('RSS获取错误:', error)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
      console.log('RSS获取流程结束')
    }
  }

  return (
    <Button 
      onClick={fetchRssFeeds}
      disabled={isLoading}
      variant={variant}
      size={size}
      className={cn(
        className,
        isLoading && "cursor-not-allowed opacity-70"
      )}
    >
      {isLoading ? (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-white" />
          {children || '加载中...'}
        </div>
      ) : (
        children || '获取RSS内容'
      )}
    </Button>
  )
} 