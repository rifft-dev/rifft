export type MembershipRole = "owner" | "member";

export type ProjectPermissions = {
  can_manage_billing: boolean;
  can_rotate_api_keys: boolean;
  can_update_settings: boolean;
};

export const getPermissionsForRoles = (
  projectRole: MembershipRole | null,
  accountRole: MembershipRole | null,
): ProjectPermissions => {
  const isOwner = projectRole === "owner" || accountRole === "owner";

  return {
    can_manage_billing: accountRole === "owner",
    can_rotate_api_keys: isOwner,
    can_update_settings: isOwner,
  };
};

export const buildRemoveMemberInput = (
  projectId: string,
  removerUserId: string,
  targetUserId: string,
) => ({
  projectId,
  removerUserId,
  targetUserId,
});
