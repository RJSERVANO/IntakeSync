export function normalizePhilippineMobile(value: string) {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^\+639\d{9}$/.test(compact)) return compact;
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^9\d{9}$/.test(compact)) return `+63${compact}`;
  if (/^639\d{9}$/.test(compact)) return `+${compact}`;
  return null;
}

export function formatBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (date > today) return null;

  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  if (age < 13 || age > 120) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatBackendBirthDateForInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return formatBirthDateInput(value);
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function capitalizeWords(value: string) {
  return value.replace(/\S+/g, (word) =>
    word
      .split(/([-'])/)
      .map((part) => {
        if (part === '-' || part === "'") return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('')
  );
}
