/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState } from 'react';

type ApiResponse = {
  ok: boolean;
  logs?: string[];
  error?: string;
};

const toLogText = (logs: string[] | undefined) =>
  (logs ?? []).map((line) => String(line || '')).join('\n');

export default function AdminEmailTestPage() {
  const [email, setEmail] = useState('');
  const [logs, setLogs] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setStatus('pending');
    setLogs('Sending...\n');
    setError(null);
    try {
      const response = await fetch('/api/admin/test-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;
      const collected = toLogText(data?.logs);
      setLogs(collected || '(no logs)');

      if (!response.ok || !data?.ok) {
        setStatus('error');
        setError(data?.error || `HTTP ${response.status}`);
        return;
      }

      setStatus('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setError(message);
      setLogs((prev) => `${prev}\nCaught error: ${message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Email verification test</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter a recipient email and send a test to run the current verification mail flow. All steps and errors are logged below.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="email-input">
            Email address
          </label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@example.com"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'pending' || !email.trim()}
            className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {status === 'pending' ? 'Sending...' : 'Send test email'}
          </button>
          {error ? (
            <p className="text-sm text-red-600">Error: {error}</p>
          ) : status === 'success' ? (
            <p className="text-sm text-green-600">Test request sent. Check the inbox and logs below.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-black">
        <div className="border-b border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100">
          LOG
        </div>
        <pre className="h-96 w-full overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs text-green-200">
          {logs || 'Logs will appear here after you send a test.'}
        </pre>
      </div>
    </div>
  );
}
