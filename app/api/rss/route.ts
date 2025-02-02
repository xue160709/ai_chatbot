import { NextResponse } from 'next/server'
import Parser from 'rss-parser'

// 定义类型
type CustomFeed = {
  title: string;
  description?: string;
  link?: string;
  items?: Array<CustomItem>;
  pubDate?: string;
}

type CustomItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  author?: string;
  contentSnippet?: string;
  content?: string;
}

// 创建带缓存的解析器
const parser: Parser<CustomFeed, CustomItem> = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml,application/xml,application/atom+xml,application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
  timeout: 30000, // 增加超时时间到30秒
  customFields: {
    feed: ['description', 'pubDate'],
    item: ['content', 'contentSnippet', 'author']
  }
})

// 使用 Map 作为简单的内存缓存
const feedCache = new Map<string, { data: CustomFeed; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      // 对于 RSSHub，使用代理
      const finalUrl = url.includes('rsshub.app') 
        ? `https://rsshub-proxy.your-domain.com${new URL(url).pathname}` // 你需要替换这个域名
        : url;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(finalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml,application/xml,application/atom+xml,application/json',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: controller.signal,
        next: { revalidate: 60 }
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text.includes('<?xml') && !text.includes('<rss')) {
        throw new Error('Invalid RSS feed format');
      }
      
      return text;
    } catch (error) {
      lastError = error as Error;
      if (i === retries - 1) break;
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  throw lastError || new Error('Failed to fetch after retries');
}

export async function GET() {
  try {
    console.log('RSS API: 开始处理请求')
    const RSS_FEEDS = [
      'https://36kr.com/feed',
      'https://www.geekpark.net/rss'
    ]

    console.log('RSS API: 准备获取的源:', RSS_FEEDS)
    const feedPromises = RSS_FEEDS.map(async (feed) => {
      try {
        // 检查缓存
        const cachedData = feedCache.get(feed)
        if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
          console.log(`使用缓存数据: ${feed}`)
          return cachedData.data
        }

        console.log(`开始获取新数据: ${feed}`)
        const text = await fetchWithRetry(feed)
        const feedData = await parser.parseString(text)
        
        // 存入缓存
        feedCache.set(feed, {
          data: feedData,
          timestamp: Date.now()
        })
        
        return feedData
      } catch (error) {
        console.error(`获取RSS源失败 ${feed}:`, error)
        const cachedData = feedCache.get(feed)
        if (cachedData) {
          console.log(`Falling back to cached data for ${feed}`)
          return cachedData.data
        }
        return null
      }
    })

    const results = await Promise.all(feedPromises)
    
    const formattedResults = results.map(feed => {
      if (!feed) return null
      
      return {
        title: feed.title || '',
        description: feed.description || '',
        link: feed.link || '',
        items: (feed.items || []).map(item => ({
          title: item.title || '',
          link: item.link || '',
          pubDate: item.pubDate || '',
          author: item.author || '',
          contentSnippet: item.contentSnippet 
            ? item.contentSnippet.substring(0, 200) + '...'
            : ''
        })).slice(0, 10)
      }
    })

    return NextResponse.json({ 
      feeds: formattedResults.filter(Boolean),
      timestamp: new Date().toISOString(),
      status: 'success'
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('RSS API: 处理请求失败:', error)
    return NextResponse.json({ 
      error: true,
      message: error instanceof Error ? error.message : '获取RSS源失败',
      status: 'error'
    }, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
} 