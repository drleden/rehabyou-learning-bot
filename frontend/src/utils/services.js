export const SERVICES = [
  { value: 'classic', label: 'Классический массаж', icon: '💆' },
  { value: 'sport', label: 'Спортивный массаж', icon: '💪' },
  { value: 'relax', label: 'Расслабляющий массаж', icon: '🕯️' },
  { value: 'anticellulite', label: 'Антицеллюлитный массаж', icon: '✨' },
  { value: 'face', label: 'Массаж лица', icon: '🧖' },
  { value: 'taping', label: 'Тейпирование', icon: '🩹' },
  { value: 'stones', label: 'Массаж камнями', icon: '🪨' },
];

export const getServiceLabel = (value) =>
  SERVICES.find((s) => s.value === value)?.label || value;
