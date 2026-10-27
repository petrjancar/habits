import { pb } from "../pb.js";
import { redirectIfAuthed, HOME_URL } from "../auth.js";
import { describeError } from "../errors.js";

// Notices shown after registration redirects here (?registered=...).
const REGISTERED_NOTICES = {
  created: "Account created. Please log in.",
  verify:
    "Account created. Check your email to verify your account, then log in.",
};

export const loginComponent = () => ({
  identity: "",
  password: "",
  loading: false,
  errorMessage: "",
  infoMessage: "",

  init() {
    if (redirectIfAuthed()) {
      return;
    }
    const registered = new URLSearchParams(window.location.search).get(
      "registered",
    );
    this.infoMessage = REGISTERED_NOTICES[registered] || "";
  },

  async submit() {
    this.loading = true;
    this.errorMessage = "";
    this.infoMessage = "";

    try {
      await pb
        .collection("users")
        .authWithPassword(this.identity, this.password);
      window.location.href = HOME_URL;
    } catch (err) {
      console.error(err);
      if (err?.status === 400) {
        this.errorMessage = "Invalid email or password.";
      } else if (err?.status === 403) {
        this.errorMessage =
          "Your account isn't verified yet. Check your email for the verification link.";
      } else {
        this.errorMessage = describeError(
          err,
          "Login failed. Please try again.",
        );
      }
    } finally {
      this.loading = false;
    }
  },
});
