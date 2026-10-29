'use client';
import { useEffect, useState } from 'react';
export function UnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function update() {
      try {
        const response = await fetch('/admin/enquiries/unread', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          typeof result === 'object' &&
          result !== null &&
          'unread' in result &&
          typeof result.unread === 'number'
        )
          setCount(result.unread);
      } catch {
        /* Keep navigation available during a connection interruption. */
      }
    }
    void update();
    const timer = setInterval(() => void update(), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return count > 0 ? (
    <span className="status" aria-label={count + ' unread enquiries'} aria-live="polite">
      {count}
    </span>
  ) : null;
}
