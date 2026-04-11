export const ROLE_NAMES = {
  superadmin:    "Суперадмин",
  owner:         "Организатор",
  admin:         "Администратор",
  manager:       "Управляющая",
  senior_master: "Старший мастер",
  teacher:       "Преподаватель",
  master:        "Мастер",
};

export const getRoleName = (role) => ROLE_NAMES[role] ?? role;
