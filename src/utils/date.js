// Single source of truth for 'today' in Eastern Time (MLB slates)
export function todayISO_ET(){
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
}
