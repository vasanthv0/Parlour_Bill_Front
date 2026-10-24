const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'; // no look-alikes (l, I, O)
const DIGITS = '23456789';                                          // no 0, 1

/** A random password that meets the server's rules (a letter and a number) and is easy to read out. */
export function generatePassword(length = 12): string {
  const pool = LETTERS + DIGITS;
  const random = (n: number) => crypto.getRandomValues(new Uint32Array(n));
  const chars = Array.from(random(length), (r) => pool[r % pool.length]);
  // Guarantee at least one letter and one digit, in random places.
  const [a, b, i, j] = random(4);
  chars[i % length] = LETTERS[a % LETTERS.length];
  let k = j % length;
  if (k === i % length) k = (k + 1) % length;
  chars[k] = DIGITS[b % DIGITS.length];
  return chars.join('');
}
