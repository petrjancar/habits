import { beforeEach, describe, expect, it } from "vitest";
import { passwordField } from "../../src/components/password-field.js";

// Tests the component state. (Happy DOM doesn't apply Alpine's :type binding,
// so the input's actual type switch is only visible in a real browser.)
describe("passwordField", () => {
  let form;
  let field;

  beforeEach(() => {
    document.body.innerHTML = `<form><div id="wrapper"></div></form>`;
    form = document.querySelector("form");
    field = passwordField();
    field.$el = document.querySelector("#wrapper");
    field.init();
  });

  it("starts hidden", () => {
    expect(field.visible).toBe(false);
  });

  it("toggles visibility", () => {
    field.toggle();
    expect(field.visible).toBe(true);

    field.toggle();
    expect(field.visible).toBe(false);
  });

  it("hides the password again when the form is submitted", () => {
    field.toggle();

    form.dispatchEvent(new Event("submit"));

    expect(field.visible).toBe(false);
  });

  it("works outside a form", () => {
    document.body.innerHTML = `<div id="lonely"></div>`;
    const lonely = passwordField();
    lonely.$el = document.querySelector("#lonely");

    expect(() => lonely.init()).not.toThrow();
  });
});
