// Eastern Time date helper used by diagnostics and pages
export function todayISO_ET(){
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}
