import { redirect } from "next/navigation";
import LandingPage from "./components/landing/LandingPage";

export default function Home() {
  // redirect("/map");

  return (
    <LandingPage />
  )
}
