export const runtime = 'edge';

export default function AdminTestIndexPage() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Test utilities</h1>
        <p className="mt-1 text-sm text-gray-600">Quick links to admin test tools.</p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-sm text-blue-600">
          <li>
            <a className="underline" href="./test/email">
              Email verification test
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
