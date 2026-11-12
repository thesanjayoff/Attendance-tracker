import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">A</div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Attendance Tracker</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to continue</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
