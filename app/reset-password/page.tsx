import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Password Reset</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Set a new password.</h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            Enter your new password below to finish recovering your account.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <ResetPasswordForm />
        </div>
      </section>
    </main>
  );
}
