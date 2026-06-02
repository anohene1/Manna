import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "./builtin-themes"

describe("built-in broadcast themes", () => {
  it("ships Bold Proclamation plus the three C variants", () => {
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual(
      [
        "builtin-bold-proclamation",
        "builtin-bold-crimson",
        "builtin-bold-cobalt",
        "builtin-bold-chapel",
      ],
    )
  })
})
