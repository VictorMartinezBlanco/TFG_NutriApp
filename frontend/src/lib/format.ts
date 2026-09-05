const TITLES = new Set(["dr", "dra", "prof", "sr", "sra", "d", "dna"]);

// "Dra. Ana Ruiz" -> ["Ana", "Ruiz"]: el tratamiento no forma parte del nombre.
function nameWords(fullName: string) {
  const words = fullName.split(" ").filter(Boolean);
  while (
    words.length > 1 &&
    TITLES.has(words[0].replace(/\.$/, "").toLowerCase())
  ) {
    words.shift();
  }
  return words;
}

export function firstName(fullName: string) {
  return nameWords(fullName)[0] ?? fullName;
}

export function initials(name: string) {
  return nameWords(name)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const SEX_LABEL: Record<string, string> = { M: "Male", F: "Female", X: "Other" };

export function sexLabel(sex: string | null): string | null {
  return sex ? SEX_LABEL[sex] ?? sex : null;
}

const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

export function activityLabel(level: string | null): string | null {
  return level ? ACTIVITY_LABEL[level] ?? level : null;
}

export function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
