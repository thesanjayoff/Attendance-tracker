import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.APPROVAL_LINK_SECRET = "test-secret-for-approval-links";

vi.mock("server-only", () => ({}));

interface FakeRecord {
  id: string;
  tokenHash: string;
  leaveRequestId: string;
  approverId: string;
  action: "APPROVE" | "REJECT";
  expiresAt: Date;
  usedAt: Date | null;
}

let store: Map<string, FakeRecord>;
let nextId: number;

vi.mock("../prisma", () => ({
  prisma: {
    approvalLinkToken: {
      create: vi.fn(async ({ data }: { data: Omit<FakeRecord, "id" | "usedAt"> }) => {
        const record: FakeRecord = { ...data, id: String(nextId++), usedAt: null };
        store.set(record.id, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        for (const record of store.values()) {
          if (record.tokenHash === where.tokenHash) return record;
        }
        return null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
        const record = store.get(where.id);
        if (!record || record.usedAt !== where.usedAt) return { count: 0 };
        record.usedAt = data.usedAt;
        return { count: 1 };
      }),
    },
  },
}));

const { createApprovalLinkToken, consumeApprovalLinkToken } = await import("./approvalLink");

describe("approval link tokens", () => {
  beforeEach(() => {
    store = new Map();
    nextId = 1;
  });

  it("consumes a freshly issued token successfully", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "APPROVE" });
    const result = await consumeApprovalLinkToken(token);
    expect(result.ok).toBe(true);
    expect(result.leaveRequestId).toBe("req-1");
    expect(result.approverId).toBe("user-1");
    expect(result.action).toBe("APPROVE");
  });

  it("rejects replay of an already-used token", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "APPROVE" });
    const first = await consumeApprovalLinkToken(token);
    expect(first.ok).toBe(true);

    const second = await consumeApprovalLinkToken(token);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("ALREADY_USED");
  });

  it("rejects a token past its expiry", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "REJECT" });
    const record = [...store.values()][0];
    record.expiresAt = new Date(Date.now() - 1000); // force expiry

    const result = await consumeApprovalLinkToken(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("EXPIRED");
  });

  it("rejects a token that was tampered with", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "APPROVE" });
    const tampered = token.replace(".APPROVE.", ".REJECT.");

    const result = await consumeApprovalLinkToken(tampered);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects a malformed token", async () => {
    const result = await consumeApprovalLinkToken("not-a-real-token");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("MALFORMED");
  });

  it("rejects a token that was never issued", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "APPROVE" });
    store.clear(); // simulate a token signed correctly but never persisted (or already purged)

    const result = await consumeApprovalLinkToken(token);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });

  it("two concurrent consumption attempts only let one through", async () => {
    const token = await createApprovalLinkToken({ leaveRequestId: "req-1", approverId: "user-1", action: "APPROVE" });
    const [a, b] = await Promise.all([consumeApprovalLinkToken(token), consumeApprovalLinkToken(token)]);
    const successes = [a, b].filter((r) => r.ok);
    expect(successes).toHaveLength(1);
  });
});
