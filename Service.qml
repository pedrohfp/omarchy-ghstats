import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Model.js" as Model

// Owns gh polling for one bar instance. BarWidget injects settings + pluginDir.
Item {
  id: root

  property string pluginDir: ""
  property var settings: ({})

  property var snapshot: Model.emptySnapshot()
  property bool refreshing: false
  property string lastError: ""

  readonly property string username: String(setting("username", "")).replace(/^\s+|\s+$/g, "")
  readonly property int refreshIntervalSec: Model.intSetting(setting("refreshIntervalSec", 120), 120, 30, 3600)
  readonly property bool excludeCi: setting("excludeCi", true) === true

  readonly property var days: Model.flattenDays(snapshot.weeks)
  readonly property var recentDays: Model.lastDays(days, 7)
  readonly property var weeks: snapshot.weeks || []
  readonly property var notifications: snapshot.notifications || []
  readonly property int streak: Model.currentStreak(days)
  readonly property int visibleUnread: Model.unreadCount(notifications, excludeCi)
  readonly property bool authenticated: snapshot.authenticated === true
  readonly property bool ok: snapshot.ok === true
  readonly property string login: snapshot.login || ""
  readonly property int totalContributions: snapshot.totalContributions || 0
  readonly property string hint: snapshot.hint || ""

  readonly property string helperPath: pluginDir
    ? pluginDir + "/bin/ghstats"
    : Model.pluginFilePath(Qt.resolvedUrl("bin/ghstats"))

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function refresh() {
    if (snapshotProc.running) return
    if (!helperPath || helperPath === "/bin/ghstats") {
      lastError = "Plugin helper missing"
      return
    }
    refreshing = true
    _snapshotOut = ""
    _snapshotErr = ""
    var cmd = [helperPath, "snapshot"]
    if (username.length > 0) {
      cmd.push("--user")
      cmd.push(username)
    }
    snapshotProc.command = cmd
    snapshotProc.running = true
  }

  function markRead(id) {
    if (!id || markProc.running) return
    snapshot = Model.withNotifications(snapshot, Model.markLocalRead(notifications, id))
    markProc.command = [helperPath, "mark-read", String(id)]
    markProc.running = true
  }

  // GitHub inbox "Done": DELETE the thread so it leaves the list, same as `e` on github.com.
  property var doneQueue: []

  function markDone(id) {
    if (!id) return
    snapshot = Model.withNotifications(snapshot, Model.removeLocal(notifications, id))
    doneQueue = doneQueue.concat([String(id)])
    pumpDone()
  }

  function pumpDone() {
    if (doneProc.running || doneQueue.length === 0) return
    var next = doneQueue[0]
    doneQueue = doneQueue.slice(1)
    doneProc.command = [helperPath, "done", next]
    doneProc.running = true
  }

  function openUrl(url) {
    var target = String(url || "")
    if (!target.length) return
    Quickshell.execDetached(["omarchy-launch-browser", target])
  }

  property string _snapshotOut: ""
  property string _snapshotErr: ""

  onUsernameChanged: Qt.callLater(refresh)
  onHelperPathChanged: Qt.callLater(refresh)

  Timer {
    id: refreshTimer
    interval: Math.max(30, root.refreshIntervalSec) * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  Process {
    id: snapshotProc
    running: false
    command: []
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._snapshotOut = text
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._snapshotErr = text
    }
    onExited: function (exitCode) {
      root.refreshing = false
      var parsed = Model.parseSnapshot(root._snapshotOut)
      if (parsed.ok || parsed.login) {
        root.snapshot = parsed
        root.lastError = parsed.error
        return
      }
      if (!root.snapshot.ok) root.snapshot = parsed
      // parseSnapshot already sanitised its own error; raw stderr has not been.
      root.lastError = parsed.error
        || Model.safeText(root._snapshotErr, 240)
        || "Could not load GitHub stats"
    }
  }

  Process {
    id: markProc
    running: false
    command: []
    stdout: StdioCollector { waitForEnd: true }
    onExited: function (exitCode) {
      if (exitCode !== 0) Qt.callLater(root.refresh)
    }
  }

  Process {
    id: doneProc
    running: false
    command: []
    stdout: StdioCollector { waitForEnd: true }
    onExited: function (exitCode) {
      if (exitCode !== 0) Qt.callLater(root.refresh)
      Qt.callLater(root.pumpDone)
    }
  }
}
