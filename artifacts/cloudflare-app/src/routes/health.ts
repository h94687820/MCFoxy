import { Hono } from "hono";
import { HealthCheckResponse } from "@workspace/api-zod";
import type { Bindings, Variables } from "../env.d";

const health = new Hono<{ Bindings: Bindings; Variables: Variables }>();

health.get("/healthz", (c) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  return c.json(data);
});

export default health;
