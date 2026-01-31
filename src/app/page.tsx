import { redirect } from "next/navigation";

export default function StaffPage() {
  // Redirige automáticamente al dashboard principal
  redirect("/staff/dashboard");
}