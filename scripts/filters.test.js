import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAddress } from "../eleventy.config.js";

describe("formatAddress", () => {
  const location = {
    name: "Marblehead High School",
    address: "2 Humphrey Street\nMarblehead, MA",
  };

  it("uses <br/> as the default separator", () => {
    assert.equal(
      formatAddress(location),
      "Marblehead High School<br/>2 Humphrey Street<br/>Marblehead, MA",
    );
  });

  it("uses a custom separator", () => {
    assert.equal(
      formatAddress(location, ", "),
      "Marblehead High School, 2 Humphrey Street, Marblehead, MA",
    );
  });

  it("handles a single-line address", () => {
    const single = { name: "Good Harbor Beach", address: "Gloucester, MA" };
    assert.equal(formatAddress(single), "Good Harbor Beach<br/>Gloucester, MA");
  });

  it("uses defaultName when name is not set", () => {
    const noName = { address: "2 Humphrey Street\nMarblehead, MA" };
    assert.equal(
      formatAddress(noName, "<br/>", "Start"),
      "Start<br/>2 Humphrey Street<br/>Marblehead, MA",
    );
  });

  it("returns address only when no name and no default", () => {
    const noName = { address: "2 Humphrey Street\nMarblehead, MA" };
    assert.equal(formatAddress(noName), "2 Humphrey Street<br/>Marblehead, MA");
  });

  it("prefers location.name over defaultName", () => {
    assert.equal(
      formatAddress(location, "<br/>", "Fallback"),
      "Marblehead High School<br/>2 Humphrey Street<br/>Marblehead, MA",
    );
  });

  it("escapes ampersands in address text", () => {
    const loc = { address: "Harbor Ave & Ocean Ave, Marblehead, MA" };
    assert.equal(
      formatAddress(loc),
      "Harbor Ave &amp; Ocean Ave, Marblehead, MA",
    );
  });

  it("escapes ampersands in name", () => {
    const loc = { name: "Town & Country", address: "123 Main St" };
    assert.equal(formatAddress(loc), "Town &amp; Country<br/>123 Main St");
  });

  it("escapes HTML special characters in address", () => {
    const loc = { address: 'Corner of 1st & "Main" St' };
    assert.equal(formatAddress(loc), "Corner of 1st &amp; &quot;Main&quot; St");
  });
});
