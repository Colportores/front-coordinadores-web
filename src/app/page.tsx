import { redirect } from "next/navigation";

import { RUTA_INICIAL } from "@/shell/pestanas";

export default function Raiz() {
  redirect(RUTA_INICIAL);
}
