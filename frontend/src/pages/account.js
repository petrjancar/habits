import { pb } from "../pb.js";
import { LOGIN_URL, requireAuth } from "../auth.js";
import { createStore } from "../data.js";
import { toCsv } from "../lib/habits.js";
import { MAX_IMPORT_BYTES, planImport } from "../lib/csv-import.js";
import { todayKey } from "../lib/dates.js";
import { THEMES, applyTheme, normalizeTheme } from "../theme.js";
import { describeError, getFieldErrors, hasErrorCode } from "../errors.js";
import { validateNewPassword } from "../validation.js";
import { formatDate, initials } from "../format.js";

const emptyPasswordForm = () => ({
  oldPassword: "",
  password: "",
  passwordConfirm: "",
});

// Read-only account details (join date) come from $store.auth.user.
export const WEEK_STARTS = [
  { key: "monday", label: "Monday" },
  { key: "sunday", label: "Sunday" },
];

export const accountComponent = ({ store = createStore() } = {}) => ({
  name: "",
  email: "",
  loading: false,
  errorMessage: "",
  successMessage: "",
  fieldErrors: {},
  formatDate,
  initials,

  passwordForm: emptyPasswordForm(),
  passwordLoading: false,
  passwordError: "",
  passwordSuccess: "",
  passwordErrors: {},

  themes: THEMES,
  weekStarts: WEEK_STARTS,
  theme: "system",
  weekStart: "monday",
  settingsError: "",
  exporting: false,
  confirmDelete: false,

  // CSV import: idle -> preview -> saving -> done (or back to idle).
  importStage: "idle",
  importPlan: null,
  importFileName: "",
  importError: "",
  importProgress: "",
  importResult: "",

  init() {
    if (!requireAuth()) {
      return;
    }
    const user = pb.authStore.record;
    this.name = user.name || "";
    this.email = user.email || "";
    this.theme = normalizeTheme(user.theme);
    this.weekStart = user.week_start === "sunday" ? "sunday" : "monday";
  },

  /** Saves one setting on the user record; reverts `field` if that fails. */
  async saveSetting(data, revert) {
    this.settingsError = "";
    try {
      const updatedUser = await pb
        .collection("users")
        .update(pb.authStore.record.id, data);
      pb.authStore.save(pb.authStore.token, updatedUser);
    } catch (err) {
      console.error(err);
      revert();
      this.settingsError = describeError(err, "Couldn't save the setting.");
    }
  },

  setTheme(theme) {
    const previous = this.theme;
    this.theme = theme;
    applyTheme(theme);
    return this.saveSetting({ theme }, () => {
      this.theme = previous;
      applyTheme(previous);
    });
  },

  setWeekStart(weekStart) {
    const previous = this.weekStart;
    this.weekStart = weekStart;
    return this.saveSetting({ week_start: weekStart }, () => {
      this.weekStart = previous;
    });
  },

  async exportCsv() {
    this.settingsError = "";
    this.exporting = true;
    try {
      await store.load();
      const csv = toCsv(store.habits, (id) => store.doneOf(id));
      const url = URL.createObjectURL(
        new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `habits-${todayKey()}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      this.settingsError = describeError(err, "Couldn't export your data.");
    } finally {
      this.exporting = false;
    }
  },

  /** Reads the chosen file and shows what importing it would change. */
  async readImportFile(file) {
    this.importError = "";
    this.importResult = "";
    this.importStage = "idle";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      this.importError = "The file is too large (the limit is 5 MB).";
      return;
    }
    try {
      const [text] = await Promise.all([file.text(), store.load()]);
      const plan = planImport(
        text,
        store.habits,
        (id) => store.doneOf(id),
        todayKey(),
      );
      if (plan.error) {
        this.importError = plan.error;
        return;
      }
      this.importPlan = plan;
      this.importFileName = file.name;
      this.importStage = "preview";
    } catch (err) {
      console.error(err);
      this.importError = describeError(err, "Couldn't read the file.");
    }
  },

  /** Summary lines for the preview. */
  importSummary() {
    const c = this.importPlan?.counts;
    if (!c) return [];
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const lines = [];
    if (c.newHabits)
      lines.push(`${plural(c.newHabits, "new habit", "new habits")}`);
    if (c.existingHabits) {
      lines.push(
        `${plural(c.existingHabits, "habit you already have gets", "habits you already have get")} more history`,
      );
    }
    if (!c.newHabits && !c.checkins) {
      lines.push("Nothing new to add: everything in this file is already here");
    } else {
      lines.push(`${plural(c.checkins, "check-in", "check-ins")} to add`);
    }
    if (c.duplicates && (c.newHabits || c.checkins)) {
      lines.push(
        `${plural(c.duplicates, "check-in is", "check-ins are")} already there and will be skipped`,
      );
    }
    if (c.problems) {
      lines.push(
        `${plural(c.problems, "row", "rows")} can't be used and will be skipped`,
      );
    }
    return lines;
  },

  get importHasChanges() {
    const c = this.importPlan?.counts;
    return !!c && (c.newHabits > 0 || c.checkins > 0);
  },

  cancelImport() {
    this.importStage = "idle";
    this.importPlan = null;
    this.importError = "";
  },

  async confirmImport() {
    this.importError = "";
    this.importStage = "saving";
    this.importProgress = "Creating habits…";
    try {
      const saved = await store.importPlan(this.importPlan, (done, total) => {
        this.importProgress = `Saving check-ins… ${done} of ${total}`;
      });
      const habits = this.importPlan.counts.newHabits;
      this.importResult = `Imported ${habits} new ${habits === 1 ? "habit" : "habits"} and ${saved} ${saved === 1 ? "check-in" : "check-ins"}.`;
      this.importStage = "done";
      this.importPlan = null;
    } catch (err) {
      console.error(err);
      this.importStage = "idle";
      this.importPlan = null;
      this.importError = `${describeError(err, "The import stopped part way.")} Importing the same file again finishes it: anything already saved is skipped.`;
    }
  },

  logout() {
    pb.authStore.clear();
    window.location.href = LOGIN_URL;
  },

  resetMessages() {
    this.errorMessage = "";
    this.successMessage = "";
    this.fieldErrors = {};
  },

  async save() {
    this.resetMessages();
    this.name = this.name.trim();
    if (!this.name) {
      this.fieldErrors = { name: "Name cannot be empty." };
      return;
    }

    this.loading = true;
    try {
      const updatedUser = await pb
        .collection("users")
        .update(pb.authStore.record.id, { name: this.name });
      // Updates $store.auth.user (nav, account details) via onChange.
      pb.authStore.save(pb.authStore.token, updatedUser);
      this.name = updatedUser.name || "";
      this.successMessage = "Profile updated.";
    } catch (err) {
      console.error(err);
      this.fieldErrors = getFieldErrors(err);
      if (!Object.keys(this.fieldErrors).length) {
        this.errorMessage = describeError(err, "Profile update failed.");
      }
    } finally {
      this.loading = false;
    }
  },

  async changePassword() {
    this.passwordError = "";
    this.passwordSuccess = "";
    const { oldPassword, password, passwordConfirm } = this.passwordForm;
    this.passwordErrors = validateNewPassword(password, passwordConfirm);
    if (!oldPassword) {
      this.passwordErrors.oldPassword = "Enter your current password.";
    }
    if (Object.keys(this.passwordErrors).length) {
      return;
    }

    this.passwordLoading = true;
    const { id, email } = pb.authStore.record;
    try {
      await pb
        .collection("users")
        .update(id, { oldPassword, password, passwordConfirm });
    } catch (err) {
      console.error(err);
      this.passwordErrors = getFieldErrors(err);
      if (hasErrorCode(err, "oldPassword", "validation_invalid_old_password")) {
        this.passwordErrors.oldPassword = "Current password is incorrect.";
      }
      if (!Object.keys(this.passwordErrors).length) {
        this.passwordError = describeError(err, "Password change failed.");
      }
      this.passwordLoading = false;
      return;
    }

    // Changing the password invalidates all existing tokens (this session
    // included), so log in again with the new password straight away.
    try {
      await pb.collection("users").authWithPassword(email, password);
      this.passwordForm = emptyPasswordForm();
      this.passwordSuccess = "Password changed.";
    } catch (err) {
      console.error(err);
      // Clearing the session redirects to the login page (see requireAuth).
      pb.authStore.clear();
    } finally {
      this.passwordLoading = false;
    }
  },

  async deleteAccount() {
    // The page asks for confirmation (confirmDelete) before calling this.
    if (this.loading || this.passwordLoading) {
      return;
    }

    this.resetMessages();
    this.loading = true;
    try {
      await pb.collection("users").delete(pb.authStore.record.id);
      // Clearing the session redirects to the login page (see requireAuth).
      pb.authStore.clear();
    } catch (err) {
      console.error(err);
      this.errorMessage = describeError(err, "Account deletion failed.");
    } finally {
      this.loading = false;
    }
  },
});
