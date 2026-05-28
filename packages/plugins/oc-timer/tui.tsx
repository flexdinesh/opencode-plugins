/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal } from "solid-js"

const TIMER_PREFIX = "oc-time.elapsed."
const SECOND_MS = 1000

type SessionTimer = {
  elapsedMs: number
  activeStartAt?: number
}

type TimeTracker = {
  timerBySessionID: Record<string, SessionTimer>
}

function timerKey(sessionID: string) {
  return `${TIMER_PREFIX}${sessionID}`
}

function validElapsed(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(Math.max(0, ms) / SECOND_MS)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const paddedSeconds = seconds.toString().padStart(2, "0")

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m ${paddedSeconds}s`
  return `${minutes}m ${paddedSeconds}s`
}

function SidebarFooter(props: {
  api: Parameters<TuiPlugin>[0]
  sessionID: string
  tracker: TimeTracker
  version: () => number
  clock: () => number
  ensureSession: (sessionID: string) => SessionTimer
  resumeSession: (sessionID: string, now?: number) => void
}) {
  props.ensureSession(props.sessionID)

  const text = createMemo(() => {
    props.version()
    const now = props.clock()
    const status = props.api.state.session.status(props.sessionID)
    if (status && status.type !== "idle") props.resumeSession(props.sessionID, now)

    const timer = props.ensureSession(props.sessionID)
    const activeMs = timer.activeStartAt ? Math.max(0, now - timer.activeStartAt) : 0
    return formatElapsed(timer.elapsedMs + activeMs)
  })

  return (
    <>
      <text fg={props.api.theme.current.warning} bold>
        {text()}
      </text>
      <text fg={props.api.theme.current.textMuted}>·</text>
    </>
  )
}

const tui: TuiPlugin = async (api) => {
  const tracker: TimeTracker = {
    timerBySessionID: {},
  }
  const seenSessionIDs = new Set<string>()
  const [version, setVersion] = createSignal(0)
  const [clock, setClock] = createSignal(Date.now())

  const bump = () => setVersion((value) => value + 1)

  const ensureSession = (sessionID: string) => {
    seenSessionIDs.add(sessionID)
    const existing = tracker.timerBySessionID[sessionID]
    if (existing) return existing

    const timer = {
      elapsedMs: validElapsed(api.kv.get<number>(timerKey(sessionID), 0)),
    }
    tracker.timerBySessionID[sessionID] = timer
    return timer
  }

  const persistSession = (sessionID: string, timer: SessionTimer) => {
    api.kv.set(timerKey(sessionID), Math.floor(timer.elapsedMs))
  }

  const pauseSession = (sessionID: string, now = Date.now()) => {
    const timer = ensureSession(sessionID)
    if (!timer.activeStartAt) return
    timer.elapsedMs += Math.max(0, now - timer.activeStartAt)
    timer.activeStartAt = undefined
    persistSession(sessionID, timer)
    bump()
  }

  const resumeSession = (sessionID: string, now = Date.now()) => {
    const timer = ensureSession(sessionID)
    if (timer.activeStartAt) return
    timer.activeStartAt = now
    bump()
  }

  const settleSession = (sessionID: string, now = Date.now()) => {
    const timer = ensureSession(sessionID)
    if (timer.activeStartAt) {
      timer.elapsedMs += Math.max(0, now - timer.activeStartAt)
      timer.activeStartAt = now
    }
    persistSession(sessionID, timer)
  }

  const onSessionIdle = api.event.on("session.idle", (evt) => {
    pauseSession(evt.properties.sessionID)
  })

  const onMessage = api.event.on("message.updated", (evt) => {
    resumeSession(evt.properties.sessionID)
  })

  const onPart = api.event.on("message.part.updated", (evt) => {
    resumeSession(evt.properties.sessionID)
  })

  const onDelta = api.event.on("message.part.delta", (evt) => {
    resumeSession(evt.properties.sessionID)
  })

  const timer = setInterval(() => {
    const now = Date.now()
    setClock(now)
    for (const sessionID of seenSessionIDs) {
      const status = api.state.session.status(sessionID)
      if (status?.type === "idle") pauseSession(sessionID, now)
    }
  }, SECOND_MS)

  api.lifecycle.onDispose(() => {
    onSessionIdle()
    onMessage()
    onPart()
    onDelta()
    clearInterval(timer)
    const now = Date.now()
    for (const sessionID of seenSessionIDs) {
      settleSession(sessionID, now)
    }
  })

  api.slots.register({
    slots: {
      session_prompt_right(_ctx, value) {
        return (
          <SidebarFooter
            api={api}
            sessionID={value.session_id}
            tracker={tracker}
            version={version}
            clock={clock}
            ensureSession={ensureSession}
            resumeSession={resumeSession}
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "oc-timer",
  tui,
}

export default plugin
