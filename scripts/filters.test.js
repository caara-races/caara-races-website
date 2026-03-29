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
});
