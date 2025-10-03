export function generateOtp() {
  // generates a number 0..999999, then pads to 6 digits with leading zeros
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}
