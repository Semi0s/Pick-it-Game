import { ProfileSetupForm } from "@/components/ProfileSetupForm";

export default function ProfileSetupPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center">
        <ProfileSetupForm />
      </div>
    </main>
  );
}
