/**
 * Show/hide toggle for a password input. Wrap the input and its toggle button:
 *
 *   <div class="relative" x-data="passwordField">
 *     <input type="password" :type="visible ? 'text' : 'password'" ... />
 *     <button type="button" class="password-toggle" @click="toggle()" ...>
 *   </div>
 *
 * The input is switched back to type="password" when its form is submitted,
 * so password managers still recognise it and offer to save it.
 */
export const passwordField = () => ({
  visible: false,

  init() {
    this.$el.closest("form")?.addEventListener("submit", () => {
      this.visible = false;
    });
  },

  toggle() {
    this.visible = !this.visible;
  },
});
