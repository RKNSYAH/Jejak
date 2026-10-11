import { test } from "node:test";
import assert from "node:assert/strict";
import { spyOn } from "bun:test";
import * as auth from "../app/engine/controller/userServerController";
import { POST as enrich } from "../app/api/zones/[zoneId]/enrich/route";
import { GET as evidence } from "../app/api/zones/[zoneId]/evidence/route";
import { GET as runStatus } from "../app/api/enrichment-runs/[runId]/route";
import { GET as clusters } from "../app/api/evidence/clusters/route";
import { countFetches, postJson } from "./helpers";

const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) });

const post = (body: string, type?: string) => postJson("/api/zones/pancoran/enrich", body, type);

test("enrich validates the request before authentication and never claims for anonymous users", async (context) => {
    const fetches = countFetches(context);
    const zone = params({ zoneId: "pancoran" });
    assert.equal((await enrich(post("{}", "text/plain"), zone)).status, 415);
    assert.equal((await enrich(post("{"), zone)).status, 400);
    assert.equal((await enrich(post('{"scope":"career"}'), params({ zoneId: "Pancoran!" }))).status, 400);
    assert.equal((await enrich(post('{"scope":"news"}'), zone)).status, 400);
    assert.equal((await enrich(post('{"scope":"career","run_id":"mine"}'), zone)).status, 400);

    const anonymous = await enrich(post('{"scope":"career"}'), zone);
    assert.equal(anonymous.status, 403);
    assert.equal((await anonymous.json()).code, "SIGN_IN_REQUIRED");
    assert.equal(fetches.count, 0);
});

test("evidence and run status reject malformed identifiers", async () => {
    const session = spyOn(auth, "getAuthenticatedUserId").mockResolvedValue("11111111-1111-4111-8111-111111111111");
    try {
        const get = (url: string) => new Request(url);
        assert.equal((await evidence(get("http://localhost/api/zones/pancoran/evidence?scope=jobs"), params({ zoneId: "pancoran" }))).status, 400);
        assert.equal((await evidence(get("http://localhost/api/zones/x/evidence?scope=career"), params({ zoneId: "../x" }))).status, 400);
        assert.equal((await runStatus(get("http://localhost/api/enrichment-runs/42"), params({ runId: "42" }))).status, 400);
        assert.equal((await clusters(get("http://localhost/api/evidence/clusters?city_id=Jakarta%20Selatan&scope=career"))).status, 400);
        assert.equal((await clusters(get("http://localhost/api/evidence/clusters?city_id=jakarta-selatan&scope=jobs"))).status, 400);
    } finally {
        session.mockRestore();
    }
});
