.pragma library

// Pure helpers shared by Service.qml, BarWidget.qml, and Panel.qml.
// No QML types, so node can run the same functions in model.test.mjs.

// GitHub error messages, helper stderr, and a configured username echoed back
// by an API error are all attacker-influenced. safeText keeps such a string
// from ever being read as markup: Qt's Text.AutoText calls mightBeRichText(),
// which turns a value into HTML as soon as it finds a tag, and an <img src>
// in an HTML-parsed label makes the shell fetch a remote resource. Dropping
// angle brackets means no tag can be formed; entities like &lt; may still
// decode to visible text but never back into a tag, so nothing loads.
function safeText(value, limit) {
  var text = String(value === undefined || value === null ? "" : value)
  var out = ""
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    if (code === 0x3c || code === 0x3e) continue
    // Control characters, C1, and line/paragraph separators become spaces.
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)
        || code === 0x2028 || code === 0x2029) {
      out += " "
      continue
    }
    out += text.charAt(i)
  }
  out = out.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "")
  var max = limit || 240
  if (out.length > max) out = out.slice(0, max - 1) + "\u2026"
  return out
}

// GitHub logins are ASCII letters, digits, and hyphens, at most 39 characters.
function safeLogin(login) {
  return String(login === undefined || login === null ? "" : login)
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 39)
}

// Phrases the plugin itself owns. The bar tooltip is a shell-wide Text with
// textFormat left at Text.AutoText, so only these strings may reach it.
var ERROR_PHRASES = {
  helper: "plugin helper missing",
  cli: "gh CLI not found",
  network: "cannot reach GitHub",
  username: "check the username setting",
  notifications: "inbox needs: gh auth refresh -s notifications",
  auth: "sign in with gh",
  unknown: "open the panel for details"
}

// Reads untrusted text but only ever returns one of the keys above, so no
// remote bytes travel with the result. A crafted message can pick a wrong
// bucket; it cannot smuggle content out.
function errorKind(error, hint) {
  var text = (String(error || "") + " " + String(hint || "")).toLowerCase()
  if (!text.replace(/\s+/g, "").length) return ""
  if (text.indexOf("helper") !== -1) return "helper"
  if (text.indexOf("github cli") !== -1 || text.indexOf("install gh") !== -1) return "cli"
  // Before the auth checks: the notifications hint mentions `gh auth refresh`.
  if (text.indexOf("notification") !== -1) return "notifications"
  if (text.indexOf("could not reach") !== -1 || text.indexOf("network") !== -1
      || text.indexOf("timeout") !== -1 || text.indexOf("timed out") !== -1
      || text.indexOf("dial tcp") !== -1 || text.indexOf("no such host") !== -1) return "network"
  if (text.indexOf("user not found") !== -1 || text.indexOf("could not resolve to a user") !== -1
      || text.indexOf("username") !== -1) return "username"
  if (text.indexOf("not signed in") !== -1 || text.indexOf("auth") !== -1
      || text.indexOf("credential") !== -1 || text.indexOf("401") !== -1
      || text.indexOf("403") !== -1) return "auth"
  return "unknown"
}

function errorPhrase(error, hint) {
  var kind = errorKind(error, hint)
  if (!kind) return ""
  return ERROR_PHRASES[kind] || ERROR_PHRASES.unknown
}

// Safe replacement for putting service.lastError in WidgetButton.tooltipText.
function barErrorText(error, hint) {
  return "GitHub \u00b7 " + (errorPhrase(error, hint) || ERROR_PHRASES.auth)
}

function emptySnapshot() {
  return {
    ok: false,
    authenticated: false,
    login: "",
    totalContributions: 0,
    weeks: [],
    notifications: [],
    unread: 0,
    error: "",
    hint: "",
    fetchedAt: ""
  }
}

function parseSnapshot(raw) {
  var fallback = emptySnapshot()
  var text = String(raw || "").replace(/^\s+/, "")
  if (!text.length) return fallback
  try {
    var data = JSON.parse(text)
    if (!data || typeof data !== "object") return fallback
    return {
      ok: data.ok === true,
      authenticated: data.authenticated === true,
      login: safeLogin(data.login),
      totalContributions: Number(data.totalContributions || 0) || 0,
      weeks: Array.isArray(data.weeks) ? data.weeks : [],
      notifications: Array.isArray(data.notifications) ? data.notifications : [],
      unread: Number(data.unread || 0) || 0,
      // Helper output is untrusted: neutralise it once, here.
      error: safeText(data.error, 240),
      hint: safeText(data.hint, 160),
      fetchedAt: String(data.fetchedAt || "")
    }
  } catch (e) {
    fallback.error = "Could not parse GitHub stats"
    return fallback
  }
}

