import { redirect } from "next/navigation";
import { appConfig } from "../lib/server";
import { Closed } from "./components";
export default function Home() {
  if (appConfig()) redirect("/member");
  return <Closed />;
}
