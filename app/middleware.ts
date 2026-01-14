import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 公开路径：登录页、静态资源、API 认证端点
  const publicPaths = ['/login', '/_next', '/favicon.ico', '/api/auth/login']

  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path))

  if (isPublicPath) {
    return NextResponse.next()
  }

  // 检查 session token
  const sessionToken = request.cookies.get('session_token')?.value

  if (!sessionToken) {
    // 未登录，重定向到登录页
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // 有 token，继续处理（验证在 API routes 或 Server Components 中进行）
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
