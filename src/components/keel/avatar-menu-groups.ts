/**
 * Declarative structure for {@link AvatarMenu} sections (used by tests and kept in sync with UI).
 *
 * @module components/keel/avatar-menu-groups
 */

export const AVATAR_MENU_GROUPS = [
  {
    id: "identity",
    label: "Identity",
    items: [
      { type: "link" as const, href: "/settings", label: "Settings" },
      { type: "action" as const, id: "toggleTheme", label: "Toggle theme" },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      { type: "link" as const, href: "/commitments", label: "Commitments" },
      { type: "link" as const, href: "/incomes", label: "Incomes" },
      { type: "link" as const, href: "/wealth", label: "Assets" },
      { type: "link" as const, href: "/budget", label: "Budget" },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      { type: "link" as const, href: "/help", label: "Help & feedback" },
      { type: "logout" as const, label: "Log out" },
    ],
  },
] as const;
