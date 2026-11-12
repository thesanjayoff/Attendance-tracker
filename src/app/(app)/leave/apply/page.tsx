import { requireUser } from "../../../../lib/auth/guard";
import { prisma } from "../../../../lib/prisma";
import { Card } from "../../../../components/ui/Card";
import { ApplyLeaveForm } from "./ApplyLeaveForm";

export default async function ApplyLeavePage() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const leaveTypes = await prisma.leaveType.findMany({
    where: { active: true, OR: [{ applicableGender: "ALL" }, { applicableGender: dbUser.gender === "MALE" || dbUser.gender === "FEMALE" ? dbUser.gender : "ALL" }] },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Apply for leave</h1>
      <Card>
        <ApplyLeaveForm leaveTypes={leaveTypes.map((lt) => ({ id: lt.id, name: lt.name }))} />
      </Card>
    </div>
  );
}
