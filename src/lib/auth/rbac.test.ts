import { describe, expect, it } from "vitest";
import { canApproveFor, canViewEmployee, filterVisibleEmployees, requireRole, ForbiddenError } from "./rbac";

const employee = { id: "emp1", managerId: "mgr1", secondApproverId: "mgr2", delegateId: "delegate1" };
const otherEmployee = { id: "emp2", managerId: "mgr3", secondApproverId: null, delegateId: null };

describe("canViewEmployee", () => {
  it("lets an employee view their own data", () => {
    expect(canViewEmployee({ id: "emp1", role: "EMPLOYEE" }, employee)).toBe(true);
  });

  it("blocks an employee from viewing an unrelated employee's data", () => {
    expect(canViewEmployee({ id: "emp1", role: "EMPLOYEE" }, otherEmployee)).toBe(false);
  });

  it("lets the direct manager view their report's data", () => {
    expect(canViewEmployee({ id: "mgr1", role: "MANAGER" }, employee)).toBe(true);
  });

  it("lets the second-level approver view the employee's data", () => {
    expect(canViewEmployee({ id: "mgr2", role: "MANAGER" }, employee)).toBe(true);
  });

  it("lets the delegate view the employee's data", () => {
    expect(canViewEmployee({ id: "delegate1", role: "MANAGER" }, employee)).toBe(true);
  });

  it("blocks a manager who is not in the approval chain", () => {
    expect(canViewEmployee({ id: "mgr3", role: "MANAGER" }, employee)).toBe(false);
  });

  it("lets HR and OWNER view anyone", () => {
    expect(canViewEmployee({ id: "hr1", role: "HR" }, otherEmployee)).toBe(true);
    expect(canViewEmployee({ id: "owner1", role: "OWNER" }, otherEmployee)).toBe(true);
  });
});

describe("canApproveFor", () => {
  it("lets the manager, second approver, and delegate approve", () => {
    expect(canApproveFor({ id: "mgr1", role: "MANAGER" }, employee)).toBe(true);
    expect(canApproveFor({ id: "mgr2", role: "MANAGER" }, employee)).toBe(true);
    expect(canApproveFor({ id: "delegate1", role: "MANAGER" }, employee)).toBe(true);
  });

  it("blocks an outsider from approving", () => {
    expect(canApproveFor({ id: "random", role: "MANAGER" }, employee)).toBe(false);
  });
});

describe("filterVisibleEmployees", () => {
  it("returns everything for HR/OWNER", () => {
    expect(filterVisibleEmployees({ id: "hr1", role: "HR" }, [employee, otherEmployee])).toHaveLength(2);
  });

  it("returns only the manager's own reports for a MANAGER", () => {
    const result = filterVisibleEmployees({ id: "mgr1", role: "MANAGER" }, [employee, otherEmployee]);
    expect(result.map((e) => e.id)).toEqual(["emp1"]);
  });

  it("returns only self for a plain EMPLOYEE, even if an id is swapped in", () => {
    const result = filterVisibleEmployees({ id: "emp1", role: "EMPLOYEE" }, [employee, otherEmployee]);
    expect(result.map((e) => e.id)).toEqual(["emp1"]);
  });
});

describe("requireRole", () => {
  it("passes silently when the role is allowed", () => {
    expect(() => requireRole({ id: "hr1", role: "HR" }, ["HR", "OWNER"])).not.toThrow();
  });

  it("throws ForbiddenError when the role is not allowed", () => {
    expect(() => requireRole({ id: "emp1", role: "EMPLOYEE" }, ["HR", "OWNER"])).toThrow(ForbiddenError);
  });
});
