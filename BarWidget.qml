import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.ricky.ghstats"

  readonly property string glyph: "\uf09b"

  readonly property string pluginDir: Model.pluginFilePath(Qt.resolvedUrl("."))
  readonly property bool showHeatmap: root.setting("showHeatmap", true) === true && !root.vertical
  readonly property bool showCount: root.setting("showUnreadCount", true) === true
  readonly property bool hideWhenEmpty: root.setting("hideWhenEmpty", false) === true
  readonly property int visibleUnread: service.visibleUnread
  readonly property string badge: Model.badgeText(visibleUnread)

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }

  function injectPanel() {
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
    panelLoader.item.service = service
    panelLoader.item.settings = root.settings
  }

  function refresh() {
    service.refresh()
  }

  function openInbox() {
    service.openUrl("https://github.com/notifications")
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  visible: !root.hideWhenEmpty || root.visibleUnread > 0 || root.opened

  onBarChanged: injectPanel()
  onSettingsChanged: {
    service.settings = root.settings
    injectPanel()
  }

  Service {
    id: service
    pluginDir: root.pluginDir
    settings: root.settings
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    hasVisualContent: true
    labelVisible: false
    active: root.visibleUnread > 0
    dimmed: !service.authenticated && !service.refreshing
    // The shell paints tooltipText in one Text shared by the whole bar, and
    // that Text leaves textFormat at Text.AutoText. Untrusted strings must not
    // land here: markup in a GitHub error message would make omarchy-shell
    // load a remote resource on hover. Only plugin-owned phrases and the
    // sanitised login go in; the full error text stays in Panel.qml, which
    // renders it with textFormat: Text.PlainText.
    tooltipText: {
      if (!service.authenticated && !service.refreshing)
        return Model.barErrorText(service.lastError, service.hint)
      var bits = []
      if (service.login) bits.push("@" + service.login)
      bits.push(service.totalContributions + " this year")
      if (service.streak > 0) bits.push(service.streak + " day streak")
      if (root.visibleUnread > 0) bits.push(root.visibleUnread + " unread")
      var phrase = Model.errorPhrase(service.lastError, service.hint)
      if (phrase) bits.push(phrase)
      return bits.join(" \u00b7 ")
    }
    fixedWidth: root.vertical
      ? root.barSize
      : Math.max(Style.space(28), contents.implicitWidth + Style.space(14))
    fixedHeight: root.barSize

    onPressed: function (buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
      else if (buttonCode === Qt.MiddleButton) root.refresh()
      else if (buttonCode === Qt.RightButton) root.openInbox()
    }

    Row {
      id: contents
      anchors.centerIn: parent
      spacing: Style.space(6)
      visible: !root.vertical

      Text {
        anchors.verticalCenter: parent.verticalCenter
        text: root.glyph
        color: button.active && button.useActiveColor
          ? button.activeColor
          : (root.bar ? root.bar.barForeground : Color.foreground)
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.font.body
      }

      ContributionGrid {
        visible: root.showHeatmap && service.recentDays.length > 0
        anchors.verticalCenter: parent.verticalCenter
        mode: "strip"
        days: service.recentDays
        todayKey: Qt.formatDate(new Date(), "yyyy-MM-dd")
        accent: Color.accent
        empty: root.bar ? root.bar.barForeground : Color.muted
        foreground: root.bar ? root.bar.barForeground : Color.foreground
        fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
        cellSize: Math.max(6, Style.space(8))
        cellGap: Style.space(2)
        showWeekdays: false
        showMonths: false
        interactive: false
      }

      Text {
        visible: root.showCount && root.badge.length > 0
        anchors.verticalCenter: parent.verticalCenter
        text: root.badge
        color: button.active && button.useActiveColor
          ? button.activeColor
          : (root.bar ? root.bar.barForeground : Color.foreground)
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.font.body
      }
    }

    Text {
      visible: root.vertical
      anchors.centerIn: parent
      text: root.glyph
      color: button.active && button.useActiveColor
        ? button.activeColor
        : (root.bar ? root.bar.barForeground : Color.foreground)
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.body
    }
  }
}
