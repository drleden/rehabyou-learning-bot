export const ROLE_LABELS = {
  novice: 'Новичок',
  master: 'Мастер',
  administrator: 'Администратор',
  senior_master: 'Старший мастер',
  teacher: 'Преподаватель',
  manager: 'Менеджер',
  owner: 'Владелец',
  superadmin: 'Суперадмин',
};

export const ROLE_COLORS = {
  novice: 'bg-gray-100 text-gray-600',
  master: 'bg-blue-50 text-blue-600',
  administrator: 'bg-teal-50 text-teal-600',
  senior_master: 'bg-indigo-50 text-indigo-600',
  teacher: 'bg-purple-50 text-purple-600',
  manager: 'bg-accent/10 text-accent',
  owner: 'bg-amber-50 text-amber-700',
  superadmin: 'bg-red-50 text-red-600',
};

export const getRoleLabel = (role) => ROLE_LABELS[role] || role;

export const getRoleColor = (role) => ROLE_COLORS[role] || ROLE_COLORS.novice;