function flattenDays(weeks) {
  var out = []
  var list = weeks || []
  for (var i = 0; i < list.length; i++) {
    var days = list[i] && list[i].days ? list[i].days : []
    for (var j = 0; j < days.length; j++) {
      var day = days[j]
      if (!day || !day.date) continue
      out.push({
        date: String(day.date),
        count: Number(day.count || 0) || 0,
        level: String(day.level || "NONE"),
        weekday: Number(day.weekday || 0) || 0
      })
    }
  }
  return out
}

// GitHub draws empty boxes for days that have not happened yet this week.
// Keep those out of flattenDays so streaks do not see fake zeros after today.
function padWeeks(weeks) {
  var out = []
  var list = weeks || []
  for (var i = 0; i < list.length; i++) {
    var byWeekday = {}
    var days = list[i] && list[i].days ? list[i].days : []
    for (var j = 0; j < days.length; j++) {
      var day = days[j]
      if (!day) continue
      byWeekday[Number(day.weekday || 0) || 0] = {
        date: String(day.date || ""),
        count: Number(day.count || 0) || 0,
        level: String(day.level || "NONE"),
        weekday: Number(day.weekday || 0) || 0
      }
    }
    var padded = []
    for (var w = 0; w < 7; w++) {
      padded.push(byWeekday[w] || { date: "", count: 0, level: "NONE", weekday: w })
    }
    out.push({ days: padded })
  }
  return out
}

function lastDays(days, count) {
  var list = days || []
  var n = Math.max(0, count | 0)
  if (n === 0 || list.length <= n) return list.slice()
  return list.slice(list.length - n)
}

function currentStreak(days) {
  var list = days || []
  if (list.length === 0) return 0
  var streak = 0
  for (var i = list.length - 1; i >= 0; i--) {
    if ((list[i].count || 0) > 0) {
      streak++
      continue
    }
    // Today with zero still keeps yesterday's streak alive.
    if (i === list.length - 1 && streak === 0) continue
    break
  }
  return streak
}

function longestStreak(days) {
  var list = days || []
  var best = 0
  var run = 0
  for (var i = 0; i < list.length; i++) {
    if ((list[i].count || 0) > 0) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

function badgeText(count) {
  var n = Math.max(0, count | 0)
  if (n === 0) return ""
  return n > 99 ? "99+" : String(n)
}

function isCi(notification) {
  if (!notification) return false
  return notification.reason === "ci_activity" || notification.type === "CheckSuite"
}

function filterNotifications(list, unreadOnly, excludeCi) {
  var out = []
  var rows = list || []
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (!row) continue
    if (unreadOnly && !row.unread) continue
    if (excludeCi && isCi(row)) continue
    out.push(row)
  }
  return out
}

function unreadCount(list, excludeCi) {
  var n = 0
  var rows = list || []
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i] || !rows[i].unread) continue
    if (excludeCi && isCi(rows[i])) continue
    n++
  }
  return n
}

function notificationUrl(notification) {
  if (!notification) return "https://github.com/notifications"
  var api = String(notification.apiUrl || "")
  var repo = String(notification.repo || "")
  var type = String(notification.type || "")
  var reason = String(notification.reason || "")
  var match

  match = api.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)/)
  if (match) return "https://github.com/" + match[1] + "/pull/" + match[2]

  match = api.match(/\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)/)
  if (match) return "https://github.com/" + match[1] + "/issues/" + match[2]

  match = api.match(/\/repos\/([^/]+\/[^/]+)\/commits\/([0-9a-fA-F]+)/)
  if (match) return "https://github.com/" + match[1] + "/commit/" + match[2]

  match = api.match(/\/repos\/([^/]+\/[^/]+)\/releases\//)
  if (match) return "https://github.com/" + match[1] + "/releases"

  match = api.match(/\/repos\/([^/]+\/[^/]+)\/discussions\/(\d+)/)
  if (match) return "https://github.com/" + match[1] + "/discussions/" + match[2]

  if (type === "CheckSuite" || reason === "ci_activity") {
    return repo ? "https://github.com/" + repo + "/actions" : "https://github.com/notifications"
  }

  if (repo) return "https://github.com/" + repo
  return "https://github.com/notifications"
}

