import { notFound } from "next/navigation";
import GrandmaMatcherClient from "./GrandmaMatcherClient";
import { isValidFamilyToken } from "@/lib/family-secret-santa";

export default async function GrandmaMatcherPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isValidFamilyToken(token)) {
    notFound();
  }

  return <GrandmaMatcherClient token={token} />;
}
