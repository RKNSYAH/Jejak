import { plugin } from "bun";

// Next.js resolves "server-only" to an empty module on the server. Bun does not,
// so route tests that import server controllers would fail to load without this.
plugin({
    name: "server-only test shim",
    setup(build) {
        build.module("server-only", () => ({ contents: "export {};", loader: "js" }));
    },
});
