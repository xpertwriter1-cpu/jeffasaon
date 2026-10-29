import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp =
    "default-src 'self'; script-src 'self' 'nonce-" +
    nonce +
    "' 'strict-dynamic'" +
    (process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : '') +
    "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'" +
    (process.env.NODE_ENV !== 'production' ? ' ws: wss:' : '') +
    "; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|images/|favicon.ico).*)'],
};
