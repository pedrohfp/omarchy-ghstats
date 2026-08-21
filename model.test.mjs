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

const titleBlock = panel.match(/text:\s*Model\.truncate\(modelData\.title,\s*78\)[\s\S]{0,400}/)
assert.ok(titleBlock, "notification title Text is missing")
assert.match(titleBlock[0], /textFormat:\s*Text\.PlainText/)

// The panel keeps the full error text, so it must stay plain text.
const panelErrorBlock = panel.match(/return\s+root\.service\.lastError[\s\S]{0,200}/)
assert.ok(panelErrorBlock, "panel error Text is missing")
assert.match(panelErrorBlock[0], /textFormat:\s*Text\.PlainText/)

// WidgetButton.tooltipText reaches a shell-wide Text that uses Text.AutoText,
// so untrusted GitHub / helper strings must not be forwarded into it.
const tooltipBlock = barWidget.match(/tooltipText:\s*\{[\s\S]*?\n    \}/)
assert.ok(tooltipBlock, "bar tooltipText block is missing")
assert.match(tooltipBlock[0], /Model\.barErrorText\(/)
assert.match(tooltipBlock[0], /Model\.errorPhrase\(/)
assert.doesNotMatch(tooltipBlock[0], /return\s+service\.lastError/)
assert.doesNotMatch(tooltipBlock[0], /bits\.push\([^)]*lastError/)
assert.doesNotMatch(tooltipBlock[0], /service\.(hint|lastError)\s*\|\|/)

const service = fs.readFileSync(new URL("./Service.qml", import.meta.url), "utf8")
assert.match(service, /Model\.safeText\(root\._snapshotErr/)
assert.doesNotMatch(service, /String\(root\._snapshotErr/)

const hostile = '<img src="http://127.0.0.1:9/x.png">'

assert.equal(model.safeText(""), "")
assert.equal(model.safeText(null), "")
assert.equal(model.safeText("  spaced \n out  "), "spaced out")
assert.equal(model.safeText("a\u0007b\u009fc"), "a b c")
assert.equal(model.safeText("line\u2028break"), "line break")
assert.equal(model.safeText(hostile), 'img src="http://127.0.0.1:9/x.png"')
assert.doesNotMatch(model.safeText(hostile), /[<>]/)
assert.equal(model.safeText("abcdefghijk", 8), "abcdefg\u2026")
// Entity-only input may still trip mightBeRichText, but with no angle bracket
// left it cannot form a tag, so nothing is fetched.
assert.doesNotMatch(model.safeText("&lt;img src=x&gt;"), /[<>]/)

assert.equal(model.safeLogin("srineshr1"), "srineshr1")
assert.equal(model.safeLogin("octo-cat"), "octo-cat")
assert.equal(model.safeLogin(hostile), "imgsrchttp127.0.0.19x.png".replace(/[^A-Za-z0-9-]/g, ""))
assert.doesNotMatch(model.safeLogin(hostile), /[<>"/:.]/)
assert.equal(model.safeLogin("x".repeat(80)).length, 39)

// parseSnapshot is the single choke point for helper output.
const hostileSnapshot = model.parseSnapshot(JSON.stringify({
  ok: false,
  authenticated: false,
  login: hostile,
  error: `User not found: ${hostile}`,
  hint: `Set a valid GitHub username ${hostile}`
}))
assert.doesNotMatch(hostileSnapshot.error, /[<>]/)
assert.doesNotMatch(hostileSnapshot.hint, /[<>]/)
assert.doesNotMatch(hostileSnapshot.login, /[<>]/)
const carried = model.withNotifications(hostileSnapshot, [])
assert.doesNotMatch(carried.error, /[<>]/)
assert.doesNotMatch(carried.hint, /[<>]/)
assert.doesNotMatch(carried.login, /[<>]/)

assert.equal(model.errorKind("", ""), "")
assert.equal(model.errorKind("   ", "  "), "")
assert.equal(model.errorKind("Plugin helper missing", ""), "helper")
assert.equal(model.errorKind("GitHub CLI (gh) was not found", "Install gh"), "cli")
assert.equal(model.errorKind("Could not reach GitHub", "Run: gh auth login"), "network")
assert.equal(
  model.errorKind("Could not read GitHub notifications", "Run: gh auth refresh -s notifications"),
  "notifications"
)
assert.equal(
  model.errorKind("Could not resolve to a User with the login of 'nope'.", "Check the username"),
  "username"
)
assert.equal(model.errorKind("Not signed in to GitHub", "Run: gh auth login"), "auth")
assert.equal(model.errorKind("Bad credentials", ""), "auth")
assert.equal(model.errorKind("something odd happened", ""), "unknown")

assert.equal(model.errorPhrase("", ""), "")
assert.equal(model.barErrorText("", ""), "GitHub \u00b7 sign in with gh")
assert.equal(model.barErrorText("Not signed in to GitHub", "Run: gh auth login"), "GitHub \u00b7 sign in with gh")
assert.equal(model.barErrorText("Plugin helper missing", ""), "GitHub \u00b7 plugin helper missing")

// Whatever GitHub or the helper says, the bar tooltip stays one of ours.
const allowedBarTooltips = new Set(
  ["sign in with gh", "plugin helper missing", "gh CLI not found", "cannot reach GitHub",
    "check the username setting", "inbox needs: gh auth refresh -s notifications",
    "open the panel for details"].map((phrase) => `GitHub \u00b7 ${phrase}`)
)
const crafted = [
  `User not found: ${hostile}`,
  `${hostile} could not reach GitHub`,
  `<!doctype html><body background="http://127.0.0.1:9/x">`,
  "&lt;img src=http://127.0.0.1:9/x&gt;",
  '<style>@import url("http://127.0.0.1:9/x.css")</style>',
  "\u003cimg src='http://127.0.0.1:9/x'\u003e notifications",
  "x".repeat(5000) + hostile
]
for (const value of crafted) {
  for (const hint of ["", hostile]) {
    const text = model.barErrorText(value, hint)
    assert.ok(allowedBarTooltips.has(text), `bar tooltip leaked: ${text}`)
    assert.doesNotMatch(text, /[<>]/)
    assert.doesNotMatch(text, /127\.0\.0\.1|img|http/)
    const phrase = model.errorPhrase(value, hint)
    if (phrase) assert.ok(allowedBarTooltips.has(`GitHub \u00b7 ${phrase}`), `phrase leaked: ${phrase}`)
  }
}

// Regex checks above prove the sink was rewritten; run the QML expression
// itself to prove the rewrite behaves. Bindings mirror Service.qml.
const evalTooltip = new Function(
  "Model", "service", "root",
  tooltipBlock[0].replace(/^tooltipText:\s*\{/, "").replace(/\}\s*$/, "")
)

function stubService(raw, refreshing) {
  const snap = model.parseSnapshot(JSON.stringify(raw))
  return {
    authenticated: snap.authenticated,
    refreshing: refreshing === true,
    login: snap.login,
    totalContributions: snap.totalContributions,
    streak: model.currentStreak(model.flattenDays(snap.weeks)),
    lastError: snap.error,
    hint: snap.hint,
    visibleUnread: model.unreadCount(snap.notifications, true)
  }
}

const failedService = stubService({
  ok: false,
  authenticated: false,
  login: hostile,
  error: `User not found: ${hostile}`,
  hint: `Set a valid GitHub username ${hostile}`
})
const failedTooltip = evalTooltip(model, failedService, { visibleUnread: 0 })
assert.ok(allowedBarTooltips.has(failedTooltip), `bar tooltip leaked: ${failedTooltip}`)

const scopeService = stubService({
  ok: true,
  authenticated: true,
  login: "octo-cat",
  totalContributions: 417,
  error: `Could not read GitHub notifications ${hostile}`,
  hint: "Run: gh auth refresh -s notifications",
  notifications: [{ id: "1", unread: true, reason: "mention", type: "Issue", title: "hi" }]
})
const scopeTooltip = evalTooltip(model, scopeService, { visibleUnread: scopeService.visibleUnread })
assert.equal(
  scopeTooltip,
  "@octo-cat \u00b7 417 this year \u00b7 1 unread \u00b7 inbox needs: gh auth refresh -s notifications"
)
assert.doesNotMatch(scopeTooltip, /[<>]/)
assert.doesNotMatch(scopeTooltip, /127\.0\.0\.1|img|http/)

const healthyService = stubService({
  ok: true,
  authenticated: true,
  login: "octo-cat",
  totalContributions: 417,
  weeks: [{ days: [{ date: "2026-08-20", count: 3, level: "SECOND_QUARTILE", weekday: 4 }] }]
})
assert.equal(
  evalTooltip(model, healthyService, { visibleUnread: 0 }),
  "@octo-cat \u00b7 417 this year \u00b7 1 day streak"
)

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
