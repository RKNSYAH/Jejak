import type { TestContext } from "node:test";

// Shared by the route and Langflow tests. Not a *.test.ts file, so `bun test` does not collect it.

export const completed = (output: unknown) => ({ object: "response", status: "completed", has_errors: false, ...output as object });

export function withEnvironment(url: string | undefined, key: string | undefined) {
    const previous = { url: process.env.NEXT_LANGFLOW_URL, key: process.env.NEXT_LANGFLOW_API_KEY };
    const set = (name: "NEXT_LANGFLOW_URL" | "NEXT_LANGFLOW_API_KEY", value: string | undefined) => {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    };
    set("NEXT_LANGFLOW_URL", url);
    set("NEXT_LANGFLOW_API_KEY", key);
    return () => {
        set("NEXT_LANGFLOW_URL", previous.url);
        set("NEXT_LANGFLOW_API_KEY", previous.key);
    };
}

export const withWorkflowEnvironment = () => withEnvironment("http://localhost:7860/api/v2/workflows", "test-api-key");

export function postJson(path: string, body: string, type = "application/json") {
    return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": type }, body });
}

// Stubs fetch and counts calls, to prove a route never reached Langflow or Supabase.
export function countFetches(context: TestContext) {
    const calls = { count: 0 };
    context.mock.method(globalThis, "fetch", async () => {
        calls.count += 1;
        return Response.json({});
    });
    return calls;
}
