export const MIN_PASSWORD_LENGTH = 8;

/** Client-side password checks shared by registration and password change. */
export function validateNewPassword(password, passwordConfirm) {
  const errors = {};
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (password !== passwordConfirm) {
    errors.passwordConfirm = "Passwords do not match.";
  }
  return errors;
}
