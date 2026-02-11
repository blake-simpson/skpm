import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const hostname = request.nextUrl.hostname.toLowerCase();
  const isApiSubdomain = hostname.startsWith('api.');

  if (isApiSubdomain && request.nextUrl.pathname === '/') {
    const canonicalOrigin = process.env.CANONICAL_WEB_ORIGIN?.trim();
    const redirectUrl = canonicalOrigin
      ? new URL('/', canonicalOrigin)
      : (() => {
          const url = request.nextUrl.clone();
          url.hostname = hostname.slice(4);
          url.pathname = '/';
          url.search = '';
          url.hash = '';
          return url;
        })();

    return NextResponse.redirect(redirectUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/']
};
