import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSongInstanceId, PARENT_PUBLIC_ID_PATTERN, parentPublicIdOf, parseSongId, SONG_INSTANCE_ID_PATTERN } from "./song-ids.ts";

describe("song ids", () => {
  it("round-trips each region and signed historical versions", () => {
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const gameVersion of [-32768, -1, 0, 14, 32767]) {
        const id = formatSongInstanceId("Ab3xK9pQ", region, gameVersion);
        assert.deepEqual(parseSongId(id), { kind: "instance", parentPublicId: "Ab3xK9pQ", region, gameVersion });
        assert.ok(SONG_INSTANCE_ID_PATTERN.test(id));
        assert.equal(parentPublicIdOf(id), "Ab3xK9pQ");
      }
    }
    assert.deepEqual(parseSongId("Ab3xK9pQ"), { kind: "parent", parentPublicId: "Ab3xK9pQ" });
  });

  it("rejects malformed ids", () => {
    for (const id of ["", "123456789", "bad/id!!", "Ab3xK9pQ:", "Ab3xK9pQ:x1", "Ab3xK9pQ:j01", "Ab3xK9pQ:j-0", "Ab3xK9pQ:j32768", "Ab3xK9pQ:j-32769", "Ab3xK9pQ:j1:2"]) {
      assert.equal(parseSongId(id), null, id);
    }
  });

  it("matches parent and instance ids with the parser's own patterns", () => {
    assert.ok(PARENT_PUBLIC_ID_PATTERN.test("Ab3xK9pQ"));
    for (const id of ["Ab3xK9p", "Ab3xK9pQ:j11", "bad/id!!"]) assert.equal(PARENT_PUBLIC_ID_PATTERN.test(id), false, id);
    for (const id of ["Ab3xK9pQ", "Ab3xK9pQ:x1", "Ab3xK9pQ:j01", "Ab3xK9pQ:j-0"]) assert.equal(SONG_INSTANCE_ID_PATTERN.test(id), false, id);
  });
});
