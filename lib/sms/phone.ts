const E164 = /^\+[1-9]\d{7,14}$/;

export function normalizeE164(value: string, defaultCountryCode = "233") {
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  if (phone.startsWith("0")) phone = `+${defaultCountryCode}${phone.slice(1)}`;
  if (!phone.startsWith("+") && /^\d+$/.test(phone)) phone = `+${phone}`;

  if (!E164.test(phone)) {
    throw new Error("The recipient phone number must be a valid international number.");
  }
  return phone;
}
