import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

const source = fs.readFileSync(new URL("./Model.js", import.meta.url), "utf8")
  .replace(/^\.pragma library\s*/, "")
const model = {}
vm.createContext(model)
vm.runInContext(source, model, { filename: "Model.js" })

const manifest = JSON.parse(fs.readFileSync(new URL("./manifest.json", import.meta.url), "utf8"))
assert.equal(manifest.schemaVersion, 1)
assert.equal(manifest.id, "io.github.ricky.ghstats")
assert.deepEqual(manifest.kinds, ["bar-widget"])
assert.equal(manifest.entryPoints.barWidget, "BarWidget.qml")
assert.equal(manifest.barWidget.defaultSection, "right")

const barWidget = fs.readFileSync(new URL("./BarWidget.qml", import.meta.url), "utf8")
assert.match(barWidget, /^BarWidget\s*\{/m)
for (const method of ["open", "close", "toggle", "closeForPopoutSwitch"])
  assert.match(barWidget, new RegExp(`function\\s+${method}\\s*\\(`))
assert.match(barWidget, /source:\s*Qt\.resolvedUrl\("Panel\.qml"\)/)
assert.doesNotMatch(barWidget, /\bIpcHandler\s*\{/)

const panel = fs.readFileSync(new URL("./Panel.qml", import.meta.url), "utf8")
assert.match(panel, /^Panel\s*\{/m)
assert.match(panel, /property\s+var\s+anchorItem:\s*null/)
assert.match(panel, /property\s+var\s+hostWidget:\s*null/)
assert.match(panel, /KeyboardPanel\s*\{/)

assert.deepEqual(model.parseSnapshot(""), model.emptySnapshot())
assert.equal(model.parseSnapshot("{not json").ok, false)

const parsed = model.parseSnapshot(JSON.stringify({
  ok: true,
  authenticated: true,
  login: "srineshr1",
  totalContributions: 417,
  weeks: [
    { days: [
      { date: "2026-08-17", count: 0, level: "NONE", weekday: 1 },
      { date: "2026-08-18", count: 1, level: "FIRST_QUARTILE", weekday: 2 },
      { date: "2026-08-19", count: 5, level: "SECOND_QUARTILE", weekday: 3 },
      { date: "2026-08-20", count: 7, level: "SECOND_QUARTILE", weekday: 4 }
    ] }
  ],
  notifications: [
    { id: "1", unread: true, reason: "ci_activity", type: "CheckSuite", repo: "me/app", title: "CI failed", apiUrl: null },
    { id: "2", unread: true, reason: "mention", type: "PullRequest", repo: "me/app", title: "Hello", apiUrl: "https://api.github.com/repos/me/app/pulls/4" },
    { id: "3", unread: false, reason: "comment", type: "Issue", repo: "me/app", title: "Old", apiUrl: "https://api.github.com/repos/me/app/issues/9" }
  ],
  unread: 2
}))
assert.equal(parsed.login, "srineshr1")
assert.equal(parsed.totalContributions, 417)

const days = model.flattenDays(parsed.weeks)
assert.equal(days.length, 4)
assert.equal(
  JSON.stringify(model.lastDays(days, 2).map((d) => d.date)),
  JSON.stringify(["2026-08-19", "2026-08-20"])
)

assert.equal(model.currentStreak([
  { count: 1 }, { count: 1 }, { count: 0 }
]), 2)
assert.equal(model.currentStreak([
  { count: 1 }, { count: 1 }, { count: 1 }
]), 3)
assert.equal(model.currentStreak([]), 0)
assert.equal(model.longestStreak([
  { count: 1 }, { count: 1 }, { count: 0 }, { count: 1 }, { count: 1 }, { count: 1 }
]), 3)

assert.equal(model.badgeText(0), "")
assert.equal(model.badgeText(12), "12")
assert.equal(model.badgeText(100), "99+")

assert.equal(model.unreadCount(parsed.notifications, false), 2)
assert.equal(model.unreadCount(parsed.notifications, true), 1)
assert.equal(model.filterNotifications(parsed.notifications, true, true).length, 1)
assert.equal(model.filterNotifications(parsed.notifications, false, true).length, 2)

assert.equal(
  model.notificationUrl({ type: "PullRequest", apiUrl: "https://api.github.com/repos/me/app/pulls/4" }),
  "https://github.com/me/app/pull/4"
)
assert.equal(
  model.notificationUrl({ type: "Issue", apiUrl: "https://api.github.com/repos/me/app/issues/9" }),
  "https://github.com/me/app/issues/9"
)
assert.equal(
  model.notificationUrl({ type: "Commit", apiUrl: "https://api.github.com/repos/me/app/commits/abc123" }),
  "https://github.com/me/app/commit/abc123"
)
assert.equal(
  model.notificationUrl({ type: "CheckSuite", reason: "ci_activity", repo: "me/app" }),
  "https://github.com/me/app/actions"
)
assert.equal(model.notificationUrl(null), "https://github.com/notifications")

const now = Date.parse("2026-08-20T12:00:00Z")
assert.equal(model.relativeTime("2026-08-20T11:59:30Z", now), "just now")
assert.equal(model.relativeTime("2026-08-20T11:10:00Z", now), "50m")
assert.equal(model.relativeTime("2026-08-19T12:00:00Z", now), "1d")

assert.equal(model.truncate("short", 10), "short")
assert.equal(model.truncate("abcdefghijk", 8), "abcdefg…")

assert.equal(model.typeLabel("PullRequest"), "PR")
assert.equal(model.reasonLabel("mention"), "mentioned")
assert.equal(model.monthLabel("2026-08-20"), "Aug")
assert.equal(JSON.stringify(model.monthLabels(parsed.weeks)), JSON.stringify([{ index: 0, label: "Aug" }]))

const padded = model.padWeeks([{ days: [{ date: "2026-08-20", count: 7, level: "SECOND_QUARTILE", weekday: 4 }] }])
assert.equal(padded[0].days.length, 7)
assert.equal(padded[0].days[4].date, "2026-08-20")
assert.equal(padded[0].days[0].date, "")
assert.match(model.dayTooltip(days[1]), /1 contribution/)

const marked = model.markLocalRead(parsed.notifications, "2")
assert.equal(marked[1].unread, false)
assert.equal(marked[0].unread, true)

const removed = model.removeLocal(parsed.notifications, "2")
assert.equal(removed.length, 2)
assert.equal(removed[0].id, "1")
assert.equal(removed[1].id, "3")

assert.equal(model.intSetting("15", 120, 30, 3600), 30)
assert.equal(model.intSetting("90", 120, 30, 3600), 90)

console.log("ok")
