import { describe, expect, it } from "vitest";
import { authzResult, type Viewer } from "./membership";

const memberNonAdmin: Viewer = {
  userId: "u1",
  player: { id: "p1", displayName: "Alice" },
  isAdmin: false,
};

const memberAdmin: Viewer = {
  userId: "u2",
  player: { id: "p2", displayName: "Bob" },
  isAdmin: true,
};

const nonMember: Viewer = {
  userId: "u3",
  player: null,
  isAdmin: false,
};

describe("authzResult", () => {
  it("returns unauthenticated when there is no viewer", () => {
    expect(authzResult(null, "member")).toBe("unauthenticated");
    expect(authzResult(null, "admin")).toBe("unauthenticated");
  });

  it("returns not-member when the viewer has no player row", () => {
    expect(authzResult(nonMember, "member")).toBe("not-member");
    expect(authzResult(nonMember, "admin")).toBe("not-member");
  });

  it("returns not-admin when a member needs admin but isn't one", () => {
    expect(authzResult(memberNonAdmin, "admin")).toBe("not-admin");
  });

  it("returns ok when a member+admin needs admin", () => {
    expect(authzResult(memberAdmin, "admin")).toBe("ok");
  });

  it("returns ok when a member needs member (admin or not)", () => {
    expect(authzResult(memberNonAdmin, "member")).toBe("ok");
    expect(authzResult(memberAdmin, "member")).toBe("ok");
  });
});
