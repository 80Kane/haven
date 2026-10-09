import "server-only";
import { cookies } from "next/headers";
import { appConfig, type AppConfig } from "./config";
import {
  createAuthClient,
  clearAuthCookies,
  type CookiePort,
} from "./provider";
export async function serverClient(config: AppConfig, writable = false) {
  const jar = await cookies();
  const port: CookiePort = {
    getAll: () => jar.getAll(),
    setAll: (values) => {
      if (writable)
        for (const { name, value, options } of values)
          jar.set(name, value, options);
    },
  };
  return {
    client: createAuthClient(config, port),
    clear: () => clearAuthCookies(config, port),
  };
}
export { appConfig };