function relativeTime(iso, nowMs) {
  var then = Date.parse(String(iso || ""))
  if (!isFinite(then)) return ""
  var now = Number(nowMs)
  if (!isFinite(now)) now = Date.now()
  var sec = Math.max(0, Math.floor((now - then) / 1000))
  if (sec < 45) return "just now"
  var min = Math.floor(sec / 60)
  if (min < 60) return min + "m"
  var hr = Math.floor(min / 60)
  if (hr < 24) return hr + "h"
  var day = Math.floor(hr / 24)
  if (day < 7) return day + "d"
  var week = Math.floor(day / 7)
  if (week < 5) return week + "w"
  return String(iso).slice(0, 10)
}

function truncate(text, limit) {
  var value = String(text === undefined || text === null ? "" : text)
  var max = limit || 72
  if (value.length <= max) return value
  return value.slice(0, max - 1) + "\u2026"
}

function typeGlyph(type) {
  switch (String(type || "")) {
    case "PullRequest": return "\uea64"
    case "Issue": return "\uf41b"
    case "Commit": return "\uea19"
    case "Release": return "\uf412"
    case "Discussion": return "\uf442"
    case "CheckSuite": return "\uea76"
    default: return "\uf0a2"
  }
}

function typeLabel(type) {
  switch (String(type || "")) {
    case "PullRequest": return "PR"
    case "Issue": return "Issue"
    case "Commit": return "Commit"
    case "Release": return "Release"
    case "Discussion": return "Discussion"
    case "CheckSuite": return "Actions"
    default: return type || "Notice"
  }
}

function reasonLabel(reason) {
  switch (String(reason || "")) {
    case "mention": return "mentioned"
    case "review_requested": return "review"
    case "assign": return "assigned"
    case "author": return "author"
    case "comment": return "comment"
    case "ci_activity": return "CI"
    case "subscribed": return "watching"
    case "team_mention": return "team"
    case "state_change": return "updated"
    case "security_alert": return "security"
    default: return reason || ""
  }
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function monthLabel(isoDate) {
  var parts = String(isoDate || "").split("-")
  if (parts.length < 2) return ""
  var month = parseInt(parts[1], 10)
  if (!isFinite(month) || month < 1 || month > 12) return ""
  return MONTHS[month - 1]
}

function monthLabels(weeks) {
  var labels = []
  var last = ""
  var lastIndex = -99
  var list = weeks || []
  for (var i = 0; i < list.length; i++) {
    var days = list[i] && list[i].days ? list[i].days : []
    var date = ""
    for (var j = 0; j < days.length; j++) {
      if (days[j] && days[j].date) { date = String(days[j].date); break }
    }
    if (!date) continue
    var key = date.slice(0, 7)
    if (key === last) continue
    // A 3-letter month name is wider than two heatmap weeks; skip a label
    // that would paint on top of the previous one.
    if (labels.length > 0 && i - lastIndex < 4) continue
    last = key
    lastIndex = i
    labels.push({ index: i, label: monthLabel(date) })
  }
  return labels
}

function dayTooltip(day) {
  if (!day || !day.date) return ""
  var count = Number(day.count || 0) || 0
  var noun = count === 1 ? "contribution" : "contributions"
  return day.date + " \u00b7 " + count + " " + noun
}

function pluginFilePath(url) {
  var value = String(url || "")
  if (value.indexOf("file://") === 0) value = value.substring(7)
  if (value.length > 1 && value.charAt(value.length - 1) === "/")
    value = value.substring(0, value.length - 1)
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

function intSetting(value, fallback, min, max) {
  var n = parseInt(String(value === undefined || value === null ? fallback : value), 10)
  if (!isFinite(n)) n = fallback
  if (n < min) n = min
  if (n > max) n = max
  return n
}

function markLocalRead(list, id) {
  var out = []
  var rows = list || []
  var target = String(id || "")
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (!row) continue
    if (String(row.id) === target) {
      var copy = {}
      for (var key in row) copy[key] = row[key]
      copy.unread = false
      out.push(copy)
    } else {
      out.push(row)
    }
  }
  return out
}

function removeLocal(list, id) {
  var out = []
  var rows = list || []
  var target = String(id || "")
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    if (!row) continue
    if (String(row.id) === target) continue
    out.push(row)
  }
  return out
}

function withNotifications(snapshot, list) {
  var src = snapshot || emptySnapshot()
  var rows = list || []
  return {
    ok: src.ok === true,
    authenticated: src.authenticated === true,
    login: safeLogin(src.login),
    totalContributions: Number(src.totalContributions || 0) || 0,
    weeks: src.weeks || [],
    notifications: rows,
    unread: unreadCount(rows, false),
    error: safeText(src.error, 240),
    hint: safeText(src.hint, 160),
    fetchedAt: String(src.fetchedAt || "")
  }
}
