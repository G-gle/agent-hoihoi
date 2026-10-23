// Public endpoint only. The shared credential is a Workers secret, never a var.
export const GUESTBOOK_NOTIFY_URL = "https://script.google.com/macros/s/AKfycbwJM0Xb0H55iEdMSUwcj_1lk3uu3UEhH3YVXVfQNzTqzMDGTUNxhKdVwhq3Hbe638o1rA/exec";
export function notificationVars(environment) {
  if (!["staging", "production"].includes(environment)) throw new Error("Unknown notification environment.");
  return { GUESTBOOK_NOTIFY_URL, GUESTBOOK_NOTIFY_ENVIRONMENT: environment };
}
