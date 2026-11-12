import { NextRequest, NextResponse } from "next/server";
import { consumeApprovalLinkToken } from "../../../../lib/auth/approvalLink";
import { isApprovalLinkRateLimited } from "../../../../lib/auth/rateLimit";
import { decideLeaveRequest, ValidationFailedError } from "../../../../server/leaveService";
import { ForbiddenError } from "../../../../lib/auth/rbac";

function page(title: string, message: string, ok: boolean) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>${title}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
      .card{max-width:420px;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
      .icon{font-size:40px;margin-bottom:12px}
      h1{font-size:18px;margin:0 0 8px;color:#0f172a}
      p{color:#64748b;font-size:14px;margin:0}
    </style>
    </head><body>
      <div class="card">
        <div class="icon">${ok ? "✅" : "⚠️"}</div>
        <h1>${title}</h1>
        <p>${message}</p>
      </div>
    </body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isApprovalLinkRateLimited(ip)) {
    return page("Too many attempts", "Please wait a minute and try again.", false);
  }

  const verification = await consumeApprovalLinkToken(token);
  if (!verification.ok) {
    const messages: Record<string, string> = {
      MALFORMED: "This link is invalid.",
      BAD_SIGNATURE: "This link is invalid or has been tampered with.",
      NOT_FOUND: "This link is invalid or has expired.",
      EXPIRED: "This link has expired. Please use the app to respond instead.",
      ALREADY_USED: "This link has already been used.",
    };
    return page("Link not valid", messages[verification.reason ?? "NOT_FOUND"], false);
  }

  try {
    await decideLeaveRequest({
      requestId: verification.leaveRequestId!,
      actorId: verification.approverId!,
      action: verification.action!,
    });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return page("Not authorized", "You are no longer an approver for this request.", false);
    }
    if (err instanceof ValidationFailedError) {
      return page("Could not process", err.message, false);
    }
    return page("Could not process", err instanceof Error ? err.message : "Something went wrong.", false);
  }

  return page(
    verification.action === "APPROVE" ? "Leave approved" : "Leave rejected",
    `The leave request has been ${verification.action === "APPROVE" ? "approved" : "rejected"}.`,
    true
  );
}
