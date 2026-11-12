export type Role = "EMPLOYEE" | "MANAGER" | "HR" | "OWNER";

export interface ActorLike {
  id: string;
  role: Role;
}

export interface EmployeeLike {
  id: string;
  managerId: string | null;
  secondApproverId: string | null;
  delegateId: string | null;
}

const ELEVATED_ROLES: Role[] = ["HR", "OWNER"];

/** True if `actor` is allowed to read `target`'s personal/leave/attendance data. */
export function canViewEmployee(actor: ActorLike, target: EmployeeLike): boolean {
  if (ELEVATED_ROLES.includes(actor.role)) return true;
  if (actor.id === target.id) return true;
  return isApprovalChainMember(actor.id, target);
}

/** True if `actor` can act as an approver (first, second, or delegate) for `target`. */
export function canApproveFor(actor: ActorLike, target: EmployeeLike): boolean {
  if (ELEVATED_ROLES.includes(actor.role)) return true;
  return isApprovalChainMember(actor.id, target);
}

function isApprovalChainMember(actorId: string, target: EmployeeLike): boolean {
  return (
    target.managerId === actorId ||
    target.secondApproverId === actorId ||
    target.delegateId === actorId
  );
}

/** Filters a list of employees down to the ones `actor` is permitted to see. */
export function filterVisibleEmployees<T extends EmployeeLike>(actor: ActorLike, employees: T[]): T[] {
  if (ELEVATED_ROLES.includes(actor.role)) return employees;
  return employees.filter((e) => canViewEmployee(actor, e));
}

export function requireRole(actor: ActorLike, allowed: Role[]): void {
  if (!allowed.includes(actor.role)) {
    throw new ForbiddenError(`Requires one of roles: ${allowed.join(", ")}`);
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}
