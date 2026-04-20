import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <div className="mx-auto mb-6 w-full max-w-72 sm:max-w-80">
            <Image
              src="/images/pickit-logo.png"
              alt="PICK-IT! Bracket Challenge World Cup 2026"
              width={648}
              height={649}
              priority
              className="h-auto w-full rounded-lg"
            />
          </div>
          <p className="mt-3 text-center text-base leading-7 text-gray-600">
            Sign in, make your group picks, and get ready for a friendly family table with real bragging rights.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
