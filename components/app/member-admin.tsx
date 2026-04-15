"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import {
  approveMemberAction,
  createShadowMemberAction,
} from "@/server/actions/setup";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  role: "member" | "leader" | "org_admin";
  status: "invited" | "pending" | "active" | "archived";
  userId: string | null;
  createdAt: Date;
  linkedUserName: string | null;
};

export function MemberAdmin({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const createAction = useAction(createShadowMemberAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const approveAction = useAction(approveMemberAction, {
    onSuccess() {
      router.refresh();
    },
  });

  const createErrors = createAction.result.validationErrors;

  return (
    <div className="grid gap-8">
      <form
        className="grid gap-4 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
        action={async (formData) => {
          await createAction.executeAsync({
            fullName: String(formData.get("fullName") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            notes: String(formData.get("notes") ?? ""),
            role: String(formData.get("role") ?? "member") as
              | "member"
              | "leader"
              | "org_admin",
          });
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            name="fullName"
            label="Member name"
            placeholder="Anna Novak"
            required
            error={createErrors?.fullName?._errors?.[0]}
          />
          <FormField
            name="email"
            label="Email"
            type="email"
            placeholder="anna@example.com"
            error={createErrors?.email?._errors?.[0]}
          />
          <FormField name="phone" label="Phone" placeholder="+420..." />
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Role</span>
            <select
              name="role"
              className="h-11 rounded-2xl border border-slate-300 bg-white px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              defaultValue="member"
            >
              <option value="member">Member</option>
              <option value="leader">Leader</option>
              <option value="org_admin">Org admin</option>
            </select>
          </label>
        </div>
        <FormField name="notes" label="Notes" placeholder="Optional admin note" />

        {createAction.result.serverError ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {createAction.result.serverError}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={createAction.isPending}>
          {createAction.isPending ? "Creating..." : "Create member or shadow profile"}
        </Button>
      </form>

      <section className="overflow-hidden rounded-4xl border border-slate-950/10 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Member</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Link</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-t border-slate-200">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">
                      {getMemberDisplayName(member)}
                    </div>
                    <div className="text-slate-500">{member.email || "No email yet"}</div>
                  </td>
                  <td className="px-6 py-4 capitalize">{member.status}</td>
                  <td className="px-6 py-4 capitalize">{member.role.replace("_", " ")}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {member.userId ? member.linkedUserName || "Linked" : "Shadow profile"}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {formatDateTime(member.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    {member.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          approveAction.execute({
                            memberId: member.id,
                            role: member.role,
                          })
                        }
                        disabled={approveAction.isPending}
                      >
                        Approve
                      </Button>
                    ) : (
                      <span className="text-slate-400">No action</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
