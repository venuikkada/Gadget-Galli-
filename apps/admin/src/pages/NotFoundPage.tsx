import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <img src="/logo.png" alt="" className="size-14 rounded-2xl" />
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="font-semibold text-primary">
        Go to the dashboard
      </Link>
    </div>
  );
}
