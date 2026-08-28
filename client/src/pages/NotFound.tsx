import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Link } from "wouter";

export default function NotFound() {
  usePageTitle("Page not found");

  return (
    <main role="status" className="flex min-h-screen items-center justify-center bg-[#f5f3eb] p-8 text-[#173d35]">
      <div className="w-full max-w-lg rounded-[28px] border border-[#dfe1d5] bg-[#fffef9] p-10 text-center shadow-sm">
        <Compass className="mx-auto h-10 w-10 text-[#39705d]" aria-hidden="true" />
        <h1 className="mt-5 font-[Fraunces] text-5xl font-semibold tracking-[-.05em]">404</h1>
        <h2 className="mt-3 font-[Fraunces] text-2xl font-semibold">This court doesn't exist</h2>
        <p className="mt-3 text-sm leading-6 text-[#66756c]">
          The page you're looking for may have been moved, or the link is out of date.
          Head back to find your next game instead.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="inline-flex items-center justify-center rounded-full bg-[#19473e] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#123b33]">
            Community home
          </Link>
          <Link href="/venues" className="inline-flex items-center justify-center rounded-full border border-[#d9ddd2] bg-white px-5 py-2.5 text-sm font-bold text-[#47685d] hover:bg-[#f1f4ec]">
            Browse venues
          </Link>
        </div>
      </div>
    </main>
  );
}
