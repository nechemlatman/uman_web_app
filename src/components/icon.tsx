const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  travel: "M22 2 9 15 M22 2l-8 20-5-7-7-5z",
  stay: "M3 21V9l9-7 9 7v12 M9 21v-7h6v7 M3 21h18",
  operations: "M9 5H5v16h14V5h-4 M9 3h6v4H9z M8 12l2 2 5-5 M8 18h8",
  finance: "M3 5h18v14H3z M3 9h18 M15 15h3",
  schedule: "M8 2v4 M16 2v4 M3 10h18 M3 4h18v18H3z M8 14h3v3H8z",
  alerts: "M12 3 2 21h20z M12 9v5 M12 17v1",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  search: "M21 21l-6-6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  logout: "M9 3H3v18h6 M10 12h11 M17 8l4 4-4 4",
  location: "M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12z M12 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.operations} />
    </svg>
  );
}
