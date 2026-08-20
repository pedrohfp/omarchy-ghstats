import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// GitHub-style heatmap. "calendar" is 7 rows × N weeks; "strip" is one row.
Item {
  id: root

  property string mode: "calendar"
  property var weeks: []
  property var days: []
  property string todayKey: ""
  property color accent: Color.accent
  property color empty: Color.muted
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  property int cellSize: Style.space(10)
  property int cellGap: Style.space(2)
  property bool showWeekdays: mode === "calendar"
  property bool showMonths: mode === "calendar"
  property bool interactive: mode === "calendar"

  readonly property int rows: 7
  readonly property var stripDays: mode === "strip" ? (days || []) : []
  readonly property var calendarWeeks: mode === "calendar" ? (weeks || []) : []
  readonly property var labels: showMonths ? Model.monthLabels(calendarWeeks) : []
  readonly property int weekdayWidth: showWeekdays ? Style.space(16) : 0
  readonly property int monthHeight: showMonths ? Style.space(14) : 0

  readonly property int gridWidth: mode === "strip"
    ? stripDays.length * cellSize + Math.max(0, stripDays.length - 1) * cellGap
    : calendarWeeks.length * cellSize + Math.max(0, calendarWeeks.length - 1) * cellGap
  readonly property int gridHeight: mode === "strip"
    ? cellSize
    : rows * cellSize + (rows - 1) * cellGap

  implicitWidth: weekdayWidth + gridWidth
  implicitHeight: monthHeight + gridHeight

  function fillFor(level) {
    var a = root.accent
    switch (String(level || "NONE")) {
      case "FOURTH_QUARTILE": return a
      case "THIRD_QUARTILE": return Qt.rgba(a.r, a.g, a.b, 0.78)
      case "SECOND_QUARTILE": return Qt.rgba(a.r, a.g, a.b, 0.52)
      case "FIRST_QUARTILE": return Qt.rgba(a.r, a.g, a.b, 0.28)
      default: return Qt.rgba(root.empty.r, root.empty.g, root.empty.b, 0.28)
    }
  }

  function weekdayCaption(row) {
    if (row === 1) return "M"
    if (row === 3) return "W"
    if (row === 5) return "F"
    return ""
  }

  // Month names sit above the first week of each month.
  Repeater {
    model: root.showMonths ? root.labels : []
    Text {
      required property var modelData
      x: root.weekdayWidth + modelData.index * (root.cellSize + root.cellGap)
      y: 0
      height: root.monthHeight
      text: modelData.label
      color: Qt.darker(root.foreground, 1.45)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      verticalAlignment: Text.AlignVCenter
      visible: text !== ""
    }
  }

  Column {
    id: weekdayCol
    visible: root.showWeekdays
    x: 0
    y: root.monthHeight
    width: root.weekdayWidth
    spacing: root.cellGap
    Repeater {
      model: root.rows
      Text {
        required property int index
        width: weekdayCol.width
        height: root.cellSize
        text: root.weekdayCaption(index)
        color: Qt.darker(root.foreground, 1.45)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        horizontalAlignment: Text.AlignLeft
        verticalAlignment: Text.AlignVCenter
      }
    }
  }

  // Year calendar: a column of 7 days per week.
  Row {
    visible: root.mode === "calendar"
    x: root.weekdayWidth
    y: root.monthHeight
    spacing: root.cellGap
    Repeater {
      model: root.calendarWeeks
      Column {
        required property var modelData
        spacing: root.cellGap
        Repeater {
          model: modelData.days || []
          DayCell {
            required property var modelData
            day: modelData
          }
        }
      }
    }
  }

  // Compact last-N-days strip for the bar.
  Row {
    visible: root.mode === "strip"
    x: 0
    y: 0
    spacing: root.cellGap
    Repeater {
      model: root.stripDays
      DayCell {
        required property var modelData
        day: modelData
      }
    }
  }

  component DayCell: Rectangle {
    property var day: ({})
    width: root.cellSize
    height: root.cellSize
    radius: Math.min(2, Style.cornerRadius)
    color: root.fillFor(day ? day.level : "NONE")
    border.width: day && day.date && day.date === root.todayKey ? 1 : 0
    border.color: root.foreground

    MouseArea {
      id: mouse
      anchors.fill: parent
      hoverEnabled: root.interactive
      acceptedButtons: Qt.NoButton
      enabled: root.interactive
    }

    PanelToolTip {
      visible: root.interactive && mouse.containsMouse && text.length > 0
      text: Model.dayTooltip(day)
      fontFamily: root.fontFamily
    }
  }
}
