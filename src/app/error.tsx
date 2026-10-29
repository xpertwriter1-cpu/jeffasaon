'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="container page narrow">
      <h1>We couldn't load this page.</h1>
      <p>Please try again. If it continues, contact the school.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
