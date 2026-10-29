import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container page">
      <h1>Page not found</h1>
      <p>The page or record is unavailable.</p>
      <Link className="button" href="/">
        Back to home
      </Link>
    </div>
  );
}
