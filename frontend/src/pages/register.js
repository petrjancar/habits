import { pb } from "../pb.js";
import { redirectIfAuthed, HOME_URL, LOGIN_URL } from "../auth.js";
import { describeError, getFieldErrors, hasErrorCode } from "../errors.js";
import { validateNewPassword } from "../validation.js";

export const registerComponent = () => ({
  name: "",
  email: "",
  password: "",
  passwordConfirm: "",
  loading: false,
  errorMessage: "",
  fieldErrors: {},

  init() {
    redirectIfAuthed();
  },

  validate() {
    const errors = validateNewPassword(this.password, this.passwordConfirm);
    if (!this.name) {
      errors.name = "Please enter your name.";
    }
    return errors;
  },

  async submit() {
    this.errorMessage = "";
    this.name = this.name.trim();
    this.fieldErrors = this.validate();
    if (Object.keys(this.fieldErrors).length) {
      return;
    }

    this.loading = true;
    try {
      if (await this.createAccount()) {
        await this.logIn();
      }
    } finally {
      this.loading = false;
    }
  },

  /** Returns true when the account was created. */
  async createAccount() {
    try {
      await pb.collection("users").create({
        email: this.email,
        password: this.password,
        passwordConfirm: this.passwordConfirm,
        name: this.name,
      });
      return true;
    } catch (err) {
      console.error(err);
      this.fieldErrors = getFieldErrors(err);
      if (hasErrorCode(err, "email", "validation_not_unique")) {
        this.fieldErrors.email = "This email is already registered.";
      }
      if (!Object.keys(this.fieldErrors).length) {
        this.errorMessage = describeError(
          err,
          "Registration failed. Please try again.",
        );
      }
      return false;
    }
  },

  // The account exists at this point, so a failed login must not be reported
  // as a failed registration: send the user to the login page instead.
  async logIn() {
    try {
      await pb.collection("users").authWithPassword(this.email, this.password);
      window.location.href = HOME_URL;
    } catch (err) {
      console.error(err);
      if (err?.status === 403) {
        // The collection only lets verified users log in.
        await pb
          .collection("users")
          .requestVerification(this.email)
          .catch((verifyErr) => console.error(verifyErr));
        window.location.href = `${LOGIN_URL}?registered=verify`;
      } else {
        window.location.href = `${LOGIN_URL}?registered=created`;
      }
    }
  },
});
